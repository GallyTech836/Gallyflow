// finanzasService.js
//
// Finanzas: cuentas, a qué cuenta llega cada método de pago, saldos,
// resumen del mes e historial. Todo se lee y se escribe desde el backend.
//
// Datos (bajo negocios/{id}):
//   finanzasConfig/main      { setupDone, methodAccounts: { [methodKey]: accountId }, setupAt }
//   finanzasCuentas/{id}     { name, type, scopeKey?, openingBalance, openingAt, active, createdAt, createdBy }
//                            La Caja de cada sucursal tiene id caja_{scopeKey}.
//   finanzasMovimientos/{id} transferencias { type:'transferencia', fromAccountId, toAccountId, amount, note, at }
//                            y correcciones  { type:'ajuste', accountId, amount (±), note, at }
//                            y pagos de gastos { type:'gasto', gastoId, accountId, amount, title, category, at, cajaMovId? }
//   finanzasGastos/{id}      { title, category, total, paid, open, due, month, fijoId?, voided }
//                            un gasto del mes (pagado o no). Los fijos generan uno por mes: fijo_{fijoId}_{AAAA-MM}
//   finanzasFijos/{id}       { title, category, amount, day, active, startMonth, endMonth? } gastos que se repiten
//   finanzasMeses/{AAAA-MM}  totales de meses ya cerrados (caché para el gráfico)
//   compras/{id}             compras de inventario { supplier, branchKey, items, total, gastoId? }
//
// Un gasto pagado desde una caja también se anota en cajaMovimientos
// (source 'gasto'): así el cierre de caja cuadra. Finanzas no lo cuenta dos
// veces porque de cajaMovimientos solo toma las salidas 'manual'.
//
// Los saldos se CALCULAN (ver finanzasModel.js): no hay un campo de saldo que
// alguien pueda pisar. Escrituras con requestId del navegador como id del
// documento: un doble clic o un reintento no duplica nada.

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';
import { checkCapability } from '../capabilities/capabilityService.js';
import { branchOptions, stockOf, toInt, dropsLegacyGeneral, GENERAL_KEY } from '../inventory/stockModel.js';
import { isCashMethod, isRealPaymentMethod, round2, toMillis, localDateKey, localDayStartMillis } from '../cash/cashModel.js';
import { getCurrentCash } from '../cash/cashService.js';
import { calcularResumen } from '../finance/financeData.js';
import {
  ACCOUNT_TYPES, TYPE_LABELS, UNASSIGNED, methodKey, cajaAccountId, cashScopes, cajaAccountName,
  buildFlows, computeBalances, monthTotals, buildHistory, monthKeyOf, shiftMonth, isValidMonth,
  monthDays, monthLabel, monthShort, parseMoney, cleanName,
  GASTO_CATEGORIES, dueFor, fijoGastoId, gastoStatus, breakEven, dayLabel,
} from './finanzasModel.js';

const TZ = process.env.APP_TIMEZONE || 'America/La_Paz';
const DEFAULT_METHODS = ['Efectivo', 'Tarjeta', 'Transferencia'];
const CHART_MONTHS = 6;
const MAX_ACCOUNTS = 20;

export class FinanzasError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const negRef = (id) => db.collection('negocios').doc(id);
const configRef = (id) => negRef(id).collection('finanzasConfig').doc('main');
const cuentasCol = (id) => negRef(id).collection('finanzasCuentas');
const movsCol = (id) => negRef(id).collection('finanzasMovimientos');
const mesesCol = (id) => negRef(id).collection('finanzasMeses');
const gastosCol = (id) => negRef(id).collection('finanzasGastos');
const fijosCol = (id) => negRef(id).collection('finanzasFijos');
const CACHE_VERSION = 3; // 3: anticipos retenidos en los ingresos

const nowIso = () => new Date().toISOString();
const actorInfo = (actor) => ({ uid: actor?.uid || null, email: actor?.email || null });

function cleanRequestId(v) {
  const s = String(v || '').trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(s)) throw new FinanzasError(400, 'Falta el identificador de la operación. Recarga la página.', 'REQUEST_ID');
  return s;
}

// ───────────────────────── Lecturas base ─────────────────────────

async function readBase(negocioId) {
  const [negSnap, sucSnap, cfgSnap, ctaSnap] = await Promise.all([
    negRef(negocioId).get(),
    negRef(negocioId).collection('sucursales').get(),
    configRef(negocioId).get(),
    cuentasCol(negocioId).get(),
  ]);
  const raw = negSnap.exists ? negSnap.data()?.businessSettings?.paymentMethods : null;
  const list = Array.isArray(raw) ? raw.map((m) => String(m || '').trim()).filter(Boolean) : [];
  const paymentMethods = (list.length ? [...new Set(list)] : DEFAULT_METHODS).filter(isRealPaymentMethod);
  const sucursales = sucSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const config = cfgSnap.exists ? cfgSnap.data() : { setupDone: false, methodAccounts: {} };
  const accounts = ctaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { paymentMethods, sucursales, config, accounts };
}

/** Cobros, pagos, salidas y movimientos desde sinceMs (para saldos). */
async function readFlowsSince(negocioId, sinceMs) {
  const n = negRef(negocioId);
  const sinceIso = new Date(sinceMs).toISOString();
  const sinceDay = localDateKey(sinceMs, TZ);
  // Índices: citas (status, paidAt) y ventas (status, date) ya existen para la caja;
  // commissionPayments.paidAt, cajaMovimientos.createdAt, cajas.closedAt y finanzasMovimientos.at son de un solo campo.
  const [citasSnap, ventasSnap, pagosSnap, salidasSnap, movsSnap, cierresSnap] = await Promise.all([
    n.collection('citas').where('status', '==', 'completed').where('paidAt', '>=', sinceIso).get(),
    n.collection('ventas').where('status', '==', 'paid').where('date', '>=', localDateKey(sinceMs - 7 * 86400000, TZ)).get(),
    n.collection('commissionPayments').where('paidAt', '>=', sinceIso).get(),
    n.collection('cajaMovimientos').where('createdAt', '>=', sinceIso).get(),
    movsCol(negocioId).where('at', '>=', sinceIso).get(),
    n.collection('cajas').where('closedAt', '>=', sinceIso).get(),
  ]);
  const map = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
  const anticipos = await readAnticipos(negocioId, sinceIso, null);
  return { citas: map(citasSnap), ventas: map(ventasSnap), pagos: map(pagosSnap), salidas: map(salidasSnap), movs: map(movsSnap), cierres: map(cierresSnap), anticipos, sinceDay };
}

