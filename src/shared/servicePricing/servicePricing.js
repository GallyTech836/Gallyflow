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
  