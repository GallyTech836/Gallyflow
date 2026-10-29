// registroService.js
//
// Registro de servicios (plan Nexus Control): barberías que atienden por
// orden de llegada. Un registro es un documento de negocios/{id}/citas con
// origin: 'registro' y status: 'completed', así Dashboard, /finance/*,
// comisiones y caja lo cuentan sin cambiar sus consultas.
//
// Todo se escribe aquí (servidor), nunca desde el navegador:
//   - el precio se recalcula con el catálogo y el profesional,
//   - la comisión se congela en commissionSnapshot,
//   - fecha y hora son las del servidor (hora del negocio),
//   - el requestId del navegador es el id del documento (reintentos no duplican),
//   - corregir/anular deja historial en citas/{id}/correcciones (nunca se borra).
//
// Los registros NO tienen horario: no ocupan agenda ni se validan solapamientos.

import process from 'node:process';
import * as firestoreAdmin from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { readServicesInTx } from '../pricing/catalogInTx.js';
import { promotionsEnabled, readPromotionContextInTx, withPromotions } from '../pricing/promotionsInTx.js';
import { buildCitaService, summarizeCitaServices } from '../pricing/professionalPricing.js';
import { professionalCanDo } from '../appointments/pendingModel.js';
import { calculateCommission, COMMISSION_TYPE } from '../finance/commissionModel.js';
import { isRealPaymentMethod, localDateKey, localDayStartMillis, round2, toMillis } from '../cash/cashModel.js';
import { getPinHash } from '../finance/pinStore.js';
import { verifyPin } from '../finance/pin.js';
import { sendNotification } from '../notificationService.js';