/**
 * Citas con anticipo cobrado o resuelto en el rango (deposit.paidAt o
 * deposit.resolvedAt). Índices de un solo campo: los crea Firestore solo.
 */
async function readAnticipos(negocioId, fromIso, toIso) {
  const col = negRef(negocioId).collection('citas');
  const rango = (field) => { let q = col.where(field, '>=', fromIso); if (toIso) q = q.where(field, '<=', toIso); return q.get(); };
  const [a, b] = await Promise.all([rango('deposit.paidAt'), rango('deposit.resolvedAt')]);
  const byId = new Map();
  for (const d of [...a.docs, ...b.docs]) byId.set(d.id, { id: d.id, ...d.data() });
  return [...byId.values()];
}

function publicAccount(a, balances, config) {
  const methods = Object.entries(config.methodAccounts || {}).filter(([, id]) => id === a.id).map(([k]) => k);
  return {
    id: a.id, name: a.name, type: a.type, typeLabel: TYPE_LABELS[a.type] || 'Otra', scopeKey: a.scopeKey || null,
    isCaja: a.type === 'efectivo', active: a.active !== false, openingBalance: round2(a.openingBalance),
    openingAt: a.openingAt || null, balance: round2(balances[a.id] ?? a.openingBalance), methodKeys: methods,
  };
}

/** Crea la Caja de las sucursales nuevas (saldo 0 desde ahora). */
async function ensureCajaAccounts(negocioId, base) {
  const scopes = cashScopes(base.sucursales);
  const missing = scopes.filter((s) => !base.accounts.some((a) => a.id === cajaAccountId(s.key)));
  if (!missing.length) return base.accounts;
  const at = nowIso();
  const created = [];
  for (const s of missing) {
    const acc = { name: cajaAccountName(s, scopes.length), type: 'efectivo', scopeKey: s.key, openingBalance: 0, openingAt: at, active: true, createdAt: at, createdBy: { uid: null, email: null, auto: true } };
    try { await cuentasCol(negocioId).doc(cajaAccountId(s.key)).create(acc); } catch (e) { if (e?.code !== 6) throw e; }
    created.push({ id: cajaAccountId(s.key), ...acc });
  }
  return [...base.accounts, ...created];
}

// ───────────────────────── Estado (cuentas y saldos) ─────────────────────────

/**
 * Cuentas con su saldo, métodos de pago y a qué cuenta llega cada uno.
 * Sin configurar todavía: devuelve lo necesario para la pregunta inicial
 * (métodos que no son efectivo y lo que hay en cada caja ahora).
 */
export async function getEstado(negocioId) {
  const base = await readBase(negocioId);
  const scopes = cashScopes(base.sucursales);
  const methods = base.paymentMethods.map((m) => ({ name: m, key: methodKey(m), isCash: isCashMethod(m), accountId: isCashMethod(m) ? null : (base.config.methodAccounts?.[methodKey(m)] || null) }));

  if (!base.config.setupDone) {
    const cajas = await Promise.all(scopes.map(async (s) => ({ scopeKey: s.key, name: cajaAccountName(s, scopes.length), balance: await currentCashOf(negocioId, s) })));
    return { setupDone: false, methods, cajas, accounts: [], unassigned: { total: 0, byMethod: {} } };
  }

  const accounts = await ensureCajaAccounts(negocioId, base);
  const active = accounts.filter((a) => a.active !== false);
  const sinceMs = Math.min(...accounts.map((a) => toMillis(a.openingAt) ?? Date.now()));
  const data = await readFlowsSince(negocioId, sinceMs);
  const flows = buildFlows({ ...data, sucursales: base.sucursales, config: base.config, sinceMs, tz: TZ });
  const { balances, unassigned } = computeBalances(accounts, flows);
  const list = accounts.map((a) => publicAccount(a, balances, base.config))
    .sort((a, b) => (b.isCaja - a.isCaja) || (b.active - a.active) || a.name.localeCompare(b.name));
  return {
    setupDone: true, methods, accounts: list,
    total: round2(active.reduce((s, a) => s + (balances[a.id] ?? 0), 0)),
    unassigned,
    unassignedMethods: methods.filter((m) => !m.isCash && !m.accountId).map((m) => m.name),
  };
}

/** Efectivo que hay en la caja de una sucursal ahora (para la pregunta inicial). */
async function currentCashOf(negocioId, scope) {
  try {
    const cur = await getCurrentCash(negocioId, scope.key === 'general' ? {} : { branchId: scope.key });
    if (cur.open) return round2(cur.summary?.expectedCash ?? 0);
    return round2(cur.suggestedOpeningFund ?? 0);
  } catch {
    return 0;
  }
}

// ───────────────────────── Pregunta inicial ─────────────────────────

/**
 * Configuración inicial (una sola vez):
 *   newAccounts: [{ tempId, name, type, balance }]  cuentas a crear
 *   map:         { [methodName]: accountId | tempId } a dónde llega cada método
 * Crea la Caja de cada sucursal con lo que hay ahora en ella.
 */
