// staffApi.js
// Llamadas del admin al backend para usuarios y contraseñas de profesionales.
// La contraseña solo viaja hacia el backend; nunca se lee de vuelta.

import { auth } from '../../firebase/config';
import { BASE_URL } from '../notifications/notificationApi';

async function adminHeaders() {
  const token = await auth.currentUser?.getIdToken();
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
}

// -> { available, suggestion } o null si no hay conexión
export async function checkStaffUsername(username, excludeId) {
  try {
    const params = new URLSearchParams({ username });
    if (excludeId) params.set('exclude', excludeId);
    const res = await fetch(BASE_URL + '/staff/username-available?' + params.toString(), { headers: await adminHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

// -> { ok, error }
export async function setStaffPassword(profesionalId, password) {
  try {
    const res = await fetch(BASE_URL + '/staff/' + encodeURIComponent(profesionalId) + '/password', {
      method: 'POST',
      headers: await adminHeaders(),
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, error: data.error };
  } catch (_) {
    return { ok: false, error: 'Sin conexión con el servidor.' };
  }
}
