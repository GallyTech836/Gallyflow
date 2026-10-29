// cashService.js
//
// Caja y cierre diario (el "sobre"). Todo se lee y se escribe desde el
// backend; las reglas de Firestore deben cerrar estas colecciones para el
// navegador (ver docs en el resumen de la entrega).
//
// Datos (bajo negocios/{id}):
//   cajaEstado/{scopeKey}        { openSessionId, lastClosedAt, lastClosedSessionId, lastNextFund }
//                                 Candado: una sola caja abierta por sucursal.
//   cajas/{sessionId}            sesión de caja (abierta o cerrada)
//   cajas/{sessionId}/correcciones/{id}  historial de correcciones (con PIN)
//   cajaMovimientos/{id}         salidas de efectivo (manuales y pagos de comisión)
//   commissionPayments/{id}      pagos de comisiones (ya existía; ahora con método)
//
// Qué cobros entran en una caja: citas completadas y ventas pagadas de esa
// sucursal, cobradas desde el último cierre de esa sucursal (o desde el
// inicio del día, si es la primera caja) y que todavía no pertenecen a otra
// caja cerrada. Al cerrar, cada cobro queda marcado con cashSessionId y su
// copia se guarda en el cierre: nunca se cuenta dos veces.

import { db } from '../../config/firebase.js';
import { getPinHash } from '../finance/pinStore.js';
import { verifyPin } from '../finance/pin.js';
import { calculateCommissionForCita } from '../finance/commissionModel.js';
import {
  buildCobros, computeCashSummary, validateClose, isCashMethod, isRealPaymentMethod,
  round2, toMillis, cobroMillisDeCita, localDateKey, localDayStartMillis,
} from './cashModel.js';

const TZ = process.env.APP_TIMEZONE || 'America/La_Paz';
const DEFAULT_METHODS = ['Efectivo', 'Tarjeta', 'Transferencia'];
const MAX_COBROS_POR_CIERRE = 400; // límite de escrituras por transacción de Firestore (500)

export class CashError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const negRef = (negocioId) => db.collection('negocios').doc(negocioId);
const estadoRef = (negocioId, scopeKey) => negRef(negocioId).collection('cajaEstado').doc(scopeKey);
const cajasCol = (negocioId) => negRef(negocioId).collection('cajas');
const movCol = (negocioId) => negRef(negocioId).collection('cajaMovimientos');

const nowIso = () => new Date().toISOString();
const actorInfo = (actor) => ({ uid: actor?.uid || null, email: actor?.email || null, rol: actor?.rol === 'barber' ? 'barber' : 'admin' });

function parseAmount(v, field, { allowZero = true } = {}) {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) throw new CashError(400, `Ingresa un importe válido (${field}).`, 'INVALID_AMOUNT');
  if (n < 0 || (!allowZero && n === 0)) throw new CashError(400, `El importe debe ser mayor a 0 (${field}).`, 'INVALID_AMOUNT');
  return round2(n);
}

// ───────────────────────── Ámbito (sucursal) ─────────────────────────

/**
 * La caja va por sucursal. Sin sucursales: una sola caja "general".
 * Las citas guardan la sucursal por NOMBRE (cita.branch); las ventas por id (branchKey).
 */
export async function resolveScope(negocioId, { branchId = null, branchName = null } = {}) {
  const snap = await negRef(negocioId).collection('sucursales').get();
  const sucursales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (sucursales.length === 0) return { key: 'general', name: 'General', single: true };
  let found = null;
  if (branchId) found = sucursales.find((s) => s.id === branchId);
  else if (branchName) found = sucursales.find((s) => (s.name || '') === branchName);
  else if (sucursales.length === 1) found = sucursales[0];
  if (!found) throw new CashError(400, 'Elige la sucursal de la caja.', 'SCOPE_REQUIRED');
  return { key: found.id, name: found.name || 'Sucursal', single: sucursales.length === 1 };
}

function citaEnScope(cita, scope) {
  if (scope.single) return true; // una sola sucursal: todo es de ella (citas viejas sin branch incluidas)
  return (cita.branch || '') === scope.name;
}

function ventaEnScope(venta, scope) {
  if (scope.single) return true;
  return venta.branchKey === scope.key;
}

