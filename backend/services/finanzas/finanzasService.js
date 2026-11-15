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
//   finanzasMeses/{AAAA-MM}  totales de meses ya cerrados (caché para el gráfico)
//
// Los saldos se CALCULAN (ver finanzasModel.js): no hay un campo de saldo que
// alguien pueda pisar. Escrituras con requestId del navegador como id del
// documento: un doble clic o un reintento no duplica nada.

import { db } from '../../config/firebase.js';
import { isCashMethod, isRealPaymentMethod, round2, toMillis, localDateKey, localDayStartMillis } from '../cash/cashModel.js';
import { getCurrentCash } from '../cash/cashService.js';
import { calcularResumen } from '../finance/financeData.js';
import {
  ACCOUNT_TYPES, TYPE_LABELS, UNASSIGNED, methodKey, cajaAccountId, cashScopes, cajaAccountName,
  buildFlows, computeBalances, monthTotals, buildHistory, monthKeyOf, shiftMonth, isValidMonth,
  monthDays, monthLabel, monthShort, parseMoney, cleanName,
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
  return { citas: map(citasSnap), ventas: map(ventasSnap), pagos: map(pagosSnap), salidas: map(salidasSnap), movs: map(movsSnap), cierres: map(cierresSnap), sinceDay };
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
  const [citasSnap, ventasSnap, pagosSnap, salidasSnap] = await Promise.all([
    n.collection('citas').where('status', '==', 'completed').where('date', '>=', startDay).where('date', '<=', endDay).get(),
    n.collection('ventas').where('status', '==', 'paid').where('date', '>=', startDay).where('date', '<=', endDay).get(),
    n.collection('commissionPayments').where('paidAt', '>=', startIso).where('paidAt', '<=', endIso).get(),
    n.collection('cajaMovimientos').where('createdAt', '>=', startIso).where('createdAt', '<=', endIso).get(),
  ]);
  const map = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { citas: map(citasSnap), ventas: map(ventasSnap), pagos: map(pagosSnap), salidas: map(salidasSnap), startDay, endDay, startMs, endMs };
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
    if (snap.exists && (toMillis(snap.data().computedAt) ?? 0) > endMs + 3 * 86400000) return snap.data().totals;
  }
  const totals = await totalsOf(negocioId, ym, staff);
  if (cerrado) await ref.set({ totals, computedAt: nowIso() });
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

  const [base, staff, data] = await Promise.all([readBase(negocioId), readStaff(negocioId), readMonth(negocioId, ym)]);
  const totals = await totalsOf(negocioId, ym, staff, data);

  const meses = [];
  for (let i = CHART_MONTHS - 1; i >= 0; i--) meses.push(shiftMonth(actual, -i));
  const chart = await Promise.all(meses.map(async (m) => {
    const t = m === ym ? totals : await cachedTotals(negocioId, m, staff);
    return { month: m, label: monthShort(m), ingresos: t.ingresos, salio: t.salio, partial: m === actual };
  }));

  // Historial: los movimientos de Finanzas del mes se suman a lo leído.
  const movsSnap = await movsCol(negocioId).where('at', '>=', new Date(data.startMs).toISOString()).where('at', '<=', new Date(data.endMs).toISOString()).get();
  const movs = movsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cierresSnap = await negRef(negocioId).collection('cajas').where('closedAt', '>=', new Date(data.startMs).toISOString()).where('closedAt', '<=', new Date(data.endMs).toISOString()).get();
  const cierres = cierresSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const flows = buildFlows({ citas: data.citas, ventas: data.ventas, pagos: data.pagos, salidas: data.salidas, movs, cierres, sucursales: base.sucursales, config: base.config, sinceMs: 0, tz: TZ });
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

export { UNASSIGNED };
