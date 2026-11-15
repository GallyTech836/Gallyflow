// anticiposApi.js — lo que hace el dueño con los anticipos (backend /api/anticipos).
import { sessionHeaders } from '../session/sessionStore';

const BASE_URL = 'https://gallyflow-production.up.railway.app/api';

async function post(path, body) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers: await sessionHeaders(), body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await res.json(); } catch { /* vacío */ }
    if (res.status === 404 && !data.error) data.error = 'Los anticipos todavía no están disponibles en el servidor.';
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Sin conexión. Revisa internet e intenta de nuevo.' } };
  }
}

const id = (citaId) => encodeURIComponent(citaId);
export const confirmarAnticipo = (citaId) => post(`/anticipos/${id(citaId)}/confirmar`);
export const rechazarAnticipo = (citaId) => post(`/anticipos/${id(citaId)}/rechazar`);
export const resolverAnticipo = (citaId, decision) => post(`/anticipos/${id(citaId)}/resolver`, { decision });
export const vencerAnticipos = () => post('/anticipos/vencer');