async function getPaymentMethods(negocioId) {
  const snap = await negRef(negocioId).get();
  const raw = snap.exists ? snap.data()?.businessSettings?.paymentMethods : null;
  const list = Array.isArray(raw) ? raw.map((m) => String(m || '').trim()).filter(Boolean) : [];
  return list.length ? [...new Set(list)] : DEFAULT_METHODS;
}

// ───────────────────────── Cobros en una ventana ─────────────────────────

/**
 * Lee los cobros (citas + ventas) de la sucursal entre sinceMs y untilMs.
 * `get` es la función de lectura: q => q.get() o q => tx.get(q) dentro de una transacción.
 * Índices: citas (status ASC, paidAt ASC) y (status ASC, date ASC — ya existía);
 *          ventas (status ASC, date ASC).
 */
async function readCobrosDocs(negocioId, scope, { sinceMs, untilMs, sessionId, get = (q) => q.get() }) {
  const citasCol = negRef(negocioId).collection('citas');
  const ventasCol = negRef(negocioId).collection('ventas');
  const sinceIso = new Date(sinceMs).toISOString();
  const sinceDay = localDateKey(sinceMs, TZ);
  const ventasDesde = localDateKey(sinceMs - 7 * 86400000, TZ); // ventas pendientes pagadas días después

  const [conPaidAt, viejas, ventasSnap] = await Promise.all([
    get(citasCol.where('status', '==', 'completed').where('paidAt', '>=', sinceIso)),
    get(citasCol.where('status', '==', 'completed').where('date', '>=', sinceDay)),
    get(ventasCol.where('status', '==', 'paid').where('date', '>=', ventasDesde)),
  ]);

  const inWindow = (ms) => ms !== null && ms >= sinceMs && ms <= untilMs;
  const libre = (d) => !d.cashSessionId || d.cashSessionId === sessionId;

  const citas = new Map();
  for (const d of [...conPaidAt.docs, ...viejas.docs]) {
    const c = { id: d.id, ...d.data() };
    if (citas.has(c.id)) continue;
    if (!citaEnScope(c, scope) || !libre(c)) continue;
    if (!inWindow(cobroMillisDeCita(c))) continue;
    citas.set(c.id, c);
  }
  const ventas = ventasSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((v) => ventaEnScope(v, scope) && libre(v) && inWindow(toMillis(v.paidAt)));

  return { citas: [...citas.values()], ventas };
}

function windowStartFor(estado, openedAtMs) {
  const lastClosed = toMillis(estado?.lastClosedAt);
  return lastClosed ?? localDayStartMillis(openedAtMs, TZ);
}

const salidaView = (m) => ({
  id: m.id, amount: round2(m.amount), reason: m.reason || '', source: m.source || 'manual',
  createdAt: m.createdAt || null, createdBy: m.createdBy || null,
  voided: !!m.voided, attachedOnOpen: !!m.attachedOnOpen, commissionPaymentId: m.commissionPaymentId || null,
});

// ───────────────────────── Consultas ─────────────────────────

/** Estado actual de la caja de una sucursal (para el Dashboard). */
export async function getCurrentCash(negocioId, { branchId, branchName } = {}) {
  const scope = await resolveScope(negocioId, { branchId, branchName });
  const [estadoSnap, paymentMethods] = await Promise.all([estadoRef(negocioId, scope.key).get(), getPaymentMethods(negocioId)]);
  const estado = estadoSnap.exists ? estadoSnap.data() : {};

  if (!estado.openSessionId) {
    // Salidas de efectivo registradas sin caja abierta: se descontarán de la próxima caja.
    const pend = await movCol(negocioId).where('scopeKey', '==', scope.key).where('sessionId', '==', null).get();
    const pendientes = pend.docs.map((d) => salidaView({ id: d.id, ...d.data() })).filter((m) => !m.voided);
    return {
      scope, open: false, session: null, paymentMethods,
      suggestedOpeningFund: estado.lastNextFund ?? null,
      lastClosedAt: estado.lastClosedAt || null,
      pendingCashOut: pendientes,
    };
  }

  const sesSnap = await cajasCol(negocioId).doc(estado.openSessionId).get();
  const session = { id: sesSnap.id, ...sesSnap.data() };
  const openedMs = toMillis(session.openedAt);
  const sinceMs = toMillis(session.windowStart) ?? windowStartFor(estado, openedMs);
  const { citas, ventas } = await readCobrosDocs(negocioId, scope, { sinceMs, untilMs: Date.now(), sessionId: session.id });
  const movSnap = await movCol(negocioId).where('sessionId', '==', session.id).get();
  const salidas = movSnap.docs.map((d) => salidaView({ id: d.id, ...d.data() }));
  const cobros = buildCobros({ citas, ventas });
  const summary = computeCashSummary({ openingFund: session.openingFund, cobros, salidas, paymentMethods });
  return { scope, open: true, session: publicSession(session), paymentMethods, summary, cobros, salidas };
}

