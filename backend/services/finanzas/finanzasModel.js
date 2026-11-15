// finanzasModel.js
//
// Lógica PURA (sin Firebase) del módulo Finanzas.
//
// Idea central: los saldos NO se guardan ni se suman a mano en cada
// operación. Se calculan siempre a partir de lo que Nexus ya registra:
//   + cobros de citas y ventas      (a la cuenta de su método de pago;
//                                    efectivo -> la Caja de su sucursal)
//   - pagos de comisiones           (commissionPayments, por su método)
//   - salidas manuales de caja      (cajaMovimientos source 'manual', no anuladas)
//   ± movimientos de Finanzas       (transferencias, correcciones y pagos de gastos)
//   ± diferencia al cerrar caja     (faltante o sobrante contado en el cierre)
//   + anticipos por QR              (el día que el dueño los confirma; la cita después cobra solo el saldo)
//   - anticipos devueltos           (salen de la misma cuenta donde entraron)
// Así un cobro nunca se cuenta dos veces, y si cambia el método de un pago de
// comisión el saldo se corrige solo.
//
// Cada cuenta tiene un saldo inicial y desde cuándo vale (openingAt): solo
// cuentan los movimientos desde ese momento.

import { isCashMethod, isRealPaymentMethod, round2, toMillis, amountOfCita, cobroAmountOfCita, citaEsCobro, ventaEsCobro, cobroMillisDeCita, localDateKey } from '../cash/cashModel.js';