export async function setupFinanzas(negocioId, { newAccounts = [], map = {}, requestId, actor }) {
  const rid = cleanRequestId(requestId);
  const base = await readBase(negocioId);
  if (base.config.setupDone) return getEstado(negocioId);
  const scopes = cashScopes(base.sucursales);
  const nonCash = base.paymentMethods.filter((m) => !isCashMethod(m));

  if (!Array.isArray(newAccounts) || newAccounts.length > 10) throw new FinanzasError(400, 'Revisa las cuentas.', 'INVALID');
  const at = nowIso();
  const tempToId = {};
  const crear = newAccounts.map((a, i) => {
    const name = cleanName(a?.name);
    if (name.length < 2) throw new FinanzasError(400, 'Ponle nombre a cada cuenta.', 'NAME_REQUIRED');
    const type = ACCOUNT_TYPES.includes(a?.type) && a.type !== 'efectivo' ? a.type : 'banco';
    const balance = parseMoney(a?.balance);
    if (balance === null) throw new FinanzasError(400, `Escribe cuánto hay hoy en ${name} (puede ser 0).`, 'BALANCE_REQUIRED');
    const id = `cta_${rid}_${i}`;
    tempToId[String(a?.tempId ?? i)] = id;
    return { id, data: { name, type, openingBalance: balance, openingAt: at, active: true, createdAt: at, createdBy: actorInfo(actor) } };
  });

  const methodAccounts = {};
  const faltan = [];
  for (const m of nonCash) {
    const raw = map?.[m];
    const id = raw ? (tempToId[String(raw)] || raw) : null;
    const existe = id && (crear.some((c) => c.id === id) || base.accounts.some((a) => a.id === id && a.type !== 'efectivo'));
    if (!existe) faltan.push(m); else methodAccounts[methodKey(m)] = id;
  }
  if (faltan.length) throw new FinanzasError(400, `Falta elegir a dónde llega ${faltan.join(', ')}.`, 'METHOD_UNASSIGNED');

  const cajas = await Promise.all(scopes.map(async (s) => ({ id: cajaAccountId(s.key), data: { name: cajaAccountName(s, scopes.length), type: 'efectivo', scopeKey: s.key, openingBalance: await currentCashOf(negocioId, s), openingAt: at, active: true, createdAt: at, createdBy: actorInfo(actor) } })));

  await db.runTransaction(async (tx) => {
    const cfg = await tx.get(configRef(negocioId));
    if (cfg.exists && cfg.data()?.setupDone) return; // otra pantalla ya lo hizo
    const existentes = await Promise.all(cajas.map((c) => tx.get(cuentasCol(negocioId).doc(c.id))));
    cajas.forEach((c, i) => { if (!existentes[i].exists) tx.set(cuentasCol(negocioId).doc(c.id), c.data); });
    for (const c of crear) tx.set(cuentasCol(negocioId).doc(c.id), c.data);
    tx.set(configRef(negocioId), { setupDone: true, methodAccounts, setupAt: at, setupBy: actorInfo(actor), updatedAt: at });
  });
  return getEstado(negocioId);
}

// ───────────────────────── Cuentas ─────────────────────────

function cleanType(t, fallback = 'banco') {
  return ACCOUNT_TYPES.includes(t) && t !== 'efectivo' ? t : fallback;
}

/** Métodos que no son efectivo y existen en el negocio, por su clave. */
function validMethodKeys(base, methods) {
  if (!Array.isArray(methods)) return null;
  const permitidos = new Map(base.paymentMethods.filter((m) => !isCashMethod(m)).map((m) => [methodKey(m), m]));
  return [...new Set(methods.map(methodKey))].filter((k) => permitidos.has(k));
}

/** Asigna `keys` a la cuenta y quita de ella los métodos que ya no llegan ahí. */
function remapMethods(current = {}, accountId, keys) {
  const next = { ...current };
  for (const [k, id] of Object.entries(next)) if (id === accountId && !keys.includes(k)) delete next[k];
  for (const k of keys) next[k] = accountId;
  return next;
}

export async function createAccount(negocioId, { name, type, balance, methods = [], requestId, actor }) {
  const rid = cleanRequestId(requestId);
  const base = await readBase(negocioId);
  if (!base.config.setupDone) throw new FinanzasError(409, 'Primero responde a dónde llega cada cobro.', 'SETUP_REQUIRED');
  if (base.accounts.length >= MAX_ACCOUNTS) throw new FinanzasError(409, `Máximo ${MAX_ACCOUNTS} cuentas.`, 'TOO_MANY');
  const nombre = cleanName(name);
  if (nombre.length < 2) throw new FinanzasError(400, 'Ponle un nombre a la cuenta.', 'NAME_REQUIRED');
  const saldo = parseMoney(balance);
  if (saldo === null) throw new FinanzasError(400, 'Escribe cuánto hay hoy en la cuenta (puede ser 0).', 'BALANCE_REQUIRED');
  const keys = validMethodKeys(base, methods) || [];
  const id = `cta_${rid}`;
  const at = nowIso();
  await db.runTransaction(async (tx) => {
    const ref = cuentasCol(negocioId).doc(id);
    const [snap, cfg] = await Promise.all([tx.get(ref), tx.get(configRef(negocioId))]);
    if (snap.exists) return; // reintento: ya se creó
    tx.set(ref, { name: nombre, type: cleanType(type), openingBalance: saldo, openingAt: at, active: true, createdAt: at, createdBy: actorInfo(actor) });
    if (keys.length) tx.set(configRef(negocioId), { methodAccounts: remapMethods(cfg.data()?.methodAccounts, id, keys), updatedAt: at }, { merge: true });
  });
  return getEstado(negocioId);
}

/**
 * Edita una cuenta: nombre, tipo, activa, qué cobros llegan (methods) y el
 * saldo. Cambiar el saldo crea una corrección (queda en el historial).
 */
