// Único archivo del frontend que hace fetch() hacia el backend de
// notificaciones. Nadie más debe llamar a esta URL directamente.

const BASE_URL = 'https://gallyflow-production.up.railway.app/api';

export async function registerDevice({ uid, rol, negocioId, oneSignalId }) {
  const res = await fetch(`${BASE_URL}/devices/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, rol, negocioId, oneSignalId }),
  });
  return res.json();
}

export async function notify(tipo, negocioId, data, actorUid, targetProfessionalId) {
  const res = await fetch(`${BASE_URL}/notifications/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, negocioId, data, actorUid, targetProfessionalId }),
  });
  return res.json();
}

// Push directo a UN dispositivo (usado por ClienteApp para confirmarle al
// cliente su propia reserva). No pasa por `usuarios` ni por negocioId/rol.
export async function notifyDirect(oneSignalId, tipo, data) {
  const res = await fetch(`${BASE_URL}/notifications/send-direct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oneSignalId, tipo, data }),
  });
  return res.json();
}