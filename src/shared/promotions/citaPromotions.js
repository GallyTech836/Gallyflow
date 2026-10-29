// citaPromotions.js — Promociones al guardar citas desde Admin y Barber
// (las que se escriben directo en Firestore). El backend hace lo mismo en sus
// flujos (createAppointment, Pendientes, reprogramar, registros).

import { applyPromotions, resolveBranchId } from './promotionPricing';
import { summarizeCitaServices } from '../servicePricing/professionalPricing';

/**
 * Aplica la mejor promo a las líneas de una cita.
 * @returns {{ services, price, promo }} promo = null si no aplica ninguna.
 */
export function priceWithPromotions(lines = [], promotions = [], { date, branch = '', branches = [] } = {}) {
  const { services, promo } = applyPromotions(lines, promotions, {
    date,
    branchId: resolveBranchId(branch, branches),
  });
  return { services, price: summarizeCitaServices(services).totalPrice, promo };
}

const serviceKey = (cita) => (Array.isArray(cita?.services) && cita.services.length
  ? cita.services.map((s) => String(s.serviceId)).sort().join('|')
  : String(cita?.serviceId || ''));

/**
 * ¿Cambió algo que decide la promo (servicios, fecha, profesional o sucursal)?
 * Si solo cambió el estado, el pago o las notas, la cita conserva el precio
 * con el que se agendó (aunque la promo ya haya terminado).
 */
export function promoInputsChanged(before, after) {
  if (!before) return true;
  const pro = (c) => c?.professionalId || c?.barberId || 'pending';
  return before.date !== after.date
    || (before.branch || '') !== (after.branch || '')
    || pro(before) !== pro(after)
    || serviceKey(before) !== serviceKey(after);
}