function publicSession(s) {
  const { close, originalClose, ...rest } = s;
  return { ...rest, close: close || null, originalClose: originalClose || null };
}

export async function listCashSessions(negocioId, { branchId, branchName, limit = 30 } = {}) {
  const scope = await resolveScope(negocioId, { branchId, branchName });
  const snap = await cajasCol(negocioId).where('scopeKey', '==', scope.key).orderBy('openedAt', 'desc').limit(limit).get();
  const items = snap.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id, status: s.status, businessDate: s.businessDate, openedAt: s.openedAt, closedAt: s.closedAt || null,
      openedBy: s.openedBy || null, closedBy: s.closedBy || null, openingFund: s.openingFund,
      totalSales: s.close?.summary?.totalSales ?? null, expectedCash: s.close?.summary?.expectedCash ?? null,
      countedCash: s.close?.countedCash ?? null, difference: s.close?.difference ?? null,
      envelopeAmount: s.close?.envelopeAmount ?? null, corrected: !!s.corrected,
    };
  });
  items.sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt)));
  return { scope, items };
}

export async function getCashSession(negocioId, sessionId) {
  const ref = cajasCol(negocioId).doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) throw new CashError(404, 'Esa caja no existe.', 'NOT_FOUND');
  const corrSnap = await ref.collection('correcciones').get();
  const correcciones = corrSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return { session: publicSession({ id: snap.id, ...snap.data() }), correcciones };
}

// ───────────────────────── Apertura ─────────────────────────

export async function openCash(negocioId, { branchId, branchName, openingFund, actor }) {
  const fund = parseAmount(openingFund, 'fondo inicial');
  const scope = await resolveScope(negocioId, { branchId, branchName });
  const sesRef = cajasCol(negocioId).doc();

  return db.runTransaction(async (tx) => {
    const estadoSnap = await tx.get(estadoRef(negocioId, scope.key));
    const estado = estadoSnap.exists ? estadoSnap.data() : {};
    if (estado.openSessionId) throw new CashError(409, `Ya hay una caja abierta en ${scope.name}.`, 'ALREADY_OPEN');
    const pendSnap = await tx.get(movCol(negocioId).where('scopeKey', '==', scope.key).where('sessionId', '==', null));

    const now = Date.now();
    const openedAt = new Date(now).toISOString();
    const windowStart = new Date(windowStartFor(estado, now)).toISOString();
    const session = {
      scopeKey: scope.key, scopeName: scope.name, status: 'open',
      businessDate: localDateKey(now, TZ), openedAt, openedBy: actorInfo(actor),
      openingFund: fund, windowStart, previousSessionId: estado.lastClosedSessionId || null,
    };
    tx.set(sesRef, session);
    tx.set(estadoRef(negocioId, scope.key), { openSessionId: sesRef.id, updatedAt: openedAt }, { merge: true });
    // Salidas hechas con la caja cerrada (p. ej. una comisión pagada en efectivo): pasan a esta caja.
    for (const d of pendSnap.docs) {
      if (d.data()?.voided) continue;
      tx.update(d.ref, { sessionId: sesRef.id, attachedOnOpen: true });
    }
    return { session: { id: sesRef.id, ...session }, attachedCashOut: pendSnap.docs.length };
  });
}

// ───────────────────────── Salidas de efectivo ─────────────────────────

