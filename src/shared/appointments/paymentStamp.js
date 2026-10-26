// paymentStamp.js
//
// Momento del cobro de una cita (paidAt, ISO). La caja suma los cobros por
// este campo; sin él no sabría a qué caja pertenece una cita cobrada.
//   - Al pasar a 'completed' se guarda la hora del cobro (una sola vez).
//   - Si se deshace (vuelve a otro estado) se borra, salvo que la cita ya
//     esté en una caja cerrada: ese cierre es historial y no se toca.
// Citas viejas sin paidAt: la caja usa updatedAt (solo las del mismo día).

export function paymentStampFields(before, nextStatus, nowIso = new Date().toISOString()) {
  const wasCompleted = before?.status === 'completed';
  if (nextStatus === 'completed' && !wasCompleted) return { paidAt: nowIso };
  if (nextStatus && nextStatus !== 'completed' && wasCompleted && before?.paidAt && !before?.cashSessionId) {
    return { paidAt: null };
  }
  return {};
}