const TZ = process.env.APP_TIMEZONE || 'America/La_Paz';
export const ORIGIN = 'registro';
export const DUPLICATE_WINDOW_MS = 3 * 60 * 1000;
const MAX_SERVICES = 10;
const MAX_RANGE_DAYS = 62;
const DEFAULT_METHODS = ['Efectivo', 'Tarjeta', 'Transferencia']; // mismo default que la caja
const GENERAL_CLIENT = 'Cliente general';
const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export class RegistroError extends Error {
  constructor(status, message, code, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const negRef = (negocioId) => db.collection('negocios').doc(negocioId);
const nowIso = () => new Date().toISOString();
const actorInfo = (actor) => ({ uid: actor?.uid || null, rol: actor?.rol === 'barber' ? 'barber' : 'admin' });
const texto = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Hora "HH:mm" en la zona del negocio. */
export function localTimeKey(ms, timeZone = TZ) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const h = parts.find((p) => p.type === 'hour').value;
  const m = parts.find((p) => p.type === 'minute').value;
  return `${h}:${m}`;
}

export const todayKey = (ms = Date.now()) => localDateKey(ms, TZ);

// ───────────────────────── Otra fecha (solo admin) ─────────────────────────
//
// El admin puede registrar un servicio de hasta 7 días atrás (nunca futuro).
// Se guarda con hora fija 12:00 del negocio y paidAt = ese mediodía, para que
// la caja (que agrupa por paidAt) lo trate como cobrado ESE día:
//   - si la caja que cubre ese día sigue abierta -> entra en ella;
//   - si ya se cerró -> queda fuera de caja (la caja cerrada no cambia y
//     tampoco se suma a la de hoy).
// La lógica de la caja no cambia: aquí solo se LEE su estado para avisar.
export const MAX_BACKDATE_DAYS = 7;
export const BACKDATE_TIME = '12:00';
export const CASH_PLACEMENT = { OPEN: 'caja-abierta', NEXT: 'proxima-caja', OUTSIDE: 'fuera-de-caja', NONE: 'sin-caja' };

export function shiftDay(key, days) {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Mediodía (hora del negocio) de un día 'AAAA-MM-DD', en milisegundos. */
export function noonMillis(key) {
  return localDayStartMillis(Date.parse(`${key}T12:00:00Z`), TZ) + 12 * 3600000;
}

/**
 * Fecha del registro. El barbero siempre registra "ahora" (la fecha que
 * mande se ignora). El admin puede mandar `date` entre hoy-7 y hoy.
 */
export function resolveRegistroDate(input, { isBarber = false, nowMs = Date.now() } = {}) {
  const today = todayKey(nowMs);
  if (isBarber || input === undefined || input === null || input === '') return { date: today, backdated: false };
  const d = String(input);
  if (!FECHA_RE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || shiftDay(d, 0) !== d) {
    throw new RegistroError(400, 'La fecha no es válida.', 'DATE_INVALID');
  }
  if (d > today) throw new RegistroError(400, 'No se puede registrar un servicio con fecha futura.', 'DATE_IN_FUTURE');
  if (d < shiftDay(today, -MAX_BACKDATE_DAYS)) {
    throw new RegistroError(400, `Solo se puede registrar hasta ${MAX_BACKDATE_DAYS} días atrás.`, 'DATE_TOO_OLD');
  }
  return { date: d, backdated: d !== today };
}

/** Clave de caja (scope) de una sucursal, igual que resolveScope de la caja. */
export function cashScopeKeyFor(branch, sucursales = []) {
  if (sucursales.length === 0) return 'general';
  const found = sucursales.find((s) => (s.name || '') === branch) || (sucursales.length === 1 ? sucursales[0] : null);
  return found ? found.id : null;
}

/**
 * ¿En qué caja queda un cobro con este paidAt? Mismo criterio que la ventana
 * de la caja (windowStart = último cierre, o inicio del día en que se abrió).
 */
export function cashPlacementFor(paidAtMs, estado, session = null) {
  if (!estado) return CASH_PLACEMENT.NONE;
  if (estado.openSessionId) {
    const start = toMillis(session?.windowStart) ?? toMillis(estado.lastClosedAt)
      ?? localDayStartMillis(toMillis(session?.openedAt) ?? Date.now(), TZ);
    return paidAtMs >= start ? CASH_PLACEMENT.OPEN : CASH_PLACEMENT.OUTSIDE;
  }
  const last = toMillis(estado.lastClosedAt);
  if (last === null) return CASH_PLACEMENT.NONE;
  return paidAtMs >= last ? CASH_PLACEMENT.NEXT : CASH_PLACEMENT.OUTSIDE;
}

async function readCashPlacement(tx, negocioId, branch, sucursales, paidAtMs) {
  const scopeKey = cashScopeKeyFor(branch, sucursales);
  if (!scopeKey) return CASH_PLACEMENT.NONE;
  const estadoSnap = await tx.get(negRef(negocioId).collection('cajaEstado').doc(scopeKey));
  const estado = estadoSnap.exists ? estadoSnap.data() : null;
  let session = null;
  if (estado?.openSessionId) {
    const sesSnap = await tx.get(negRef(negocioId).collection('cajas').doc(String(estado.openSessionId)));
    session = sesSnap.exists ? sesSnap.data() : null;
  }
  return cashPlacementFor(paidAtMs, estado, session);
}

const dayLabel = (key) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

// ───────────────────────── Piezas puras ─────────────────────────

/** Métodos de pago del negocio (mismo criterio que la caja). */
export function paymentMethodsOf(negocio) {
  const raw = negocio?.businessSettings?.paymentMethods;
  const list = Array.isArray(raw) ? raw.map((m) => String(m || '').trim()).filter(Boolean) : [];
  return list.length ? [...new Set(list)] : DEFAULT_METHODS;
}

/** Devuelve el método tal como lo escribe el negocio, o lanza. */
export function resolvePaymentMethod(input, negocio) {
  const wanted = texto(input, 60);
  const found = paymentMethodsOf(negocio).find((m) => m.toLowerCase() === wanted.toLowerCase());
  if (!wanted || !found || !isRealPaymentMethod(found)) {
    throw new RegistroError(400, 'Elige un método de pago válido.', 'PAYMENT_METHOD_INVALID');
  }
  return found;
}

/**
 * Sucursal del registro: la del profesional; si no tiene y el negocio tiene
 * una sola, esa. Si hay varias y el profesional no tiene, se rechaza (un
 * registro sin sucursal no aparecería en el Dashboard).
 */
export function resolveBranch(professional, sucursales = []) {
  const propia = texto(professional?.branch, 120);
  if (propia) return propia;
  const activas = sucursales.filter((s) => s?.active !== false);
  if (activas.length === 1) return texto(activas[0].name, 120);
  if (activas.length === 0) return '';
  throw new RegistroError(400, `Asígnale una sucursal a ${professional?.name || 'este profesional'} para poder registrar sus servicios.`, 'BRANCH_REQUIRED');
}

/** Normaliza services[] del body: [{ serviceId, price? }] sin repetidos. */
export function parseServiceInputs(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new RegistroError(400, 'Elige al menos un servicio.', 'SERVICES_REQUIRED');
  if (raw.length > MAX_SERVICES) throw new RegistroError(400, 'Demasiados servicios en un solo registro.', 'TOO_MANY_SERVICES');
  const seen = new Set();
  return raw.map((s) => {
    const serviceId = texto(typeof s === 'string' ? s : s?.serviceId, 120);
    if (!serviceId) throw new RegistroError(400, 'Servicio inválido.', 'SERVICE_INVALID');
    if (seen.has(serviceId)) throw new RegistroError(400, 'El mismo servicio está repetido.', 'SERVICE_REPEATED');
    seen.add(serviceId);
    return { serviceId, price: typeof s === 'object' && s !== null ? s.price : undefined };
  });
}

/**
 * Arma services[] con el precio calculado en el servidor (precio del
 * profesional > precio base). Para precio variable exige el precio final y
 * que respete el mínimo ("Desde"). El precio que manda el navegador para un
 * servicio de precio fijo se ignora.
 */
export function priceServices(inputs, catalog, professional) {
  const missing = inputs.find((i) => !catalog.some((c) => String(c.id) === i.serviceId));
  if (missing) throw new RegistroError(400, 'Servicio no encontrado. Actualiza e inténtalo de nuevo.', 'SERVICE_NOT_FOUND');
  if (!professionalCanDo(professional, inputs.map((i) => i.serviceId))) {
    throw new RegistroError(400, `${professional?.name || 'Este profesional'} no tiene asignado ese servicio.`, 'SERVICE_NOT_ASSIGNED');
  }
  const services = inputs.map((i) => {
    const svc = catalog.find((c) => String(c.id) === i.serviceId);
    const line = buildCitaService(svc, professional);
    if (!line.priceVariable) return line;
    const final = Number(i.price);
    if (i.price === undefined || i.price === null || i.price === '' || !Number.isFinite(final) || final <= 0) {
      throw new RegistroError(400, `Escribe el precio final de ${line.serviceName}.`, 'PRICE_REQUIRED', { serviceId: line.serviceId, minPrice: line.listPrice });
    }
    if (final < line.listPrice) {
      throw new RegistroError(400, `El precio de ${line.serviceName} no puede ser menor a Bs ${line.listPrice}.`, 'PRICE_BELOW_MIN', { serviceId: line.serviceId, minPrice: line.listPrice });
    }
    return { ...line, price: round2(final) };
  });
  return { services, ...summarizeCitaServices(services) };
}

/**
 * Comisión congelada. Para cada servicio: si `previous` (snapshot anterior
 * del MISMO profesional) ya tenía su tipo/valor, se reutiliza (una corrección
 * de precio no cambia la tasa pactada); si no, se calcula con la
 * configuración actual del profesional.
 * Con una promo "comisión sobre el precio normal" (promo.commissionBase ===
 * 'normal') la comisión se calcula sobre el precio de antes de la promo.
 */
export function buildCommissionSnapshot(services, professional, catalog, previous = null, promo = null) {
  const prev = new Map((previous?.breakdown || []).filter((b) => b?.isConfigured).map((b) => [String(b.serviceId), b]));
  const normalBase = promo?.commissionBase === 'normal';
  const breakdown = services.map((s) => {
    const p = prev.get(String(s.serviceId));
    const pre = Number(s.prePromoPrice);
    const base = normalBase && Number.isFinite(pre) ? pre : Number(s.price);
    let r;
    if (p && (p.type === COMMISSION_TYPE.PERCENTAGE || p.type === COMMISSION_TYPE.FIXED)) {
      const amount = p.type === COMMISSION_TYPE.PERCENTAGE ? (base * Number(p.value)) / 100 : Number(p.value);
      r = { amount, isConfigured: true, issue: null, type: p.type, value: Number(p.value) };
    } else {
      const c = calculateCommission({ serviceId: s.serviceId, serviceName: s.serviceName, price: base }, professional, catalog);
      r = { amount: c.amount, isConfigured: c.isConfigured, issue: c.issue || null, type: c.type ?? null, value: c.value ?? null };
    }
    return { serviceId: String(s.serviceId), serviceName: s.serviceName || '', price: Number(s.price) || 0, ...r, amount: round2(r.amount) };
  });
  return { amount: round2(breakdown.reduce((sum, b) => sum + b.amount, 0)), breakdown, calculatedAt: nowIso() };
}

const sameServiceSet = (a = [], b = []) => {
  const x = [...a].map(String).sort();
  const y = [...b].map(String).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};
const serviceIdsOf = (cita) => (Array.isArray(cita?.services) ? cita.services.map((s) => s?.serviceId).filter(Boolean) : []);

/** Campos de cita que dependen de servicios/profesional/cliente. */
function citaServiceFields(priced) {
  return {
    services: priced.services,
    serviceId: priced.services[0]?.serviceId || '',
    serviceName: priced.services.map((s) => s.serviceName).join(' + '),
    service: priced.services.map((s) => s.serviceName).join(' + '),
    price: priced.totalPrice,
    duration: priced.totalDuration,
  };
}

function clientFields(client) {
  if (!client) return { clientId: null, clientName: GENERAL_CLIENT, clientPhone: '' };
  return { clientId: client.id, clientName: texto(client.name, 120) || GENERAL_CLIENT, clientPhone: texto(client.phone, 40) === 'N/A' ? '' : texto(client.phone, 40) };
}

function publicView(id, d) {
  return { id, ...d };
}

// ───────────────────────── Lecturas comunes ─────────────────────────

async function readProfessional(tx, negocioId, professionalId) {
  if (!professionalId) throw new RegistroError(400, 'Elige el profesional.', 'PROFESSIONAL_REQUIRED');
  const snap = await tx.get(negRef(negocioId).collection('profesionales').doc(String(professionalId)));
  if (!snap.exists) throw new RegistroError(404, 'Profesional no encontrado.', 'PROFESSIONAL_NOT_FOUND');
  const pro = { id: snap.id, ...snap.data() };
  if (pro.active === false) throw new RegistroError(400, 'Ese profesional está inactivo.', 'PROFESSIONAL_INACTIVE');
  return pro;
}

async function readClient(tx, negocioId, clientId) {
  if (clientId === null || clientId === undefined || clientId === '') return null;
  const id = texto(clientId, 200);
  const snap = await tx.get(negRef(negocioId).collection('clientes').doc(id));
  if (!snap.exists) throw new RegistroError(400, 'Ese cliente no existe.', 'CLIENT_NOT_FOUND');
  return { id: snap.id, ...snap.data() };
}

async function readSucursales(tx, negocioId) {
  const snap = await tx.get(negRef(negocioId).collection('sucursales'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ───────────────────────── Registrar ─────────────────────────

/**
 * @param {object} args
 * @param {string} args.negocioId  del token (nunca del body)
 * @param {object} args.actor      req.actor ({ uid, rol })
 * @param {object} args.body       { requestId, professionalId?, services, paymentMethod, clientId?, confirmDuplicate?, date? (solo admin) }
 * @returns {{ registro, replay: boolean, notification }}
 */
export async function createRegistro({ negocioId, actor, body = {} }) {
  const requestId = texto(body.requestId, 60);
  if (!REQUEST_ID_RE.test(requestId)) throw new RegistroError(400, 'Falta el identificador de la solicitud.', 'REQUEST_ID_REQUIRED');
  const isBarber = actor?.rol === 'barber';
  // Barbero: siempre a su nombre, ignore lo que mande el navegador.
  const professionalId = isBarber ? actor.uid : texto(body.professionalId, 120);
  const inputs = parseServiceInputs(body.services);
  const confirmDuplicate = body.confirmDuplicate === true;

  const nRef = negRef(negocioId);
  const citaRef = nRef.collection('citas').doc(requestId);
  const nowMs = Date.now();
  const { date, backdated } = resolveRegistroDate(body.date, { isBarber, nowMs });
  const time = backdated ? BACKDATE_TIME : localTimeKey(nowMs);
  const paidAtMs = backdated ? noonMillis(date) : nowMs;
  const promosOn = await promotionsEnabled(negocioId);

  const result = await runCreate(async (tx) => {
    const existing = await tx.get(citaRef);
    if (existing.exists) {
      const d = existing.data();
      if (d.origin === ORIGIN && d.registeredBy?.uid === actor.uid) return { registro: publicView(existing.id, d), replay: true };
      throw new RegistroError(409, 'Ese identificador ya se usó. Vuelve a intentarlo.', 'REQUEST_ID_CONFLICT');
    }
    const negSnap = await tx.get(nRef);
    if (!negSnap.exists) throw new RegistroError(404, 'Negocio no encontrado.', 'NEGOCIO_NOT_FOUND');
    const negocio = negSnap.data();
    const pro = await readProfessional(tx, negocioId, professionalId);
    const sucursales = await readSucursales(tx, negocioId);
    const catalog = await readServicesInTx(tx, nRef, inputs.map((i) => i.serviceId));
    const client = await readClient(tx, negocioId, body.clientId);
    const delDia = await tx.get(nRef.collection('citas').where('professionalId', '==', pro.id).where('date', '==', date));
    const promoCtx = await readPromotionContextInTx(tx, nRef, { enabled: promosOn });

    const branch = resolveBranch(pro, sucursales);
    // Promociones del día y la sucursal (descuentos y combos), sobre el precio del profesional.
    const priced = withPromotions(priceServices(inputs, catalog, pro), promoCtx, { date, branch });
    const paymentMethod = resolvePaymentMethod(body.paymentMethod, negocio);
    const cashPlacement = backdated ? await readCashPlacement(tx, negocioId, branch, sucursales, paidAtMs) : null;

    // Posible duplicado: mismo profesional, mismos servicios, hace menos de 3 min.
    const ids = priced.services.map((s) => s.serviceId);
    const dup = delDia.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => c.origin === ORIGIN && c.status !== 'cancelled' && sameServiceSet(serviceIdsOf(c), ids))
      .find((c) => nowMs - Date.parse(c.createdAt || 0) < DUPLICATE_WINDOW_MS);
    if (dup && !confirmDuplicate) {
      throw new RegistroError(409, 'Ya se registró este mismo servicio hace un momento. ¿Registrarlo otra vez?', 'POSSIBLE_DUPLICATE', {
        duplicateOf: { id: dup.id, createdAt: dup.createdAt, price: dup.price, serviceName: dup.serviceName },
      });
    }

    const at = new Date(nowMs).toISOString();
    const doc = {
      origin: ORIGIN,
      status: 'completed',
      requestId,
      date,
      time,
      paidAt: new Date(paidAtMs).toISOString(),
      createdAt: at,
      updatedAt: at,
      bookedBy: isBarber ? 'barber' : 'admin',
      registeredBy: actorInfo(actor),
      professionalId: pro.id,
      barberId: pro.id,
      ...clientFields(client),
      ...citaServiceFields(priced),
      paymentMethod,
      branch,
      commissionSnapshot: buildCommissionSnapshot(priced.services, pro, catalog, null, priced.promo),
      ...(priced.promo ? { promo: priced.promo } : {}),
      commissionPaid: false,
      notes: '',
      ...(dup ? { duplicateConfirmed: true } : {}),
      ...(backdated ? { backdated: true, cashPlacement } : {}),
    };
    tx.create(citaRef, doc);
    return { registro: publicView(citaRef.id, doc), replay: false, professionalName: pro.name || '' };
  }, citaRef, actor);

  // El aviso nunca hace fallar el registro.
  let notification = null;
  if (!result.replay) {
    notification = await notifyRegistro(negocioId, actor, result.registro, result.professionalName);
  }
  return { registro: result.registro, replay: result.replay, notification };
}

// Dos reintentos simultáneos con el mismo requestId: el segundo choca con
// tx.create (ALREADY_EXISTS) y devuelve el registro que ya quedó guardado.
async function runCreate(fn, citaRef, actor) {
  try {
    return await db.runTransaction(fn);
  } catch (err) {
    const yaExiste = err?.code === 6 || err?.code === 'already-exists' || /ALREADY_EXISTS/.test(String(err?.message));
    if (!yaExiste) throw err;
    const snap = await citaRef.get();
    const d = snap.exists ? snap.data() : null;
    if (d?.origin === ORIGIN && d.registeredBy?.uid === actor?.uid) return { registro: publicView(snap.id, d), replay: true };
    throw new RegistroError(409, 'Ese identificador ya se usó. Vuelve a intentarlo.', 'REQUEST_ID_CONFLICT');
  }
}

export async function notifyRegistro(negocioId, actor, registro, professionalName = '') {
  const isBarber = actor?.rol === 'barber';
  try {
    return await sendNotification({
      tipo: 'SERVICIO_REGISTRADO',
      negocioId,
      data: {
        byRole: isBarber ? 'barber' : 'admin', professionalName, serviceName: registro.serviceName, price: registro.price,
        ...(registro.backdated ? { dateLabel: dayLabel(registro.date) } : {}),
      },
      actorUid: actor.uid,
      targetProfessionalId: registro.professionalId,
      // Registra el admin: solo al profesional (no a otros admins).
      // Registra el barbero: a los admins (él queda excluido por actorUid).
      onlyTargetProfessional: !isBarber,
    });
  } catch (err) {
    logger.warn(`[registros] No se pudo enviar el aviso (negocio=${negocioId}):`, err.message);
    return { sent: 0, failed: true };
  }
}

// ───────────────────────── Corregir / anular ─────────────────────────

const AUDITED = ['professionalId', 'clientId', 'clientName', 'services', 'price', 'paymentMethod', 'branch', 'commissionAmount', 'status'];

function auditView(c) {
  return {
    professionalId: c.professionalId || null,
    clientId: c.clientId ?? null,
    clientName: c.clientName || '',
    services: (c.services || []).map((s) => ({ serviceId: s.serviceId, serviceName: s.serviceName, price: s.price })),
    price: Number(c.price) || 0,
    paymentMethod: c.paymentMethod || '',
    branch: c.branch || '',
    commissionAmount: Number(c.commissionSnapshot?.amount) || 0,
    status: c.status,
  };
}

function diffAudit(before, after) {
  const out = [];
  for (const f of AUDITED) {
    if (JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null)) out.push({ field: f, before: before[f] ?? null, after: after[f] ?? null });
  }
  return out;
}

/** Corregir y anular: solo el administrador (el barbero solo registra y consulta). */
function assertAdmin(actor) {
  if (actor?.rol === 'barber') {
    throw new RegistroError(403, 'Solo el administrador puede corregir o anular un registro.', 'ADMIN_ONLY');
  }
}

/** Comprueba si se puede cambiar y si hace falta el PIN. Lanza si no se puede. */
function checkEditable(cita) {
  if (!cita || cita.origin !== ORIGIN) throw new RegistroError(404, 'Registro no encontrado.', 'NOT_FOUND');
  if (cita.status === 'cancelled') throw new RegistroError(409, 'Este registro ya está anulado.', 'ALREADY_VOIDED');
  // Caja cerrada, comisión pagada, o registro con otra fecha que quedó fuera
  // de caja (su día ya estaba cerrado): solo con PIN.
  const locked = !!cita.cashSessionId || cita.commissionPaid === true || cita.cashPlacement === CASH_PLACEMENT.OUTSIDE;
  return { needsPin: locked };
}

/** Valida el PIN antes de la transacción (si viene). */
async function preparePin(negocioId, pin) {
  const hash = await getPinHash(negocioId);
  if (pin === undefined || pin === null || pin === '') return { hash, ok: false };
  if (!hash) return { hash, ok: false };
  const ok = await verifyPin(String(pin), hash);
  if (!ok) throw new RegistroError(401, 'PIN incorrecto.', 'PIN_INVALID');
  return { hash, ok: true };
}

function requirePinIfNeeded(needsPin, pinState) {
  if (!needsPin || pinState.ok) return;
  if (!pinState.hash) throw new RegistroError(409, 'Primero crea el PIN de Analítica. Sin PIN no se puede cambiar un registro con caja cerrada o comisión pagada.', 'PIN_MISSING');
  throw new RegistroError(401, 'Este registro tiene la caja cerrada o la comisión pagada: ingresa el PIN de Analítica.', 'PIN_REQUIRED');
}

function parseReason(raw) {
  const reason = texto(raw, 300);
  if (reason.length < 5) throw new RegistroError(400, 'Explica el motivo (mínimo 5 letras).', 'REASON_REQUIRED');
  return reason;
}

/**
 * Corrige un registro. body: { reason?, pin?, services?, paymentMethod?, clientId? (null = Cliente general), professionalId? (solo admin) }
 * El motivo es opcional: corrige el dueño. El historial guarda igual quién,
 * cuándo y qué cambió. (Anular sí pide motivo.)
 */
export async function correctRegistro({ negocioId, actor, id, body = {} }) {
  assertAdmin(actor);
  const reason = texto(body.reason, 300);
  const inputs = body.services !== undefined ? parseServiceInputs(body.services) : null;
  const pinState = await preparePin(negocioId, body.pin);
  const promosOn = await promotionsEnabled(negocioId);

  const nRef = negRef(negocioId);
  const ref = nRef.collection('citas').doc(String(id));
  const corrRef = ref.collection('correcciones').doc();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cita = snap.exists ? snap.data() : null;
    const { needsPin } = checkEditable(cita);
    requirePinIfNeeded(needsPin, pinState);

    const negocio = (await tx.get(nRef)).data() || {};
    const newProId = body.professionalId !== undefined ? texto(body.professionalId, 120) : cita.professionalId;
    const proChanged = newProId !== cita.professionalId;
    const reprice = !!inputs || proChanged;
    // Solo se relee el profesional si hay que recalcular precio/comisión
    // (corregir el método de pago de alguien ya inactivo debe poder hacerse).
    const pro = reprice ? await readProfessional(tx, negocioId, newProId) : null;
    const nextInputs = inputs || (cita.services || []).map((s) => ({ serviceId: String(s.serviceId), price: s.price }));
    const catalog = reprice ? await readServicesInTx(tx, nRef, nextInputs.map((i) => i.serviceId)) : [];
    const clientTouched = Object.prototype.hasOwnProperty.call(body, 'clientId');
    const client = clientTouched ? await readClient(tx, negocioId, body.clientId) : undefined;
    const sucursales = proChanged ? await readSucursales(tx, negocioId) : null;
    const promoCtx = reprice ? await readPromotionContextInTx(tx, nRef, { enabled: promosOn }) : null;

    const next = { ...cita };
    if (proChanged) {
      Object.assign(next, { professionalId: pro.id, barberId: pro.id, branch: resolveBranch(pro, sucursales) });
    }
    if (reprice) {
      // Promociones del día del registro, sobre el precio del profesional.
      const priced = withPromotions(priceServices(nextInputs, catalog, pro), promoCtx, { date: cita.date, branch: next.branch });
      Object.assign(next, citaServiceFields(priced));
      next.promo = priced.promo || null;
      next.commissionSnapshot = buildCommissionSnapshot(priced.services, pro, catalog, proChanged ? null : cita.commissionSnapshot, priced.promo);
    }
    if (body.paymentMethod !== undefined) next.paymentMethod = resolvePaymentMethod(body.paymentMethod, negocio);
    if (clientTouched) Object.assign(next, clientFields(client));

    const before = auditView(cita);
    const after = auditView(next);
    const changes = diffAudit(before, after);
    if (changes.length === 0) throw new RegistroError(400, 'No hay cambios para guardar.', 'NO_CHANGES');

    const at = nowIso();
    tx.set(corrRef, { type: 'correct', at, by: actorInfo(actor), reason, pinVerified: pinState.ok, changes, before, after });
    const update = {
      ...Object.fromEntries(['services', 'serviceId', 'serviceName', 'service', 'price', 'duration', 'commissionSnapshot', 'promo',
        'professionalId', 'barberId', 'branch', 'paymentMethod', 'clientId', 'clientName', 'clientPhone']
        .filter((k) => next[k] !== undefined).map((k) => [k, next[k]])),
      updatedAt: at,
      lastCorrectedAt: at,
      correctionsCount: (Number(cita.correctionsCount) || 0) + 1,
    };
    tx.update(ref, update);
    return { registro: publicView(ref.id, { ...cita, ...update }), correction: { id: corrRef.id, at, reason, changes } };
  });
}

/** Anula un registro (status cancelled). Nunca borra el documento. body: { reason, pin? } */
export async function voidRegistro({ negocioId, actor, id, body = {} }) {
  assertAdmin(actor);
  const reason = parseReason(body.reason);
  const pinState = await preparePin(negocioId, body.pin);
  const ref = negRef(negocioId).collection('citas').doc(String(id));
  const corrRef = ref.collection('correcciones').doc();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cita = snap.exists ? snap.data() : null;
    const { needsPin } = checkEditable(cita);
    requirePinIfNeeded(needsPin, pinState);

    const at = nowIso();
    const before = auditView(cita);
    const after = { ...before, status: 'cancelled' };
    const by = actorInfo(actor);
    tx.set(corrRef, { type: 'void', at, by, reason, pinVerified: pinState.ok, changes: diffAudit(before, after), before, after });
    const update = {
      status: 'cancelled', voidedAt: at, voidedBy: by, voidReason: reason, updatedAt: at,
      correctionsCount: (Number(cita.correctionsCount) || 0) + 1,
    };
    tx.update(ref, update);
    return { registro: publicView(ref.id, { ...cita, ...update }), correction: { id: corrRef.id, at, reason } };
  });
}

