// quotaApi.js
// Altas con cupo del plan (profesionales y sucursales). El backend valida el
// límite; la UI solo avisa antes. Editar y eliminar siguen directo en Firestore.

import { BASE_URL } from '../notifications/notificationApi';
import { sessionHeaders } from '../session/sessionStore';

async function post(path, body) {
  try {
    const res = await fetch(BASE_URL + path, {
      method: 'POST',
      headers: await sessionHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, ...data };
  } catch (_) {
    return { ok: false, error: 'Sin conexión con el servidor.' };
  }
}

// -> { ok, id, quota } | { ok:false, error, code ('cupo_alcanzado' | 'usuario_en_uso' | ...) }
export function createProfessional(data) {
  return post('/negocio/profesionales', data);
}

// -> { ok, id, quota } | { ok:false, error, code }
export function createBranch(data) {
  return post('/negocio/sucursales', data);
}
