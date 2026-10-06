// pendingApi.js
//
// Único lugar del frontend que le pide al backend evaluar citas Pendiente.
// Son llamadas "fire and forget": si fallan, la cita ya está guardada y se
// reevaluará en la próxima acción (el backend es idempotente).

import { BASE_URL } from '../notifications/notificationApi';

async function post(path, body) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.warn('[pendingApi] falló', path, err?.message || err);
    return null;
  }
}

/** Evalúa una Pendiente recién creada: asigna si hay 1 candidato, o avisa a los candidatos. */
export function processPendingCita(negocioId, citaId) {
  return post('/appointments/pending/process', { negocioId, citaId });
}

/** Reevalúa las Pendientes de una fecha (o todas las futuras si no se pasa fecha). */
export function reevaluatePending(negocioId, date) {
  return post('/appointments/pending/reevaluate', { negocioId, ...(date ? { date } : {}) });
}