// ───────────────────────── Consultas ─────────────────────────

function parseRange(from, to) {
  const hoy = todayKey();
  const start = FECHA_RE.test(String(from || '')) ? String(from) : hoy;
  const end = FECHA_RE.test(String(to || '')) ? String(to) : start;
  if (end < start) throw new RegistroError(400, 'El rango de fechas no es válido.', 'RANGE_INVALID');
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  if (days > MAX_RANGE_DAYS) throw new RegistroError(400, `El rango máximo es de ${MAX_RANGE_DAYS} días.`, 'RANGE_TOO_LONG');
  return { start, end };
}

/**
 * Registros de un periodo (incluye anulados). Barbero: solo los suyos.
 * Lee por rango de fechas (índice simple) y filtra origin en memoria, para
 * no necesitar un índice compuesto nuevo.
 */
export async function listRegistros({ negocioId, actor, query = {} }) {
  const { start, end } = parseRange(query.from, query.to);
  const proFilter = actor?.rol === 'barber' ? actor.uid : texto(query.professionalId, 120);
  const snap = await negRef(negocioId).collection('citas').where('date', '>=', start).where('date', '<=', end).get();
  const items = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.origin === ORIGIN && (!proFilter || proFilter === 'all' || c.professionalId === proFilter))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { from: start, to: end, items };
}

