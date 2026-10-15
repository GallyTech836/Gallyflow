import { resolveServicePrice, getServicePriceRange } from './professionalPricing.js';
// servicePricing.js
// Precio variable de servicios. Compatibilidad total:
//  - `price` sigue siendo el número que usan totales, comisiones y reportes.
//    Si el servicio es variable, `price` es el PRECIO MÍNIMO.
//  - `priceVariable: true` solo indica que se muestre como "Desde Bs XX".
//  - Servicios existentes (sin `priceVariable`) se muestran como siempre.

export function isVariablePrice(service) {
    return service?.priceVariable === true;
  }
  
  /** "Desde Bs 50" (variable) o "50 Bs" (fijo, formato actual). */
  export function formatServicePrice(service) {
    const price = Number(service?.price || 0);
    return isVariablePrice(service) ? `Desde Bs ${price}` : `${price} Bs`;
  }
  
  /** Igual que formatServicePrice pero para un monto ya calculado (totales). */
  export function formatAmount(amount, isFrom = false) {
    return isFrom ? `Desde Bs ${amount}` : `${amount} Bs`;
  }

// ── Precio por profesional ────────────────────────────────────────────
// Mismo formato visual de arriba, pero resolviendo el precio del profesional
// (o el rango entre profesionales cuando todavía no se eligió uno).

/** "100 Bs" | "100 – 150 Bs" | "Desde Bs 100". */
export function formatAmountRange(min, max = min, isFrom = false) {
  if (isFrom) return `Desde Bs ${min}`;
  return Number(min) === Number(max) ? `${min} Bs` : `${min} – ${max} Bs`;
}

/**
 * Precio a mostrar de un servicio:
 *  - con `professional`: su precio exacto (o su "Desde").
 *  - sin profesional: rango entre `professionals` que lo realizan.
 */
export function formatServicePriceFor(service, { professional = null, professionals = [], promoActive = false } = {}) {
  if (professional) {
    const r = resolveServicePrice(service, professional, { promoActive });
    return formatAmountRange(r.price, r.price, r.priceVariable);
  }
  const range = getServicePriceRange(service, professionals, { promoActive });
  return formatAmountRange(range.min, range.max, range.priceVariable);
}
  