export const ACCOUNT_TYPES = ['efectivo', 'banco', 'billetera', 'otra'];
export const TYPE_LABELS = { efectivo: 'Efectivo', banco: 'Banco', billetera: 'Billetera digital', otra: 'Otra' };
export const UNASSIGNED = '__porAsignar';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Clave de un método de pago: sin mayúsculas, tildes ni espacios sobrantes. */
export function methodKey(method) {
  return String(method || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export const cajaAccountId = (scopeKey) => `caja_${scopeKey}`;

// ───────────────────────── Sucursales ─────────────────────────

/**
 * Sucursal (scopeKey) de un cobro. Igual que la caja: sin sucursales todo es
 * 'general'; con una sola, todo es de ella; con varias, la cita va por nombre
 * (cita.branch) y la venta por id (branchKey).
 */
export function scopeOfCita(cita, sucursales = []) {
  if (sucursales.length === 0) return 'general';
  if (sucursales.length === 1) return sucursales[0].id;
  const s = sucursales.find((x) => (x.name || '') === (cita?.branch || ''));
  return s ? s.id : null;
}

export function scopeOfVenta(venta, sucursales = []) {
  if (sucursales.length === 0) return 'general';
  if (sucursales.length === 1) return sucursales[0].id;
  const s = sucursales.find((x) => x.id === venta?.branchKey);
  return s ? s.id : null;
}

/** Ámbitos de caja que debe haber: uno por sucursal, o 'general'. */
export function cashScopes(sucursales = []) {
  if (sucursales.length === 0) return [{ key: 'general', name: 'General' }];
  return sucursales.map((s) => ({ key: s.id, name: s.name || 'Sucursal' }));
}

export const cajaAccountName = (scope, total) => (total <= 1 || scope.key === 'general' ? 'Caja' : `Caja ${scope.name}`);

// ───────────────────────── Destino de cada flujo ─────────────────────────

/**
 * Cuenta a la que va (o de la que sale) un monto pagado con `method`.
 * Efectivo -> Caja de su sucursal. Otro -> la cuenta elegida para ese método.
 * Sin cuenta -> UNASSIGNED ("Por asignar").
 */
export function accountForMethod(method, scopeKey, config = {}) {
  if (isCashMethod(method)) return scopeKey ? cajaAccountId(scopeKey) : UNASSIGNED;
  const id = config.methodAccounts?.[methodKey(method)];
  return id || UNASSIGNED;
}

/**
 * Convierte los documentos en flujos de dinero { at, amount (+ entra / - sale),
 * account, kind, ref, label, method, day }. Solo los que ocurren desde sinceMs.
 */
export function buildFlows({ citas = [], ventas = [], pagos = [], salidas = [], movs = [], cierres = [], anticipos = [], sucursales = [], config = {}, sinceMs = 0, untilMs = Infinity, tz } = {}) {
  const flows = [];
  const inRange = (ms) => ms !== null && ms >= sinceMs && ms <= untilMs;
  const seen = new Set();

  for (const c of citas) {
    if (!citaEsCobro(c) || seen.has(`cita:${c.id}`)) continue;
    const at = cobroMillisDeCita(c);
    if (!inRange(at)) continue;
    seen.add(`cita:${c.id}`);
    const amount = cobroAmountOfCita(c); // precio menos el anticipo ya cobrado
    if (amount <= 0) continue;
    const account = accountForMethod(c.paymentMethod, scopeOfCita(c, sucursales), config);
    flows.push({ at, amount, account, kind: 'cobro', ref: `cita:${c.id}`, method: String(c.paymentMethod).trim(), day: c.date || localDateKey(at, tz) });
  }
  // Anticipos: entran cuando el dueño los confirma; si se devuelven, salen.
  const seenDep = new Set();
  for (const c of anticipos) {
    const d = c?.deposit;
    if (!d || seenDep.has(c.id) || !['paid', 'refunded', 'retained'].includes(d.status)) continue;
    seenDep.add(c.id);
    const account = accountForMethod(d.method, scopeOfCita(c, sucursales), config);
    const amount = round2(d.amount);
    const paidAt = toMillis(d.paidAt);
    if (inRange(paidAt)) flows.push({ at: paidAt, amount, account, kind: 'anticipo', ref: `anticipo:${c.id}`, method: d.method, label: c.clientName || 'Cliente', day: localDateKey(paidAt, tz) });
    const backAt = toMillis(d.resolvedAt);
    if (d.status === 'refunded' && inRange(backAt)) flows.push({ at: backAt, amount: -amount, account, kind: 'devolucion', ref: `devolucion:${c.id}`, method: d.method, label: c.clientName || 'Cliente', day: localDateKey(backAt, tz) });
  }
  for (const v of ventas) {
    if (!ventaEsCobro(v) || seen.has(`venta:${v.id}`)) continue;
    const at = toMillis(v.paidAt);
    if (!inRange(at)) continue;
    seen.add(`venta:${v.id}`);
    const account = accountForMethod(v.paymentMethod, scopeOfVenta(v, sucursales), config);
    flows.push({ at, amount: round2(v.total), account, kind: 'cobro', ref: `venta:${v.id}`, method: String(v.paymentMethod).trim(), day: localDateKey(at, tz) });
  }
  for (const p of pagos) {
    const at = toMillis(p.paidAt);
    if (!inRange(at) || !isRealPaymentMethod(p.method)) continue;
    const account = accountForMethod(p.method, p.isCash ? p.cashScopeKey : null, config);
    flows.push({ at, amount: -round2(p.amount), account, kind: 'comision', ref: `pago:${p.id}`, method: p.method, label: `Comisión ${p.barberName || ''}`.trim(), day: localDateKey(at, tz) });
  }
  for (const s of salidas) {
    if (s.source !== 'manual' || s.voided) continue; // las de comisión ya están en pagos
    const at = toMillis(s.createdAt);
    if (!inRange(at)) continue;
    flows.push({ at, amount: -round2(s.amount), account: cajaAccountId(s.scopeKey), kind: 'salida', ref: `salida:${s.id}`, method: 'Efectivo', label: s.reason || 'Salida de caja', day: localDateKey(at, tz) });
  }
  for (const m of movs) {
    const at = toMillis(m.at);
    if (!inRange(at) || m.voided) continue;
    if (m.type === 'transferencia') {
      flows.push({ at, amount: -round2(m.amount), account: m.fromAccountId, kind: 'transferencia', ref: `mov:${m.id}`, label: m.note || 'Transferencia', day: localDateKey(at, tz), pair: m.toAccountId });
      flows.push({ at, amount: round2(m.amount), account: m.toAccountId, kind: 'transferencia', ref: `mov:${m.id}`, label: m.note || 'Transferencia', day: localDateKey(at, tz), pair: m.fromAccountId, mirror: true });
    } else if (m.type === 'gasto') {
      flows.push({ at, amount: -round2(m.amount), account: m.accountId, kind: 'gasto', ref: `mov:${m.id}`, label: m.title || 'Gasto', category: m.category || 'Otros', day: localDateKey(at, tz) });
    } else if (m.type === 'ajuste') {
      flows.push({ at, amount: round2(m.amount), account: m.accountId, kind: 'ajuste', ref: `mov:${m.id}`, label: 'Corrección de saldo', day: localDateKey(at, tz) });
    }
  }
  for (const c of cierres) {
    if (c.status !== 'closed' || !c.scopeKey) continue;
    const diff = round2(c.close?.difference);
    const at = toMillis(c.closedAt);
    if (!diff || !inRange(at)) continue;
    flows.push({ at, amount: diff, account: cajaAccountId(c.scopeKey), kind: 'ajuste', ref: `cierre:${c.id}`, label: diff < 0 ? 'Faltante al cerrar caja' : 'Sobrante al cerrar caja', day: localDateKey(at, tz) });
  }
  return flows;
}

/**
 * Saldos: saldo inicial + flujos desde que vale cada cuenta.
 * Devuelve { balances: {accountId: n}, unassigned: { total, byMethod: {method: n} } }.
 */
export function computeBalances(accounts = [], flows = []) {
  const balances = {};
  const since = {};
  for (const a of accounts) { balances[a.id] = round2(a.openingBalance); since[a.id] = toMillis(a.openingAt) ?? 0; }
  let unassignedTotal = 0;
  const byMethod = {};
  for (const f of flows) {
    if (f.account === UNASSIGNED || !(f.account in balances)) {
      if (f.kind === 'cobro' || f.kind === 'comision' || f.kind === 'anticipo' || f.kind === 'devolucion') {
        unassignedTotal = round2(unassignedTotal + f.amount);
        byMethod[f.method || 'Sin método'] = round2((byMethod[f.method || 'Sin método'] || 0) + f.amount);
      }
      continue;
    }
    if (f.at < since[f.account]) continue;
    balances[f.account] = round2(balances[f.account] + f.amount);
  }
  return { balances, unassigned: { total: unassignedTotal, byMethod } };
}

// ───────────────────────── Resumen del mes ─────────────────────────

/** 'YYYY-MM' del instante en la zona del negocio. */
export function monthKeyOf(ms, tz) {
  return localDateKey(ms, tz).slice(0, 7);
}

/** Mes anterior / siguiente de 'YYYY-MM'. */
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isValidMonth(ym) {
  return typeof ym === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

/** Primer y último día ('YYYY-MM-DD') de un mes. */
export function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { startDay: `${ym}-01`, endDay: `${ym}-${String(last).padStart(2, '0')}`, daysInMonth: last };
}

export const monthLabel = (ym) => MES_LARGO[Number(ym.slice(5, 7)) - 1];
export const monthShort = (ym) => { const s = MES[Number(ym.slice(5, 7)) - 1]; return s.charAt(0).toUpperCase() + s.slice(1); };
export const dayLabel = (day) => `${Number(day.slice(8, 10))} ${MES[Number(day.slice(5, 7)) - 1]}`;

/**
 * Totales del mes.
 *  ingresos   cobros de citas y ventas del mes (fecha de la cita / del cobro)
 *  salio      dinero que salió: comisiones pagadas + salidas de caja
 *  comisiones comisiones GENERADAS en el mes (pagadas o no)
 *  gastos     gastos del mes (por ahora: salidas manuales de caja)
 *  ganancia   ingresos - comisiones - gastos (aproximada, no contable)
 */
export function monthTotals({ citas = [], ventas = [], pagos = [], salidas = [], gastos: gastosDocs = [], gastoPagos = [], anticipos = [], comisionesGeneradas = 0, startDay, endDay, tz }) {
  const enMes = (day) => day >= startDay && day <= endDay;
  let ingresos = 0;
  for (const c of citas) if (citaEsCobro(c) && enMes(c.date || '')) ingresos += amountOfCita(c);
  // Anticipo que el negocio se quedó (cancelada o no vino): ingreso del mes en que se decidió. Sin comisión.
  const seenRet = new Set();
  for (const c of anticipos) {
    const d = c?.deposit;
    if (d?.status !== 'retained' || seenRet.has(c.id)) continue;
    seenRet.add(c.id);
    const ms = toMillis(d.resolvedAt);
    if (ms !== null && enMes(localDateKey(ms, tz))) ingresos += round2(d.amount);
  }
  for (const v of ventas) if (ventaEsCobro(v) && enMes(localDateKey(toMillis(v.paidAt) ?? 0, tz))) ingresos += round2(v.total);
  let pagado = 0;
  for (const p of pagos) { const ms = toMillis(p.paidAt); if (ms !== null && enMes(localDateKey(ms, tz))) pagado += round2(p.amount); }
  let gastos = 0;
  for (const s of salidas) {
    if (s.source !== 'manual' || s.voided) continue;
    const ms = toMillis(s.createdAt);
    if (ms !== null && enMes(localDateKey(ms, tz))) { gastos += round2(s.amount); pagado += round2(s.amount); }
  }
  // Gastos registrados en Finanzas: cuentan en el mes al que pertenecen (pagados o no).
  let fijos = 0;
  for (const g of gastosDocs) {
    if (g.voided || g.month !== startDay.slice(0, 7)) continue;
    gastos += round2(g.total);
    if (g.fijoId) fijos += round2(g.total);
  }
  // Lo que salió de verdad: pagos de gastos hechos este mes.
  for (const m of gastoPagos) {
    const ms = toMillis(m.at);
    if (m.type === 'gasto' && !m.voided && ms !== null && enMes(localDateKey(ms, tz))) pagado += round2(m.amount);
  }
  ingresos = round2(ingresos);
  const comisiones = round2(comisionesGeneradas);
  gastos = round2(gastos);
  return { ingresos, salio: round2(pagado), comisiones, gastos, fijos: round2(fijos), ganancia: round2(ingresos - comisiones - gastos) };
}

// ───────────────────────── Historial ─────────────────────────

/**
 * Líneas del historial de un mes, más nuevas primero. Los cobros se agrupan
 * por día y cuenta ("Ventas del 12 nov · entró a Banco BNB"); lo demás va uno
 * por uno. Las transferencias aparecen una sola vez.
 */
export function buildHistory(flows = [], accounts = [], { startDay, endDay, limit = 300 } = {}) {
  const names = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const nameOf = (id) => names[id] || 'Por asignar';
  const enMes = (f) => f.day >= startDay && f.day <= endDay;
  const grupos = new Map();
  const items = [];
  for (const f of flows) {
    if (!enMes(f)) continue;
    if (f.kind === 'cobro') {
      const key = `${f.day}|${f.account}|${f.account === UNASSIGNED ? f.method : ''}`;
      const g = grupos.get(key) || { type: 'in', day: f.day, at: f.at, amount: 0, count: 0, account: f.account, method: f.method };
      g.amount = round2(g.amount + f.amount); g.count += 1; g.at = Math.max(g.at, f.at);
      grupos.set(key, g);
      continue;
    }
    if (f.mirror) continue;
    if (f.kind === 'transferencia') {
      items.push({ type: 'move', day: f.day, at: f.at, amount: Math.abs(f.amount), title: f.label, detail: `de ${nameOf(f.account)} a ${nameOf(f.pair)} · no es venta ni gasto` });
    } else if (f.kind === 'ajuste') {
      const nota = f.ref.startsWith('cierre:') ? 'contado al cerrar la caja' : 'corrección manual';
      items.push({ type: 'adj', day: f.day, at: f.at, amount: f.amount, title: f.label, detail: `${nameOf(f.account)} · ${nota}, no es venta ni gasto` });
    } else if (f.kind === 'anticipo') {
      items.push({ type: 'in', day: f.day, at: f.at, amount: f.amount, title: `Anticipo · ${f.label}`, detail: `${f.method} · entró a ${nameOf(f.account)}` });
    } else if (f.kind === 'devolucion') {
      items.push({ type: 'out', day: f.day, at: f.at, amount: Math.abs(f.amount), title: `Anticipo devuelto · ${f.label}`, detail: `${f.method} · salió de ${nameOf(f.account)}` });
    } else if (f.kind === 'gasto') {
      items.push({ type: 'out', day: f.day, at: f.at, amount: Math.abs(f.amount), title: f.label, detail: `${f.category} · salió de ${nameOf(f.account)}` });
    } else {
      const origen = f.kind === 'comision' ? `${f.method} · salió de ${nameOf(f.account)}` : `Salida de caja · salió de ${nameOf(f.account)}`;
      items.push({ type: 'out', day: f.day, at: f.at, amount: Math.abs(f.amount), title: f.label, detail: origen });
    }
  }
  for (const g of grupos.values()) {
    const destino = g.account === UNASSIGNED ? `${g.method} · sin cuenta asignada` : `entró a ${nameOf(g.account)}`;
    items.push({ type: 'in', day: g.day, at: g.at, amount: g.amount, title: `Ventas del ${dayLabel(g.day)}`, detail: `${g.count} ${g.count === 1 ? 'cobro' : 'cobros'} · ${destino}` });
  }
  items.sort((a, b) => (a.day === b.day ? b.at - a.at : (a.day < b.day ? 1 : -1)));
  return items.slice(0, limit).map((i) => ({ ...i, dayLabel: dayLabel(i.day) }));
}

// ───────────────────────── Gastos ─────────────────────────

export const GASTO_CATEGORIES = ['Alquiler', 'Servicios', 'Sueldos', 'Productos', 'Materiales', 'Publicidad', 'Reparaciones', 'Otros'];

/** Fecha de pago de un gasto fijo en un mes (día 31 en febrero -> 28/29). */
export function dueFor(ym, day) {
  const { daysInMonth } = monthDays(ym);
  return `${ym}-${String(Math.min(Math.max(1, Number(day) || 1), daysInMonth)).padStart(2, '0')}`;
}

export const fijoGastoId = (fijoId, ym) => `fijo_${fijoId}_${ym}`;

/** Estado de un gasto para la lista. */
export function gastoStatus(g, today) {
  const rem = round2(g.total - (g.paid || 0));
  if (rem <= 0) return 'pagado';
  if ((g.due || '') < today) return 'vencido';
  if (g.paid > 0) return 'parcial';
  const d = (Date.parse(`${g.due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000;
  return d <= 7 ? 'pronto' : 'pendiente';
}

/**
 * Punto de equilibrio del mes.
 *  fijos      gastos que se repiten cada mes
 *  variables  el resto de los gastos
 *  ratio      de cada Bs 1 vendido, cuánto queda para pagar los fijos
 *  meta       fijos / ratio
 */
export function breakEven({ ingresos, comisiones, gastos, fijos }, fallbackRatio = null) {
  const variables = round2(Math.max(0, gastos - fijos));
  let ratio = ingresos > 0 ? (ingresos - comisiones - variables) / ingresos : fallbackRatio;
  if (ratio !== null) ratio = Math.round(ratio * 10000) / 10000;
  const meta = ratio && ratio > 0 ? round2(fijos / ratio) : null;
  return { vendido: round2(ingresos), fijos: round2(fijos), variables, comisiones: round2(comisiones), ratio, meta, cubierto: meta !== null && ingresos >= meta };
}

// ───────────────────────── Validaciones ─────────────────────────

export function parseMoney(v, { allowZero = true, allowNegative = false } = {}) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (!allowNegative && n < 0) return null;
  if (!allowZero && n === 0) return null;
  return round2(n);
}

export function cleanName(v, max = 60) {
  return String(v || '').trim().replace(/\s+/g, ' ').slice(0, max);
}