export async function updateAccount(negocioId, accountId, { name, type, active, methods, balance, requestId, actor }) {
  const rid = cleanRequestId(requestId);
  const base = await readBase(negocioId);
  if (!base.config.setupDone) throw new FinanzasError(409, 'Primero responde a dónde llega cada cobro.', 'SETUP_REQUIRED');
  const acc = base.accounts.find((a) => a.id === accountId);
  if (!acc) throw new FinanzasError(404, 'Esa cuenta no existe.', 'NOT_FOUND');
  const esCaja = acc.type === 'efectivo';
  const estado = await getEstado(negocioId);
  const actual = estado.accounts.find((a) => a.id === accountId)?.balance ?? 0;

  const patch = {};
  if (name !== undefined) {
    const nombre = cleanName(name);
    if (nombre.length < 2) throw new FinanzasError(400, 'Ponle un nombre a la cuenta.', 'NAME_REQUIRED');
    patch.name = nombre;
  }
  if (type !== undefined && !esCaja) patch.type = cleanType(type, acc.type);
  const keys = esCaja ? null : validMethodKeys(base, methods);
  let saldo = null;
  if (balance !== undefined && balance !== null && balance !== '') {
    saldo = parseMoney(balance);
    if (saldo === null) throw new FinanzasError(400, 'Escribe el saldo (puede ser 0).', 'BALANCE_REQUIRED');
  }
  const diff = saldo === null ? 0 : round2(saldo - actual);
  if (active === false) {
    if (esCaja) throw new FinanzasError(400, 'La caja de una sucursal no se puede desactivar.', 'CAJA_FIXED');
    const recibe = keys ?? Object.entries(base.config.methodAccounts || {}).filter(([, id]) => id === accountId).map(([k]) => k);
    if (recibe.length) throw new FinanzasError(409, 'Antes de desactivarla, quita los cobros que llegan aquí.', 'HAS_METHODS');
    if (round2(actual + diff) !== 0) throw new FinanzasError(409, 'Pasa el saldo a otra cuenta antes de desactivarla.', 'HAS_BALANCE');
    patch.active = false;
  } else if (active === true) patch.active = true;

  const at = nowIso();
  await db.runTransaction(async (tx) => {
    const ajRef = movsCol(negocioId).doc(`aj_${rid}`);
    const [cfg, aj] = await Promise.all([tx.get(configRef(negocioId)), tx.get(ajRef)]);
    if (aj.exists) return; // reintento
    if (Object.keys(patch).length) tx.update(cuentasCol(negocioId).doc(accountId), { ...patch, updatedAt: at });
    if (keys) tx.set(configRef(negocioId), { methodAccounts: remapMethods(cfg.data()?.methodAccounts, accountId, keys), updatedAt: at }, { merge: true });
    if (diff !== 0) tx.set(ajRef, { type: 'ajuste', accountId, amount: diff, before: actual, after: saldo, note: 'Corrección de saldo', at, createdBy: actorInfo(actor) });
  });
  return getEstado(negocioId);
}

// ───────────────────────── Transferencias ─────────────────────────

