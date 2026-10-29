// promotionsInTx.js — Promociones al guardar citas en el servidor.
//
// Lee las promociones y sucursales del negocio (dentro de la transacción,
// ANTES de cualquier escritura) y aplica la mejor a las líneas ya con precio
// por profesional. Si el plan del negocio no incluye "promociones", no se
// aplica ninguna.

import { getNegocioAccess } from '../capabilities/capabilityService.js';
import { applyPromotions, resolveBranchId } from './promotionPricing.js';
import { summarizeCitaServices } from './professionalPricing.js';

/** ¿El plan del negocio incluye promociones? (por defecto sí, como el catálogo). */
export async function promotionsEnabled(negocioId) {
  try {
    const access = await getNegocioAccess(negocioId);
    const cap = access?.capabilities?.promociones;
    return cap ? cap.enabled !== false : true;
  } catch {
    return true;
  }
}

/** { promotions, branches } del negocio, leídos en la transacción. */
export async function readPromotionContextInTx(tx, negocioRef, { enabled = true } = {}) {
  if (!enabled) return { promotions: [], branches: [] };
  const [promoSnap, branchSnap] = await Promise.all([
    tx.get(negocioRef.collection('promociones')),
    tx.get(negocioRef.collection('sucursales')),
  ]);
  return {
    promotions: promoSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    branches: branchSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

/**
 * Aplica la mejor promo a un resultado de repriceCitaServices / buildCitaServices.
 * @returns el mismo objeto con services y totales recalculados, y `promo` (o null).
 */
export function withPromotions(priced, promoCtx, { date, branch }) {
  const { services, promo } = applyPromotions(priced.services, promoCtx?.promotions || [], {
    date,
    branchId: resolveBranchId(branch, promoCtx?.branches || []),
  });
  return { ...priced, services, ...summarizeCitaServices(services), priceProvisional: priced.priceProvisional, promo };
}
