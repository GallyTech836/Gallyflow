// sessionApi.js — llamadas al backend para las sesiones.

import { BASE_URL } from '../notifications/notificationApi';
import { sessionHeaders, getSessionId, setSessionId } from './sessionStore';

async function call(method, path, body) {
  const res = await fetch(BASE_URL + path, {
    method,
    // Sin token no se consulta (lanza): quien llama lo trata como sin conexión.
    headers: await sessionHeaders({}, { requireToken: true }),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Admin: abrir la sesión del servidor después del login con correo.
export async function startAdminSession(replaceSid) {
  const r = await call('POST', '/auth/session/start', replaceSid ? { replaceSid } : {});
  if (r.ok && r.data.sid) setSessionId(r.data.sid);
  return r;
}

export const checkSession = () => call('POST', '/auth/session/check');
export const listSessions = () => call('GET', '/auth/sessions');
export const revokeSession = (sid) => call('POST', '/auth/sessions/' + encodeURIComponent(sid) + '/revoke');

// Cerrar sesión en este dispositivo (nunca falla).
export async function endSession() {
  try {
    if (getSessionId()) await call('POST', '/auth/session/end');
  } catch (_) { /* sin conexión: la sesión vencerá sola */ }
  setSessionId(null);
}