export async function createTransfer(negocioId, { fromAccountId, toAccountId, amount, note, requestId, actor }) {
  const rid = cleanRequestId(requestId);
  if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) throw new FinanzasError(400, 'Elige dos cuentas distintas.', 'SAME_ACCOUNT');
  const monto = parseMoney(amount, { allowZero: false });
  if (monto === null) throw new FinanzasError(400, 'Escribe un importe mayor a 0.', 'INVALID_AMOUNT');
  const estado = await getEstado(negocioId);
  if (!estado.setupDone) throw new FinanzasError(409, 'Primero responde a dónde llega cada cobro.', 'SETUP_REQUIRED');
  const from = estado.accounts.find((a) => a.id === fromAccountId && a.active);
  const to = estado.accounts.find((a) => a.id === toAccountId && a.active);
  if (!from || !to) throw new FinanzasError(404, 'Esa cuenta no existe.', 'NOT_FOUND');
  if (monto > from.balance) throw new FinanzasError(409, `En ${from.name} hay ${fmt(from.balance)}.`, 'INSUFFICIENT');
  const ref = movsCol(negocioId).doc(`tr_${rid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return;
    tx.set(ref, { type: 'transferencia', fromAccountId, toAccountId, amount: monto, note: cleanName(note, 80) || 'Transferencia', at: nowIso(), createdBy: actorInfo(actor) });
  });
  return getEstado(negocioId);
}

const fmt = (n) => `Bs ${round2(n).toLocaleString('es-BO')}`;

// ───────────────────────── Resumen del mes ─────────────────────────

function monthMs(ym) {
  const { startDay, endDay } = monthDays(ym);
  const startMs = localDayStartMillis(Date.parse(`${startDay}T12:00:00Z`), TZ);
  const endMs = localDayStartMillis(Date.parse(`${shiftMonth(ym, 1)}-01T12:00:00Z`), TZ) - 1;
  return { startDay, endDay, startMs, endMs };
}

/** Lecturas de un mes: citas completadas por fecha, ventas, pagos y salidas. */
async function readMonth(negocioId, ym) {
  const n = negRef(negocioId);
  const { startDay, endDay, startMs, endMs } = monthMs(ym);
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const [citasSnap, ventasSnap, pagosSnap, salidasSnap, gastosSnap, movsSnap] = await Promise.all([
    n.collection('citas').where('status', '==', 'completed').where('date', '>=', startDay).where('date', '<=', endDay).get(),
    n.collection('ventas').where('status', '==', 'paid').where('date', '>=', startDay).where('date', '<=', endDay).get(),
    n.collection('commissionPayments').where('paidAt', '>=', startIso).where('paidAt', '<=', endIso).get(),
    n.collection('cajaMovimientos').where('createdAt', '>=', startIso).where('createdAt', '<=', endIso).get(),
    gastosCol(negocioId).where('month', '==', ym).get(),
    movsCol(negocioId).where('at', '>=', startIso).where('at', '<=', endIso).get(),
  ]);
  const map = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
  const movs = map(movsSnap);
  const anticipos = await readAnticipos(negocioId, startIso, endIso);
  return { citas: map(citasSnap), ventas: map(ventasSnap), pagos: map(pagosSnap), salidas: map(salidasSnap), gastos: map(gastosSnap), gastoPagos: movs.filter((m) => m.type === 'gasto'), movs, anticipos, startDay, endDay, startMs, endMs };
}

async function readStaff(negocioId) {
  const n = negRef(negocioId);
  const [b, s] = await Promise.all([n.collection('profesionales').get(), n.collection('servicios').get()]);
  return { barbers: b.docs.map((d) => ({ id: d.id, ...d.data() })), servicios: s.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

async function totalsOf(negocioId, ym, staff, data = null) {
  const d = data || await readMonth(negocioId, ym);
  const { comisionGenerada } = calcularResumen(d.citas, staff.barbers, staff.servicios);
  return monthTotals({ ...d, comisionesGeneradas: comisionGenerada, tz: TZ });
}

/** Meses ya cerrados: se guardan una vez (con 3 días de margen para correcciones). */
async function cachedTotals(negocioId, ym, staff) {
  const { endMs } = monthMs(ym);
  const cerrado = Date.now() > endMs + 3 * 86400000;
  const ref = mesesCol(negocioId).doc(ym);
  if (cerrado) {
    const snap = await ref.get();
    if (snap.exists && snap.data().v === CACHE_VERSION && (toMillis(snap.data().computedAt) ?? 0) > endMs + 3 * 86400000) return snap.data().totals;
  }
  const totals = await totalsOf(negocioId, ym, staff);
  if (cerrado) await ref.set({ totals, v: CACHE_VERSION, computedAt: nowIso() });
  return totals;
}

/**
 * Resumen de un mes (por defecto el actual): totales, gráfico de los últimos
 * meses e historial con a qué cuenta entró o de cuál salió cada cosa.
 */
export async function getResumen(negocioId, { month } = {}) {
  const nowMs = Date.now();
  const actual = monthKeyOf(nowMs, TZ);
  const ym = isValidMonth(month) ? month : actual;
  if (ym > actual) throw new FinanzasError(400, 'Ese mes todavía no empezó.', 'FUTURE_MONTH');

  await ensureFijos(negocioId);
  const [base, staff, data] = await Promise.all([readBase(negocioId), readStaff(negocioId), readMonth(negocioId, ym)]);
  const totals = await totalsOf(negocioId, ym, staff, data);

  const meses = [];
  for (let i = CHART_MONTHS - 1; i >= 0; i--) meses.push(shiftMonth(actual, -i));
  const chart = await Promise.all(meses.map(async (m) => {
    const t = m === ym ? totals : await cachedTotals(negocioId, m, staff);
    return { month: m, label: monthShort(m), ingresos: t.ingresos, salio: t.salio, partial: m === actual };
  }));

  // Historial: los movimientos de Finanzas del mes se suman a lo leído.
  const movs = data.movs;
  const cierresSnap = await negRef(negocioId).collection('cajas').where('closedAt', '>=', new Date(data.startMs).toISOString()).where('closedAt', '<=', new Date(data.endMs).toISOString()).get();
  const cierres = cierresSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const flows = buildFlows({ citas: data.citas, ventas: data.ventas, pagos: data.pagos, salidas: data.salidas, movs, cierres, anticipos: data.anticipos, sucursales: base.sucursales, config: base.config, sinceMs: 0, tz: TZ });
  const accounts = base.accounts.map((a) => ({ id: a.id, name: a.name }));
  const history = buildHistory(flows, accounts, { startDay: data.startDay, endDay: data.endDay });

  const { daysInMonth } = monthDays(ym);
  const hoy = Number(localDateKey(nowMs, TZ).slice(8, 10));
  return {
    month: ym, label: monthLabel(ym), current: ym === actual,
    daysLeft: ym === actual ? Math.max(0, daysInMonth - hoy) : 0,
    ...totals,
    chart,
    history,
    setupDone: !!base.config.setupDone,
  };
}

// ───────────────────────── Gastos ─────────────────────────

const todayKey = () => localDateKey(Date.now(), TZ);
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

/** Crea el gasto de cada mes de los fijos activos (este mes y, si faltan, los dos anteriores). */
async function ensureFijos(negocioId) {
  const cur = monthKeyOf(Date.now(), TZ);
  const snap = await fijosCol(negocioId).where('active', '==', true).get();
  const desde = shiftMonth(cur, -2);
  const tareas = [];
  for (const d of snap.docs) {
    const f = d.data();
    for (let ym = f.startMonth > desde ? f.startMonth : desde; ym <= cur; ym = shiftMonth(ym, 1)) {
      const ref = gastosCol(negocioId).doc(fijoGastoId(d.id, ym));
      const doc = { title: f.title, category: f.category, total: round2(f.amount), paid: 0, open: true, due: dueFor(ym, f.day), month: ym, fijoId: d.id, voided: false, createdAt: nowIso(), auto: true };
      tareas.push(ref.create(doc).catch((e) => { if (e?.code !== 6) throw e; }));
    }
  }
  await Promise.all(tareas);
}

function gastoView(g, today, accountsById = {}) {
  const rem = round2(g.total - (g.paid || 0));
  return {
    id: g.id, title: g.title, category: g.category, total: round2(g.total), paid: round2(g.paid || 0), remaining: rem,
    due: g.due, dueLabel: dayLabel(g.due), month: g.month, fijoId: g.fijoId || null, status: gastoStatus(g, today),
    days: Math.round((Date.parse(`${g.due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000),
    lastAccount: g.lastAccountId ? (accountsById[g.lastAccountId] || null) : null,
  };
}

/**
 * Gastos para la pestaña Gastos: todo lo que falta pagar, lo de este mes y el
 * anterior, las salidas de caja de este mes y los gastos que se repiten.
 */
export async function listGastos(negocioId) {
  await ensureFijos(negocioId);
  const cur = monthKeyOf(Date.now(), TZ);
  const today = todayKey();
  const { startMs } = monthMs(cur);
  const [abiertos, recientes, fijosSnap, salidasSnap, ctaSnap] = await Promise.all([
    gastosCol(negocioId).where('open', '==', true).get(),
    gastosCol(negocioId).where('month', '>=', shiftMonth(cur, -1)).get(),
    fijosCol(negocioId).where('active', '==', true).get(),
    negRef(negocioId).collection('cajaMovimientos').where('createdAt', '>=', new Date(startMs).toISOString()).get(),
    cuentasCol(negocioId).get(),
  ]);
  const accountsById = Object.fromEntries(ctaSnap.docs.map((d) => [d.id, d.data().name]));
  const byId = new Map();
  for (const d of [...abiertos.docs, ...recientes.docs]) {
    const g = { id: d.id, ...d.data() };
    if (!g.voided) byId.set(g.id, gastoView(g, today, accountsById));
  }
  const items = [...byId.values()];
  const porPagar = items.filter((g) => g.remaining > 0).sort((a, b) => a.due.localeCompare(b.due));
  const salidas = salidasSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.source === 'manual' && !m.voided)
    .map((m) => ({ id: `salida_${m.id}`, title: m.reason || 'Salida de caja', category: 'Salida de caja', total: round2(m.amount), day: localDateKey(toMillis(m.createdAt), TZ), dayLabel: dayLabel(localDateKey(toMillis(m.createdAt), TZ)), account: accountsById[cajaAccountId(m.scopeKey)] || 'Caja' }));
  const fijos = fijosSnap.docs.map((d) => ({ id: d.id, title: d.data().title, category: d.data().category, amount: round2(d.data().amount), day: d.data().day }))
    .sort((a, b) => a.day - b.day);
  return {
    month: cur, categories: GASTO_CATEGORIES,
    owe: round2(porPagar.reduce((t, g) => t + g.remaining, 0)),
    porPagar, items, salidas, fijos,
  };
}