// ───────────────────────── Resumen anual ─────────────────────────
//
// Totales por mes de un año (cantidad, importe y comisión), sin descargar
// los registros: sumas de Firestore (aggregate) sobre
//   origin == 'registro' && status == 'completed' [&& professionalId == X]
//   && date entre el 1 y el último día del mes.
// Necesita los índices compuestos de citas (origin, status, date) y
// (origin, status, professionalId, date). Mientras no existan (Firestore
// responde FAILED_PRECONDITION), se usa el respaldo: leer el año y sumar
// aquí (más lecturas), con caché de 5 minutos.

const SUMMARY_CACHE_MS = 5 * 60 * 1000;
const summaryCache = new Map(); // `${negocioId}|${year}|${pro}` -> { at, data }
const FAILED_PRECONDITION = 9;

const pad2 = (n) => String(n).padStart(2, '0');
function monthRange(year, m) {
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { start: `${year}-${pad2(m)}-01`, end: `${year}-${pad2(m)}-${pad2(last)}` };
}

function monthsOf(year, today) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const r = monthRange(year, m);
    if (r.start > today) break; // nunca meses futuros
    out.push({ month: `${year}-${pad2(m)}`, ...r });
  }
  return out;
}

async function totalsByAggregate(negocioId, months, pro) {
  const { AggregateField } = firestoreAdmin;
  if (!AggregateField) throw Object.assign(new Error('Sin AggregateField'), { code: FAILED_PRECONDITION });
  let base = negRef(negocioId).collection('citas').where('origin', '==', ORIGIN).where('status', '==', 'completed');
  if (pro) base = base.where('professionalId', '==', pro);
  return Promise.all(months.map(async ({ month, start, end }) => {
    const q = base.where('date', '>=', start).where('date', '<=', end);
    if (typeof q.aggregate !== 'function') throw Object.assign(new Error('Sin aggregate'), { code: FAILED_PRECONDITION });
    const snap = await q.aggregate({
      count: AggregateField.count(),
      total: AggregateField.sum('price'),
      commission: AggregateField.sum('commissionSnapshot.amount'),
    }).get();
    const d = snap.data();
    return { month, count: Number(d.count) || 0, total: round2(Number(d.total) || 0), commission: round2(Number(d.commission) || 0) };
  }));
}