export async function addCashOut(negocioId, { branchId, branchName, amount, reason, actor }) {
  const monto = parseAmount(amount, 'salida', { allowZero: false });
  const motivo = String(reason || '').trim().slice(0, 120);
  if (motivo.length < 3) throw new CashError(400, 'Escribe el motivo de la salida.', 'REASON_REQUIRED');
  const scope = await resolveScope(negocioId, { branchId, branchName });
  const ref = movCol(negocioId).doc();
  return db.runTransaction(async (tx) => {
    const estadoSnap = await tx.get(estadoRef(negocioId, scope.key));
    const sessionId = estadoSnap.exists ? estadoSnap.data().openSessionId : null;
    if (!sessionId) throw new CashError(409, 'La caja está cerrada. Ábrela para registrar salidas de efectivo.', 'NOT_OPEN');
    const mov = {
      type: 'salida', source: 'manual', method: 'Efectivo', amount: monto, reason: motivo,
      scopeKey: scope.key, sessionId, createdAt: nowIso(), createdBy: actorInfo(actor), voided: false,
    };
    tx.set(ref, mov);
    return { id: ref.id, ...mov };
  });
}

// ───────────────────────── Cierre (el sobre) ─────────────────────────

export async function closeCash(negocioId, { branchId, branchName, sessionId, countedCash, envelopeAmount, nextFund, note, actor }) {
  const scope = await resolveScope(negocioId, { branchId, branchName });
  const paymentMethods = await getPaymentMethods(negocioId);

  return db.runTransaction(async (tx) => {
    const eRef = estadoRef(negocioId, scope.key);
    const estadoSnap = await tx.get(eRef);
    const estado = estadoSnap.exists ? estadoSnap.data() : {};
    if (!estado.openSessionId) throw new CashError(409, 'La caja ya está cerrada.', 'NOT_OPEN');
    if (sessionId && sessionId !== estado.openSessionId) throw new CashError(409, 'Esa caja ya se cerró. Actualiza la pantalla.', 'STALE_SESSION');
    const sRef = cajasCol(negocioId).doc(estado.openSessionId);
    const sesSnap = await tx.get(sRef);
    const session = { id: sesSnap.id, ...sesSnap.data() };
    if (session.status !== 'open') throw new CashError(409, 'La caja ya está cerrada.', 'NOT_OPEN');

    const closedMs = Date.now();
    const sinceMs = toMillis(session.windowStart) ?? windowStartFor(estado, toMillis(session.openedAt));
    const { citas, ventas } = await readCobrosDocs(negocioId, scope, { sinceMs, untilMs: closedMs, sessionId: session.id, get: (q) => tx.get(q) });
    const movSnap = await tx.get(movCol(negocioId).where('sessionId', '==', session.id));
    const salidas = movSnap.docs.map((d) => salidaView({ id: d.id, ...d.data() }));
    const cobros = buildCobros({ citas, ventas });
    if (cobros.length > MAX_COBROS_POR_CIERRE) throw new CashError(422, 'Demasiados cobros en una sola caja. Contacta a soporte.', 'TOO_MANY');

    const summary = computeCashSummary({ openingFund: session.openingFund, cobros, salidas, paymentMethods });
    const v = validateClose({ expectedCash: summary.expectedCash, countedCash, envelopeAmount, nextFund });
    if (!v.ok) throw new CashError(400, v.errors[0].message, 'INVALID_CLOSE');

    const closedAt = new Date(closedMs).toISOString();
    const close = {
      summary, cobros, salidas,
      countedCash: round2(countedCash), envelopeAmount: round2(envelopeAmount), nextFund: round2(nextFund),
      difference: v.difference, note: String(note || '').trim().slice(0, 300),
    };
    tx.update(sRef, { status: 'closed', closedAt, closedBy: actorInfo(actor), close, originalClose: close, corrected: false });
    tx.set(eRef, { openSessionId: null, lastClosedAt: closedAt, lastClosedSessionId: session.id, lastNextFund: close.nextFund, updatedAt: closedAt }, { merge: true });
    // Cada cobro queda atado a esta caja: no vuelve a contarse en otra.
    const citasCol = negRef(negocioId).collection('citas');
    const ventasCol = negRef(negocioId).collection('ventas');
    for (const c of cobros) {
      const ref = c.kind === 'cita' ? citasCol.doc(c.id) : ventasCol.doc(c.id);
      tx.update(ref, { cashSessionId: session.id });
    }
    return { session: { ...session, status: 'closed', closedAt, closedBy: actorInfo(actor), close }, summary, difference: v.difference };
  });
}

// ───────────────────── Corrección de una caja cerrada (con PIN) ─────────────────────

const EDITABLE = ['countedCash', 'envelopeAmount', 'nextFund', 'note'];

