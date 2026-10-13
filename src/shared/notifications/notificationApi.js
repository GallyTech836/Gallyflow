// Único archivo del frontend que hace fetch() hacia el backend de
// notificaciones. Nadie más debe llamar a esta URL directamente.

import { auth } from '../../firebase/config';

export const BASE_URL = 'https://gallyflow-production.up.railway.app/api';

// Si hay un admin logueado, manda su token para que el backend lo verifique.
async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.Authorization = 'Bearer ' + token;
  } catch (_) { /* sin sesión de Firebase: BarberApp / ClienteApp */ }
  return headers;
}

export async function registerDevice({ uid, rol, negocioId, oneSignalId }) {
  const res = await fetch(`${BASE_URL}/devices/register`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ uid, rol, negocioId, oneSignalId }),
  });
  return res.json();
}

export async function notify(tipo, negocioId, data, actorUid, targetProfessionalId, targetProfessionalIds) {
  const res = await fetch(`${BASE_URL}/notifications/send`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ tipo, negocioId, data, actorUid, targetProfessionalId, targetProfessionalIds }),
  });
  return res.json();
}

// Push directo a UN dispositivo (usado por ClienteApp para confirmarle al
// cliente su propia reserva). No pasa por `usuarios` ni por negocioId/rol.
export async function notifyDirect(oneSignalId, tipo, data) {
  const res = await fetch(`${BASE_URL}/notifications/send-direct`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ oneSignalId, tipo, data }),
  });
  return res.json();
}