/** Escribe un pago dentro de una transacción (ya validado). Devuelve las escrituras. */
async function paymentWrites(tx, negocioId, { gasto, gastoRef, account, amount, rid, actor, at }) {
  const movRef = movsCol(negocioId).doc(`gp_${rid}`);
  const mov = { type: 'gasto', gastoId: gastoRef.id, accountId: account.id, amount, title: gasto.title, category: gasto.category, at, createdBy: actorInfo(actor), voided: false };
  let caja = null;
  if (account.isCaja && account.scopeKey) {
    const est = await tx.get(negRef(negocioId).collection('cajaEstado').doc(account.scopeKey));
    caja = { ref: negRef(negocioId).collection('cajaMovimientos').doc(`gasto_${rid}`), sessionId: est.exists ? est.data().openSessionId || null : null };
    mov.cajaMovId = caja.ref.id;
  }
  return () => {
    tx.set(movRef, mov);
    if (caja) {
      tx.set(caja.ref, { type: 'salida', source: 'gasto', gastoId: gastoRef.id, finanzasMovId: movRef.id, method: 'Efectivo', amount, reason: gasto.title, scopeKey: account.scopeKey, sessionId: caja.sessionId, createdAt: at, createdBy: actorInfo(actor), voided: false });
    }
  };
}

async function requirePayable(negocioId, accountId, amount, { hideBalance = false } = {}) {
  const estado = await getEstado(negocioId);
  if (!estado.setupDone) throw new FinanzasError(409, 'Primero responde a dónde llega cada cobro.', 'SETUP_REQUIRED');
  const account = estado.accounts.find((a) => a.id === accountId && a.active);
  if (!account) throw new FinanzasError(400, 'Elige de dónde salió la plata.', 'ACCOUNT_REQUIRED');
  if (amount > account.balance) throw new FinanzasError(409, hideBalance ? `No alcanza el saldo de ${account.name}. Elige otra cuenta o márcalo para pagar después.` : `No alcanza: en ${account.name} hay ${fmt(account.balance)}.`, 'INSUFFICIENT');
  return account;
}

async function dropCache(negocioId, months) {
  await Promise.all([...new Set(months.filter(Boolean))].map((m) => mesesCol(negocioId).doc(m).delete().catch(() => {})));
}

/**
 * Registrar gasto.
 *   paidNow + accountId  ya se pagó: sale de esa cuenta (y de la caja si es la caja)
 *   !paidNow + due       se paga después: queda en «Tienes que pagar»
 *   repeat + day         se repite cada mes: crea el fijo y el gasto de este mes
 */
export async function createGasto(negocioId, { title, category, amount, paidNow, accountId, due, repeat, day, requestId, actor }) {
  const rid = cleanRequestId(requestId);
  const titulo = cleanName(title, 80);
  if (titulo.length < 2) throw new FinanzasError(400, 'Escribe en qué fue el gasto.', 'TITLE_REQUIRED');
  const monto = parseMoney(amount, { allowZero: false });
  if (monto === null) throw new FinanzasError(400, 'Escribe cuánto fue.', 'INVALID_AMOUNT');
  const cat = GASTO_CATEGORIES.includes(category) ? category : 'Otros';
  const today = todayKey();
  const cur = today.slice(0, 7);
  const dia = Math.floor(Number(day));
  if (repeat && !(dia >= 1 && dia <= 31)) throw new FinanzasError(400, 'El día de pago va del 1 al 31.', 'INVALID_DAY');
  if (!repeat && !paidNow && !isDay(due)) throw new FinanzasError(400, 'Elige hasta cuándo tienes que pagarlo.', 'DUE_REQUIRED');

  const account = paidNow ? await requirePayable(negocioId, accountId, monto) : null;
  const vence = repeat ? dueFor(cur, dia) : (paidNow ? today : due);
  const fijoId = repeat ? `fijo_${rid}` : null;
  const gastoRef = gastosCol(negocioId).doc(repeat ? fijoGastoId(fijoId, cur) : `g_${rid}`);
  const at = nowIso();
  const gasto = {
    title: titulo, category: cat, total: monto, paid: paidNow ? monto : 0, open: !paidNow, due: vence, month: vence.slice(0, 7),
    fijoId, voided: false, createdAt: at, createdBy: actorInfo(actor), lastAccountId: account?.id || null,
  };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(gastoRef);
    if (snap.exists) return; // reintento
    const pay = account ? await paymentWrites(tx, negocioId, { gasto, gastoRef, account, amount: monto, rid, actor, at }) : null;
    if (repeat) tx.set(fijosCol(negocioId).doc(fijoId), { title: titulo, category: cat, amount: monto, day: dia, active: true, startMonth: cur, createdAt: at, createdBy: actorInfo(actor) });
    tx.set(gastoRef, gasto);
    pay?.();
  });
  await dropCache(negocioId, [gasto.month, cur]);
  return { ...(await listGastos(negocioId)), saved: { id: gastoRef.id, paidNow: !!paidNow, repeat: !!repeat, day: dia, account: account?.name || null, fromCaja: !!account?.isCaja } };
}

