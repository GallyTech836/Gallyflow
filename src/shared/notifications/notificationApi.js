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

export async function notify(tipo, negocioId, data, actorUid) {
  const res = await fetch(`${BASE_URL}/notifications/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, negocioId, data, actorUid }),
  });
  return res.json();
}