async function totalsByScan(negocioId, months, pro) {
  const out = months.map(({ month }) => ({ month, count: 0, total: 0, commission: 0 }));
  if (!months.length) return out;
  const byMonth = Object.fromEntries(out.map((m) => [m.month, m]));
  const snap = await negRef(negocioId).collection('citas')
    .where('date', '>=', months[0].start).where('date', '<=', months[months.length - 1].end).get();
  for (const d of snap.docs) {
    const c = d.data();
    if (c.origin !== ORIGIN || c.status !== 'completed' || (pro && c.professionalId !== pro)) continue;
    const m = byMonth[String(c.date).slice(0, 7)];
    if (!m) continue;
    m.count += 1;
    m.total += Number(c.price) || 0;
    m.commission += Number(c.commissionSnapshot?.amount) || 0;
  }
  for (const m of out) { m.total = round2(m.total); m.commission = round2(m.commission); }
  return out;
}

/**
 * Totales por mes del año (meses futuros no se incluyen). Barbero: solo los
 * suyos. Devuelve { year, source: 'aggregate' | 'scan', months, totals }.
 */
export async function summarizeYear({ negocioId, actor, query = {} }) {
  const today = todayKey();
  const year = Number(query.year);
  const thisYear = Number(today.slice(0, 4));
  if (!Number.isInteger(year) || year < 2000 || year > thisYear) {
    throw new RegistroError(400, 'El año no es válido.', 'YEAR_INVALID');
  }
  const proQ = actor?.rol === 'barber' ? actor.uid : texto(query.professionalId, 120);
  const pro = proQ && proQ !== 'all' ? proQ : null;

  const key = `${negocioId}|${year}|${pro || ''}`;
  const hit = summaryCache.get(key);
  if (hit && Date.now() - hit.at < SUMMARY_CACHE_MS) return hit.data;

  const months = monthsOf(year, today);
  let source = 'aggregate';
  let rows;
  try {
    rows = await totalsByAggregate(negocioId, months, pro);
  } catch (err) {
    if (err?.code !== FAILED_PRECONDITION) throw err;
    // Falta el índice: el mensaje de Firestore trae el link para crearlo.
    logger.warn('[registros] Resumen anual sin índice, se usa el respaldo (leer el año):', err.message);
    source = 'scan';
    rows = await totalsByScan(negocioId, months, pro);
  }
  const totals = rows.reduce((a, m) => ({ count: a.count + m.count, total: a.total + m.total, commission: a.commission + m.commission }), { count: 0, total: 0, commission: 0 });
  totals.total = round2(totals.total);
  totals.commission = round2(totals.commission);
  const data = { year, source, months: rows, totals };
  // Con el índice las sumas son baratas: solo se guarda en caché el respaldo.
  if (source === 'scan') {
    if (summaryCache.size > 500) summaryCache.clear();
    summaryCache.set(key, { at: Date.now(), data });
  }
  return data;
}

/** Al registrar, corregir o anular: el resumen del negocio se recalcula. */
export function invalidateYearSummary(negocioId) {
  for (const k of summaryCache.keys()) if (k.startsWith(`${negocioId}|`)) summaryCache.delete(k);
}

/** Para las pruebas. */
export function clearYearSummaryCache() {
  summaryCache.clear();
}

/** Historial de correcciones de un registro (más antiguo primero). */
export async function listCorrecciones({ negocioId, actor, id }) {
  const ref = negRef(negocioId).collection('citas').doc(String(id));
  const snap = await ref.get();
  const cita = snap.exists ? snap.data() : null;
  if (!cita || cita.origin !== ORIGIN) throw new RegistroError(404, 'Registro no encontrado.', 'NOT_FOUND');
  if (actor?.rol === 'barber' && cita.professionalId !== actor.uid) throw new RegistroError(404, 'Registro no encontrado.', 'NOT_FOUND');
  const corr = await ref.collection('correcciones').get();
  return {
    items: corr.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))),
  };
}