export async function correctCashSession(negocioId, sessionId, { pin, reason, changes = {}, actor }) {
  const motivo = String(reason || '').trim().slice(0, 300);
  if (motivo.length < 5) throw new CashError(400, 'Explica el motivo de la corrección.', 'REASON_REQUIRED');

  const hash = await getPinHash(negocioId);
  if (!hash) throw new CashError(409, 'Primero crea el PIN de Analítica. Sin PIN no se puede corregir una caja cerrada.', 'PIN_MISSING');
  if (!(await verifyPin(String(pin || ''), hash))) throw new CashError(401, 'PIN incorrecto.', 'PIN_INVALID');

  const voidIds = Array.isArray(changes.voidMovementIds) ? [...new Set(changes.voidMovementIds.map(String))] : [];
  const sRef = cajasCol(negocioId).doc(sessionId);
  const corrRef = sRef.collection('correcciones').doc();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(sRef);
    if (!snap.exists) throw new CashError(404, 'Esa caja no existe.', 'NOT_FOUND');
    const session = snap.data();
    if (session.status !== 'closed') throw new CashError(409, 'Solo se corrigen cajas cerradas.', 'NOT_CLOSED');
    const movSnaps = await Promise.all(voidIds.map((id) => tx.get(movCol(negocioId).doc(id))));
    const estadoSnap = await tx.get(estadoRef(negocioId, session.scopeKey));

    for (const m of movSnaps) {
      const d = m.exists ? m.data() : null;
      if (!d || d.sessionId !== sessionId) throw new CashError(400, 'Esa salida no pertenece a esta caja.', 'BAD_MOVEMENT');
      if (d.source !== 'manual') throw new CashError(400, 'Los pagos de comisión no se anulan desde la caja.', 'BAD_MOVEMENT');
      if (d.voided) throw new CashError(409, 'Esa salida ya estaba anulada.', 'ALREADY_VOIDED');
    }

    const prev = session.close || {};
    const salidas = (prev.salidas || []).map((s) => (voidIds.includes(s.id) ? { ...s, voided: true } : s));
    // El cálculo se rehace sobre la copia guardada al cerrar: los cobros no cambian.
    const summary = computeCashSummary({ openingFund: session.openingFund, cobros: prev.cobros || [], salidas, paymentMethods: (prev.summary?.byMethod || []).map((r) => r.method) });
    const next = { ...prev, summary, salidas };
    for (const f of EDITABLE) {
      if (changes[f] === undefined) continue;
      next[f] = f === 'note' ? String(changes[f] || '').trim().slice(0, 300) : round2(changes[f]);
    }
    const v = validateClose({ expectedCash: summary.expectedCash, countedCash: next.countedCash, envelopeAmount: next.envelopeAmount, nextFund: next.nextFund });
    if (!v.ok) throw new CashError(400, v.errors[0].message, 'INVALID_CLOSE');
    next.difference = v.difference;

    const diff = [];
    for (const f of [...EDITABLE, 'difference']) {
      if (JSON.stringify(prev[f] ?? null) !== JSON.stringify(next[f] ?? null)) diff.push({ field: f, before: prev[f] ?? null, after: next[f] ?? null });
    }
    if ((prev.summary?.expectedCash ?? null) !== summary.expectedCash) diff.push({ field: 'expectedCash', before: prev.summary?.expectedCash ?? null, after: summary.expectedCash });
    for (const id of voidIds) {
      const s = (prev.salidas || []).find((x) => x.id === id);
      diff.push({ field: 'salidaAnulada', before: s ? `${s.reason}: Bs ${s.amount}` : id, after: 'anulada' });
    }
    if (diff.length === 0) throw new CashError(400, 'No hay cambios para guardar.', 'NO_CHANGES');

    const at = nowIso();
    tx.set(corrRef, { at, by: actorInfo(actor), reason: motivo, changes: diff });
    tx.update(sRef, { close: next, corrected: true, lastCorrectedAt: at, correctionsCount: (session.correctionsCount || 0) + 1 });
    for (const m of movSnaps) tx.update(m.ref, { voided: true, voidedAt: at, voidedBy: actorInfo(actor), voidReason: motivo });
    const estado = estadoSnap.exists ? estadoSnap.data() : {};
    if (estado.lastClosedSessionId === sessionId && changes.nextFund !== undefined) {
      tx.set(estadoRef(negocioId, session.scopeKey), { lastNextFund: next.nextFund }, { merge: true });
    }
    return { session: { id: sessionId, ...session, close: next, corrected: true }, correction: { id: corrRef.id, at, reason: motivo, changes: diff } };
  });
}