/** Pagar un gasto (todo o una parte). */
export async function payGasto(negocioId, gastoId, { amount, accountId, requestId, actor }) {
  const rid = cleanRequestId(requestId);
  const monto = parseMoney(amount, { allowZero: false });
  if (monto === null) throw new FinanzasError(400, 'Escribe cuánto pagas.', 'INVALID_AMOUNT');
  const gastoRef = gastosCol(negocioId).doc(String(gastoId || ''));
  const pre = await gastoRef.get();
  if (!pre.exists || pre.data().voided) throw new FinanzasError(404, 'Ese gasto no existe.', 'NOT_FOUND');
  const restante = round2(pre.data().total - (pre.data().paid || 0));
  if (restante <= 0) throw new FinanzasError(409, 'Ese gasto ya está pagado.', 'ALREADY_PAID');
  if (monto > restante) throw new FinanzasError(400, `Solo faltan ${fmt(restante)}.`, 'TOO_MUCH');
  const account = await requirePayable(negocioId, accountId, monto);
  const at = nowIso();
  let resto = restante;
  await db.runTransaction(async (tx) => {
    const movRef = movsCol(negocioId).doc(`gp_${rid}`);
    const [snap, movSnap] = await Promise.all([tx.get(gastoRef), tx.get(movRef)]);
    if (movSnap.exists) return; // reintento
    const g = snap.data();
    const falta = round2(g.total - (g.paid || 0));
    if (monto > falta) throw new FinanzasError(409, falta > 0 ? `Solo faltan ${fmt(falta)}.` : 'Ese gasto ya está pagado.', 'TOO_MUCH');
    const pay = await paymentWrites(tx, negocioId, { gasto: g, gastoRef, account, amount: monto, rid, actor, at });
    resto = round2(falta - monto);
    tx.update(gastoRef, { paid: round2((g.paid || 0) + monto), open: resto > 0, lastAccountId: account.id, updatedAt: at });
    pay();
  });
  await dropCache(negocioId, [pre.data().month, todayKey().slice(0, 7)]);
  return { ...(await listGastos(negocioId)), saved: { remaining: resto, account: account.name } };
}

/**
 * Eliminar un gasto mal cargado. Sus pagos se anulan (la plata vuelve a la
 * cuenta). No se puede si algún pago salió de una caja que ya se cerró.
 */
export async function deleteGasto(negocioId, gastoId, { actor }) {
  const gastoRef = gastosCol(negocioId).doc(String(gastoId || ''));
  const snap = await gastoRef.get();
  if (!snap.exists || snap.data().voided) throw new FinanzasError(404, 'Ese gasto no existe.', 'NOT_FOUND');
  const pagosSnap = await movsCol(negocioId).where('gastoId', '==', gastoRef.id).get();
  const pagos = pagosSnap.docs.filter((d) => !d.data().voided);
  const at = nowIso();
  await db.runTransaction(async (tx) => {
    const cajaRefs = pagos.filter((d) => d.data().cajaMovId).map((d) => negRef(negocioId).collection('cajaMovimientos').doc(d.data().cajaMovId));
    const cajaSnaps = await Promise.all(cajaRefs.map((r) => tx.get(r)));
    const sesIds = [...new Set(cajaSnaps.map((c) => c.data()?.sessionId).filter(Boolean))];
    const sesSnaps = await Promise.all(sesIds.map((id) => tx.get(negRef(negocioId).collection('cajas').doc(id))));
    if (sesSnaps.some((s) => s.exists && s.data().status === 'closed')) {
      throw new FinanzasError(409, 'Se pagó con efectivo de una caja que ya se cerró: no se puede eliminar. Si hace falta, corrige el saldo de la caja.', 'CASH_CLOSED');
    }
    for (const d of pagos) tx.update(d.ref, { voided: true, voidedAt: at, voidedBy: actorInfo(actor) });
    cajaSnaps.forEach((c, i) => { if (c.exists) tx.update(cajaRefs[i], { voided: true, voidedAt: at }); });
    tx.update(gastoRef, { voided: true, open: false, voidedAt: at, voidedBy: actorInfo(actor) });
  });
  await dropCache(negocioId, [snap.data().month, ...pagos.map((d) => String(d.data().at || '').slice(0, 7))]);
  return listGastos(negocioId);
}

/** Dejar de repetir un gasto fijo. Lo ya generado queda como está. */
export async function stopFijo(negocioId, fijoId, { actor }) {
  const ref = fijosCol(negocioId).doc(String(fijoId || ''));
  const snap = await ref.get();
  if (!snap.exists) throw new FinanzasError(404, 'Ese gasto no existe.', 'NOT_FOUND');
  await ref.update({ active: false, endMonth: monthKeyOf(Date.now(), TZ), stoppedAt: nowIso(), stoppedBy: actorInfo(actor) });
  return listGastos(negocioId);
}

// ───────────────────────── Punto de equilibrio ─────────────────────────

/**
 * Cuánto hay que vender en el mes para cubrir los gastos fijos.
 * Si todavía no se vendió nada este mes, usa el margen del mes pasado.
 */
export async function getEquilibrio(negocioId) {
  await ensureFijos(negocioId);
  const cur = monthKeyOf(Date.now(), TZ);
  const staff = await readStaff(negocioId);
  const t = await totalsOf(negocioId, cur, staff);
  let fallback = null;
  if (!(t.ingresos > 0)) {
    const prev = await cachedTotals(negocioId, shiftMonth(cur, -1), staff);
    if (prev.ingresos > 0) fallback = (prev.ingresos - prev.comisiones - Math.max(0, prev.gastos - prev.fijos)) / prev.ingresos;
  }
  const be = breakEven(t, fallback);
  const { daysInMonth } = monthDays(cur);
  const hoy = Number(todayKey().slice(8, 10));
  return { month: cur, label: monthLabel(cur), daysLeft: Math.max(0, daysInMonth - hoy), ...be };
}

// ───────────────────────── Compras de inventario ─────────────────────────

/** ¿Este negocio puede anotar la compra en Finanzas? (plan con Finanzas y cuentas configuradas) */
async function finanzasActivas(negocioId) {
  const [cap, cfg] = await Promise.all([checkCapability(negocioId, 'finanzas', { checkLimit: false }), configRef(negocioId).get()]);
  return cap.allowed && cfg.exists && cfg.data()?.setupDone === true;
}

/**
 * Lo que necesita la ventana «Registrar compra»: si se anota en Finanzas y
 * de qué cuentas puede salir la plata (solo nombres: Inventario no ve saldos).
 */
export async function getCompraOpciones(negocioId) {
  if (!(await finanzasActivas(negocioId))) return { finanzas: false, accounts: [] };
  const snap = await cuentasCol(negocioId).get();
  const accounts = snap.docs.map((d) => ({ id: d.id, name: d.data().name, isCaja: d.data().type === 'efectivo', active: d.data().active !== false }))
    .filter((a) => a.active).sort((a, b) => (b.isCaja - a.isCaja) || a.name.localeCompare(b.name));
  return { finanzas: true, accounts };
}

