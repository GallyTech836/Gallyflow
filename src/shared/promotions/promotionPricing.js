// promotionPricing.js — Aplica promociones (descuentos y combos) a las líneas
// services[] de una cita. Funciones puras, sin React ni Firebase.
//
// Copia intencional en backend/services/pricing/promotionPricing.js (mismo
// patrón que professionalPricing.js). Si cambias una, cambia la otra:
// backend/tests/promotions.test.js verifica que den el mismo resultado.
//
// Reglas (acordadas con el dueño):
//   - Se calcula DESPUÉS del precio por profesional: el descuento se aplica
//     sobre el precio que ya tenía cada línea (el del profesional o el base).
//   - Descuento: % o "Bs menos" en los servicios elegidos de la promo.
//   - Combo: si la cita trae TODOS los servicios del combo, esos servicios
//     pasan a costar el precio del combo, repartido según su precio.
//   - Los servicios de precio variable ("Desde") no entran en promociones.
//   - Vale en su fecha (desde/hasta), en sus días de la semana y en sus
//     sucursales (vacío = todas). Pausada (active=false) no vale.
//   - Si aplican varias, gana la que más le ahorra al cliente. No se suman.
//
// Cada línea con promo guarda:
//   price          precio cobrado (con promo)
//   prePromoPrice  precio antes de la promo (para comisión "sobre el normal")
//   promoId
// y la cita guarda `promo`: { id, name, type, commissionBase, discount }.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ids = (list) => (Array.isArray(list) ? list.map((v) => String(v)) : []);

/** Día de la semana (0 = domingo) de 'AAAA-MM-DD', sin depender de la zona del equipo. */
export function weekdayOf(date) {
  if (!ISO_DATE.test(String(date || ''))) return null;
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** id de la sucursal de una cita (las citas guardan el NOMBRE de la sucursal). */
export function resolveBranchId(branchName, branches = []) {
  if (!branchName) return null;
  const b = (branches || []).find((x) => String(x?.name || '') === String(branchName));
  return b ? String(b.id) : null;
}

/** ¿La promo vale ese día y en esa sucursal? */
export function promotionAppliesOn(promo, { date, branchId = null } = {}) {
  if (!promo || promo.active === false) return false;
  if (!ISO_DATE.test(String(date || ''))) return false;
  if (promo.startDate && date < promo.startDate) return false;
  if (promo.endDate && date > promo.endDate) return false;
  const days = Array.isArray(promo.weekdays) ? promo.weekdays.map(Number) : [];
  if (days.length > 0 && !days.includes(weekdayOf(date))) return false;
  const branchIds = ids(promo.branchIds);
  if (branchIds.length > 0 && !(branchId && branchIds.includes(String(branchId)))) return false;
  return true;
}

const eligible = (line) => line && line.priceVariable !== true && Number(line.price) > 0;

/** Vuelve las líneas al precio sin promo (antes de recalcular). */
export function clearPromotion(lines = []) {
  return (lines || []).map((l) => {
    if (!l || l.promoId === undefined && l.prePromoPrice === undefined) return l;
    const { promoId: _p, prePromoPrice, ...rest } = l;
    const base = Number(prePromoPrice);
    if (!Number.isFinite(base)) return rest;
    const factor = Number(rest.price) > 0 ? base / Number(rest.price) : 1;
    const out = { ...rest, price: round2(base) };
    if (rest.priceRange && Number(rest.price) > 0) {
      out.priceRange = { min: round2(rest.priceRange.min * factor), max: round2(rest.priceRange.max * factor) };
    }
    return out;
  });
}

/** Nuevos precios por índice de línea si se aplica `promo`, o null si no aplica. */
function pricesWith(promo, lines) {
  const out = new Map();
  if (promo.type === 'combo') {
    const wanted = ids(promo.serviceIds);
    if (wanted.length < 2) return null;
    const idx = [];
    for (const id of wanted) {
      const i = lines.findIndex((l, j) => !idx.includes(j) && eligible(l) && String(l.serviceId) === id);
      if (i < 0) return null;
      idx.push(i);
    }
    const total = idx.reduce((s, i) => s + Number(lines[i].price), 0);
    const comboPrice = round2(promo.comboPrice);
    if (!(comboPrice > 0) || comboPrice >= total) return null;
    let assigned = 0;
    idx.forEach((i, k) => {
      const p = k === idx.length - 1 ? round2(comboPrice - assigned) : round2((comboPrice * Number(lines[i].price)) / total);
      assigned = round2(assigned + p);
      out.set(i, p);
    });
    return out;
  }
  const targets = ids(promo.serviceIds);
  const value = Number(promo.discountValue);
  if (!(value > 0)) return null;
  lines.forEach((l, i) => {
    if (!eligible(l) || !targets.includes(String(l.serviceId))) return;
    const price = Number(l.price);
    const next = promo.discountKind === 'amount' ? Math.max(0, price - value) : price * (1 - Math.min(value, 100) / 100);
    out.set(i, round2(next));
  });
  return out.size ? out : null;
}

const savingsOf = (prices, lines) => round2([...prices].reduce((s, [i, p]) => s + (Number(lines[i].price) - p), 0));

/**
 * La promo que más le ahorra al cliente para estas líneas, o null.
 * @returns {{ promo, prices: Map<number, number>, savings: number } | null}
 */
export function pickBestPromotion(lines = [], promotions = [], ctx = {}) {
  let best = null;
  for (const promo of promotions || []) {
    if (!promotionAppliesOn(promo, ctx)) continue;
    const prices = pricesWith(promo, lines);
    if (!prices) continue;
    const savings = savingsOf(prices, lines);
    if (savings <= 0) continue;
    // Empate: gana la de id menor (resultado estable en navegador y backend).
    if (!best || savings > best.savings || (savings === best.savings && String(promo.id) < String(best.promo.id))) {
      best = { promo, prices, savings };
    }
  }
  return best;
}

/**
 * Aplica la mejor promoción a las líneas services[] (ya con precio por
 * profesional). Quita antes cualquier promo anterior.
 * ctx: { date: 'AAAA-MM-DD', branchId }
 * @returns {{ services: Array, promo: object|null }}
 */
export function applyPromotions(lines = [], promotions = [], ctx = {}) {
  const clean = clearPromotion(lines);
  const best = pickBestPromotion(clean, promotions, ctx);
  if (!best) return { services: clean, promo: null };
  const services = clean.map((l, i) => {
    if (!best.prices.has(i)) return l;
    const price = best.prices.get(i);
    const out = { ...l, price, prePromoPrice: round2(l.price), promoId: String(best.promo.id) };
    if (l.priceRange && Number(l.price) > 0) {
      const f = price / Number(l.price);
      out.priceRange = { min: round2(l.priceRange.min * f), max: round2(l.priceRange.max * f) };
    }
    return out;
  });
  return {
    services,
    promo: {
      id: String(best.promo.id),
      name: String(best.promo.name || ''),
      type: best.promo.type === 'combo' ? 'combo' : 'descuento',
      commissionBase: best.promo.commissionBase === 'normal' ? 'normal' : 'final',
      discount: best.savings,
    },
  };
}

/**
 * Precio sobre el que se calcula la comisión de una línea: el cobrado, o el
 * de antes de la promo si la promo de la cita dice "sobre el precio normal".
 */
export function commissionPriceOf(line, cita) {
  if (cita?.promo?.commissionBase === 'normal') {
    const pre = Number(line?.prePromoPrice);
    if (Number.isFinite(pre)) return pre;
  }
  return Number(line?.price) || 0;
}