// ───────────────────── Pago de comisiones ─────────────────────

/**
 * Registra el pago de las comisiones PENDIENTES de un profesional en un rango.
 * En una transacción: marca las citas como pagadas y crea el pago, así un
 * segundo clic (o dos pantallas a la vez) no paga lo mismo dos veces.
 * Efectivo: crea una salida de caja. Si la caja de esa sucursal está cerrada,
 * la salida queda pendiente y se descuenta de la próxima caja que se abra.
 */
export async function registerCommissionPayment(negocioId, { barberId, startDate, endDate, method, branchId, actor }) {
  if (!barberId) throw new CashError(400, 'Falta el profesional.', 'BARBER_REQUIRED');
  if (!startDate || !endDate) throw new CashError(400, 'Falta el periodo.', 'RANGE_REQUIRED');
  const metodo = String(method || '').trim();
  if (!isRealPaymentMethod(metodo)) throw new CashError(400, 'Elige cómo pagaste la comisión.', 'METHOD_REQUIRED');

  const nRef = negRef(negocioId);
  const [barberSnap, serviciosSnap] = await Promise.all([
    nRef.collection('profesionales').doc(barberId).get(),
    nRef.collection('servicios').get(),
  ]);
  if (!barberSnap.exists) throw new CashError(404, 'Profesional no encontrado.', 'NOT_FOUND');
  const barber = { id: barberSnap.id, ...barberSnap.data() };
  const servicios = serviciosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const isCash = isCashMethod(metodo);
  const scope = isCash ? await resolveScope(negocioId, { branchId, branchName: branchId ? null : barber.branch }).catch(() => null) : null;
  if (isCash && !scope) throw new CashError(400, 'Elige de qué caja sale el efectivo.', 'SCOPE_REQUIRED');

  const citasCol = nRef.collection('citas');
  const pagoRef = nRef.collection('commissionPayments').doc();
  const movRef = movCol(negocioId).doc();

  return db.runTransaction(async (tx) => {
    const citasSnap = await tx.get(citasCol.where('status', '==', 'completed').where('date', '>=', startDate).where('date', '<=', endDate));
    const estadoSnap = isCash ? await tx.get(estadoRef(negocioId, scope.key)) : null;

    let monto = 0;
    const citaIds = [];
    for (const d of citasSnap.docs) {
      const c = { id: d.id, ...d.data() };
      if (c.commissionPaid) continue;
      if (c.professionalId !== barberId && c.barberId !== barberId) continue;
      const { totalAmount } = calculateCommissionForCita(c, barber, servicios);
      if (totalAmount > 0) { monto += totalAmount; citaIds.push(c.id); }
    }
    monto = round2(monto);
    if (citaIds.length === 0) throw new CashError(409, 'No hay comisiones pendientes en ese periodo.', 'NOTHING_TO_PAY');

    const paidAt = nowIso();
    const sessionId = isCash ? (estadoSnap.exists ? estadoSnap.data().openSessionId || null : null) : null;
    for (const id of citaIds) tx.update(citasCol.doc(id), { commissionPaid: true, commissionPaymentId: pagoRef.id });
    const pago = {
      barberId, barberName: barber.name || '', amount: monto, citaIds, startDate, endDate,
      method: metodo, isCash, paidAt, createdBy: actorInfo(actor),
      cashMovementId: isCash ? movRef.id : null, cashScopeKey: isCash ? scope.key : null,
      cashSessionId: sessionId, cashPendingSession: isCash && !sessionId,
    };
    tx.set(pagoRef, pago);
    if (isCash) {
      tx.set(movRef, {
        type: 'salida', source: 'comision', method: metodo, amount: monto,
        reason: `Comisión ${barber.name || ''}`.trim(), scopeKey: scope.key, sessionId,
        commissionPaymentId: pagoRef.id, createdAt: paidAt, createdBy: actorInfo(actor), voided: false,
        registeredWithoutOpenCash: !sessionId,
      });
    }
    return { paymentId: pagoRef.id, monto, citaIds, method: metodo, isCash, cashSessionId: sessionId, pendingCashSession: isCash && !sessionId, scopeName: scope?.name || null };
  });
}
