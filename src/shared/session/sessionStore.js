// sessionStore.js
// Guarda el id de la sesión del servidor de ESTE dispositivo y arma los
// headers para el backend. El id por sí solo no da acceso: el backend
// siempre lo valida junto con el token de Firebase del usuario.

import { auth } from '../../firebase/config';

const isStaffRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/barber');
const KEY = isStaffRoute ? 'nexus_sid_staff' : 'nexus_sid_admin';

export function getSessionId() {
  try {
    return localStorage.getItem(KEY);
  } catch (_) {
    return null;
  }
}

export function setSessionId(sid) {
  try {
    if (sid) localStorage.setItem(KEY, sid);
    else localStorage.removeItem(KEY);
  } catch (_) { /* sin almacenamiento disponible */ }
}

export async function sessionHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.Authorization = 'Bearer ' + token;
  } catch (_) { /* sin sesión de Firebase */ }
  const sid = getSessionId();
  if (sid) headers['x-session-id'] = sid;
  return headers;
}

const MENSAJES_FIN = {
  SESSION_REVOKED: 'Tu sesión se cerró desde otro dispositivo.',
  SESSION_EXPIRED: 'Tu sesión venció por falta de uso. Ingresa de nuevo.',
};

export function sessionEndMessage(code) {
  return MENSAJES_FIN[code] || 'Tu sesión ya no es válida. Ingresa de nuevo.';
}

export function formatSessionDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return iso;
  }
}
