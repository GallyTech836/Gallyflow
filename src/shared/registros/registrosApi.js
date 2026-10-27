// registrosApi.js — único archivo del front que habla con /api/servicios-registrados.
// Va con el token de Firebase + la sesión del servidor (admin o profesional):
// el backend saca el negocio y, para el profesional, su id del token.
// Nunca se escribe un registro directo en Firestore desde el navegador.

import { sessionHeaders } from '../session/sessionStore';

const BASE_URL = 'https://gallyflow-production.up.railway.app/api';

async function request(path, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: await sessionHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data: data || {} };
  } catch {
    return { ok: false, status: 0, data: { error: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.', code: 'NETWORK' } };
  }
}

/** body: { requestId, services: [{ serviceId, price? }], paymentMethod, professionalId? (admin), clientId?, date? (admin), confirmDuplicate? } */
export const createRegistro = (body) => request('/servicios-registrados', { method: 'POST', body });

export const correctRegistro = (id, body) => request(`/servicios-registrados/${encodeURIComponent(id)}/correct`, { method: 'POST', body });

export const voidRegistro = (id, body) => request(`/servicios-registrados/${encodeURIComponent(id)}/void`, { method: 'POST', body });

export function listRegistros({ from, to, professionalId } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (professionalId && professionalId !== 'all') params.set('professionalId', professionalId);
  return request(`/servicios-registrados?${params}`);
}

export const listCorrecciones = (id) => request(`/servicios-registrados/${encodeURIComponent(id)}/correcciones`);
