// cashLock.js
//
// Una cita (o venta) que ya entró en una caja CERRADA tiene cashSessionId:
// su cobro quedó guardado en el cierre y en Finanzas. Desde ahí no se puede
// cambiar lo que mueve dinero (precio, método, estado, servicios, profesional,
// fecha) ni borrarla, porque descuadraría la caja y los reportes. Solo se
// pueden corregir el cliente y las notas.

export const CLOSED_CASH_EDITABLE = ['clientName', 'clientId', 'clientPhone', 'notes'];

export function isInClosedCash(doc) {
  return !!doc?.cashSessionId;
}

export const CLOSED_CASH_MESSAGE = 'Ya está en una caja cerrada: solo se pueden cambiar el cliente y las notas.';
export const CLOSED_CASH_DELETE_MESSAGE = 'Ya está en una caja cerrada: no se puede eliminar ni cambiar su estado.';

/** Deja solo los campos que se pueden cambiar en una cita de caja cerrada. */
export function closedCashPatch(draft = {}) {
  const out = {};
  for (const k of CLOSED_CASH_EDITABLE) if (k in draft) out[k] = draft[k] ?? '';
  return out;
}