/**
 * Registrar compra: en una sola transacción sube el stock de la sucursal,
 * deja cada entrada en movimientosInventario, guarda la compra y, si el
 * negocio usa Finanzas, anota el gasto (pagado desde una cuenta o por pagar).
 * El costo de cada producto queda como su último costo de compra.
 */
export async function createCompra(negocioId, { branchKey, supplier, items, paidNow, accountId, due, requestId, actor }) {
  const rid = cleanRequestId(requestId);
  const proveedor = cleanName(supplier, 80);
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new FinanzasError(400, 'Agrega al menos un producto.', 'ITEMS_REQUIRED');

  // Mismo producto dos veces: se junta en una línea (con el costo promedio).
  const byId = new Map();
  for (const it of items) {
    const id = String(it?.productId || '').trim();
    const qty = toInt(it?.qty);
    const cost = parseMoney(it?.cost);
    if (!id) throw new FinanzasError(400, 'Elige el producto de cada línea.', 'PRODUCT_REQUIRED');
    if (!(qty > 0)) throw new FinanzasError(400, 'La cantidad tiene que ser mayor a 0.', 'INVALID_QTY');
    if (cost === null) throw new FinanzasError(400, 'Escribe el costo de cada producto (puede ser 0).', 'INVALID_COST');
    const prev = byId.get(id);
    if (prev) { prev.subtotal = round2(prev.subtotal + qty * cost); prev.qty += qty; } else byId.set(id, { productId: id, qty, subtotal: round2(qty * cost) });
  }
  const lineas = [...byId.values()].map((l) => ({ ...l, cost: round2(l.subtotal / l.qty) }));
  const total = round2(lineas.reduce((t, l) => t + l.subtotal, 0));

  const sucSnap = await negRef(negocioId).collection('sucursales').get();
  const branches = sucSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const opts = branchOptions(branches);
  const key = opts.some((b) => b.key === branchKey) ? branchKey : (opts.length === 1 ? opts[0].key : null);
  if (!key) throw new FinanzasError(400, 'Elige a qué sucursal llega la compra.', 'BRANCH_REQUIRED');
  const branchName = opts.find((b) => b.key === key)?.name || 'General';

  const conFinanzas = await finanzasActivas(negocioId);
  let account = null;
  const today = todayKey();
  if (conFinanzas) {
    if (paidNow) {
      if (!(total > 0)) throw new FinanzasError(400, 'El total es 0: no hay nada que pagar.', 'ZERO_TOTAL');
      account = await requirePayable(negocioId, accountId, total, { hideBalance: true });
    } else if (!isDay(due)) throw new FinanzasError(400, 'Elige hasta cuándo tienes que pagarlo.', 'DUE_REQUIRED');
  }

  const compraRef = negRef(negocioId).collection('compras').doc(`compra_${rid}`);
  const gastoRef = gastosCol(negocioId).doc(`g_compra_${rid}`);
  const prodRefs = lineas.map((l) => negRef(negocioId).collection('productos').doc(l.productId));
  const at = nowIso();
  const conGasto = conFinanzas && total > 0;
  const vence = paidNow ? today : due;
  const gasto = conGasto ? {
    title: proveedor ? `Compra a ${proveedor}` : 'Compra de productos', category: 'Productos', total,
    paid: paidNow ? total : 0, open: !paidNow, due: vence, month: vence.slice(0, 7), fijoId: null,
    compraId: compraRef.id, voided: false, createdAt: at, createdBy: actorInfo(actor), lastAccountId: account?.id || null,
  } : null;
  let saved = null;

  await db.runTransaction(async (tx) => {
    const [compraSnap, ...prodSnaps] = await Promise.all([tx.get(compraRef), ...prodRefs.map((r) => tx.get(r))]);
    if (compraSnap.exists) { saved = compraSnap.data(); return; } // reintento
    const faltan = prodSnaps.filter((p) => !p.exists);
    if (faltan.length) throw new FinanzasError(404, 'Uno de los productos ya no existe. Recarga la página.', 'PRODUCT_NOT_FOUND');
    const pay = account ? await paymentWrites(tx, negocioId, { gasto, gastoRef, account, amount: total, rid, actor, at }) : null;

    const detalle = [];
    prodSnaps.forEach((snap, i) => {
      const p = { id: snap.id, ...snap.data() };
      const l = lineas[i];
      const before = stockOf(p, key, branches);
      const after = before + l.qty;
      // El mapa de stock completo (leído en esta misma transacción) con la sucursal al día.
      const stock = { ...(p.stock && typeof p.stock === 'object' ? p.stock : {}), [key]: after };
      if (dropsLegacyGeneral(p, key, branches)) delete stock[GENERAL_KEY];
      tx.update(prodRefs[i], { stock, cost: l.cost, updatedAt: FieldValue.serverTimestamp() });
      tx.set(negRef(negocioId).collection('movimientosInventario').doc(`compra_${rid}_${i}`), {
        type: 'compra', productId: p.id, productName: p.name || '', branchKey: key, branchName,
        qty: l.qty, before, after, reason: proveedor ? `Compra · ${proveedor}` : 'Compra',
        purchaseId: compraRef.id, createdBy: actor?.uid || null, createdAt: FieldValue.serverTimestamp(),
      });
      detalle.push({ productId: p.id, name: p.name || '', qty: l.qty, cost: l.cost, subtotal: l.subtotal });
    });
    saved = { supplier: proveedor, branchKey: key, branchName, items: detalle, total, date: today, gastoId: conGasto ? gastoRef.id : null, paidNow: conGasto ? !!paidNow : null, createdAt: at, createdBy: actorInfo(actor) };
    tx.set(compraRef, saved);
    if (conGasto) { tx.set(gastoRef, gasto); pay?.(); }
  });
  if (conGasto) await dropCache(negocioId, [gasto.month, today.slice(0, 7)]);
  return { id: compraRef.id, total: saved.total, finanzas: !!saved.gastoId, paidNow: !!saved.paidNow, account: account?.name || null, fromCaja: !!account?.isCaja };
}

export { UNASSIGNED };
