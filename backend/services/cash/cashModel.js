// cashModel.js
//
// Copia idéntica en backend/services/cash/ y src/shared/cash/: si cambias una, cambia la otra.
// Lógica PURA (sin Firebase) de la caja y el cierre diario. El backend es el
// único que calcula y guarda la caja; src/shared/cash/cashModel.js es una
// copia idéntica para mostrar la misma vista previa en el AdminApp (mismo
// patrón que availability.js). Si cambias algo aquí, cópialo allá.
//
// Reglas:
//   - La caja física solo controla el EFECTIVO.
//   - QR, transferencia, tarjeta y cualquier otro método se muestran en el
//     resumen pero NO se suman al efectivo esperado.
//   - El fondo inicial no es venta: está en la caja desde la apertura.
//   - Efectivo esperado = fondo inicial + cobros en efectivo - salidas de efectivo.
//   - Total de ventas = suma de todos los métodos (sin el fondo).

export const CASH_METHOD = 'Efectivo';

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const norm = (v) => String(v || '').trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

/** ¿Este método de pago es efectivo físico? Los métodos los define cada negocio. */
export function isCashMethod(method) {
  const m = norm(method);
  return m === 'efectivo' || m === 'cash' || m === 'contado';
}

/** Nombre del método como se muestra; un vacío o "Pendiente" no es un cobro. */
export function isRealPaymentMethod(method) {
  const m = norm(method);
  return !!m && m !== 'pendiente' && m !== 'sin especificar';
}

/** Lo que se cobró en la cita: price guarda el precio final (también el variable). */
export function amountOfCita(cita) {
  const price = Number(cita?.price);
  if (Number.isFinite(price) && price > 0) return round2(price);
  if (Array.isArray(cita?.services) && cita.services.length > 0) {
    return round2(cita.services.reduce((s, x) => s + (Number(x?.price) || 0), 0));
  }
  return 0;
}

/** Milisegundos de un ISO, Date, Timestamp de Firestore o {seconds}. */
export function toMillis(v) {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  if (typeof v._seconds === 'number') return v._seconds * 1000;
  return null;
}

/** Momento del cobro de una cita: paidAt (nuevo). Citas viejas: updatedAt. */
export function cobroMillisDeCita(cita) {
  return toMillis(cita?.paidAt) ?? toMillis(cita?.updatedAt);
}

/** ¿La cita cuenta como cobro? Solo completada, con método real y monto. */
export function citaEsCobro(cita) {
  return cita?.status === 'completed' && isRealPaymentMethod(cita?.paymentMethod) && amountOfCita(cita) > 0;
}

/** ¿La venta de productos cuenta como cobro? Solo pagada (no pendiente ni anulada). */
export function ventaEsCobro(venta) {
  return venta?.status === 'paid' && isRealPaymentMethod(venta?.paymentMethod) && round2(venta?.total) > 0;
}

/**
 * Convierte citas y ventas en líneas de cobro { kind, id, method, amount, at, label }.
 * Un mismo id nunca aparece dos veces.
 */
export function buildCobros({ citas = [], ventas = [] }) {
  const seen = new Set();
  const out = [];
  for (const c of citas) {
    if (!citaEsCobro(c)) continue;
    const key = `cita:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'cita', id: c.id, method: String(c.paymentMethod).trim(), amount: amountOfCita(c), at: cobroMillisDeCita(c), label: c.clientName || '' });
  }
  for (const v of ventas) {
    if (!ventaEsCobro(v)) continue;
    const key = `venta:${v.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'venta', id: v.id, method: String(v.paymentMethod).trim(), amount: round2(v.total), at: toMillis(v.paidAt), label: v.clientName || '' });
  }
  return out;
}

/**
 * Resumen de una caja.
 * @param {object} p
 * @param {number} p.openingFund   fondo inicial
 * @param {Array}  p.cobros        de buildCobros (o el snapshot guardado al cerrar)
 * @param {Array}  p.salidas       [{ amount, reason, voided? }] solo efectivo
 * @param {string[]} p.paymentMethods métodos configurados (para listarlos aunque estén en 0)
 */
export function computeCashSummary({ openingFund = 0, cobros = [], salidas = [], paymentMethods = [] } = {}) {
  const byMethodMap = new Map();
  const addMethod = (name) => {
    const key = norm(name);
    if (!byMethodMap.has(key)) byMethodMap.set(key, { method: String(name).trim(), amount: 0, count: 0, isCash: isCashMethod(name) });
    return byMethodMap.get(key);
  };
  addMethod(CASH_METHOD);
  for (const m of paymentMethods || []) if (isRealPaymentMethod(m)) addMethod(m);
  for (const c of cobros) {
    const row = addMethod(c.method);
    row.amount = round2(row.amount + (Number(c.amount) || 0));
    row.count += 1;
  }
  const byMethod = [...byMethodMap.values()].sort((a, b) => (b.isCash - a.isCash));
  const cashSales = round2(byMethod.filter((r) => r.isCash).reduce((s, r) => s + r.amount, 0));
  const nonCashSales = round2(byMethod.filter((r) => !r.isCash).reduce((s, r) => s + r.amount, 0));

  const activas = (salidas || []).filter((s) => !s.voided);
  const cashOut = round2(activas.reduce((s, x) => s + (Number(x.amount) || 0), 0));
  const reasonMap = new Map();
  for (const s of activas) {
    const r = String(s.reason || 'Sin motivo').trim();
    reasonMap.set(r, round2((reasonMap.get(r) || 0) + (Number(s.amount) || 0)));
  }
  const cashOutByReason = [...reasonMap.entries()].map(([reason, amount]) => ({ reason, amount }));

  const fund = round2(openingFund);
  return {
    openingFund: fund,
    byMethod,
    cashSales,
    nonCashSales,
    totalSales: round2(cashSales + nonCashSales),
    cashOut,
    cashOutByReason,
    expectedCash: round2(fund + cashSales - cashOut),
    cobrosCount: cobros.length,
  };
}

/**
 * Valida los datos del cierre (el "sobre").
 * countedCash = lo que el admin contó; envelope + nextFund debe ser igual a lo contado.
 * Devuelve { ok, errors[], difference } donde difference = contado - esperado
 * (positivo: sobra; negativo: falta).
 */
export function validateClose({ expectedCash, countedCash, envelopeAmount, nextFund }) {
  const errors = [];
  const nums = { countedCash, envelopeAmount, nextFund };
  for (const [k, v] of Object.entries(nums)) {
    if (v === '' || v === null || v === undefined || !Number.isFinite(Number(v))) errors.push({ field: k, message: 'Ingresa un importe.' });
    else if (Number(v) < 0) errors.push({ field: k, message: 'No puede ser negativo.' });
  }
  const counted = round2(countedCash);
  const envelope = round2(envelopeAmount);
  const fund = round2(nextFund);
  if (!errors.length && round2(envelope + fund) !== counted) {
    errors.push({ field: 'envelopeAmount', message: `El sobre (Bs ${envelope}) y el fondo (Bs ${fund}) deben sumar lo contado (Bs ${counted}).` });
  }
  return { ok: errors.length === 0, errors, difference: round2(counted - round2(expectedCash)) };
}

// ───────────── Fechas (zona horaria del negocio) ─────────────

/** 'YYYY-MM-DD' local de un instante. */
export function localDateKey(ms, timeZone = 'America/La_Paz') {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Instante (ms) en que empieza el día local de `ms`. */
export function localDayStartMillis(ms, timeZone = 'America/La_Paz') {
  const key = localDateKey(ms, timeZone);
  const guess = Date.parse(`${key}T00:00:00Z`);
  // Desfase de la zona en ese momento (Bolivia: siempre -4 h).
  const p = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(guess));
  const g = (t) => Number(p.find((x) => x.type === t).value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return guess - (asUtc - guess);
}
