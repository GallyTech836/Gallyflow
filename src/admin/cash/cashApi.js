// cashApi.js — único archivo del frontend que habla con /api/cash/*.
// El backend saca el negocio del token del administrador; aquí solo se
// manda la sucursal. Los profesionales reciben 401 en todas estas rutas.

import { sessionHeaders } from '../../shared/session/sessionStore';

const BASE_URL = 'https://gallyflow-production.up.railway.app/api';

async function request(method, path, { body, query } = {}) {
  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ''))}` : '';
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}${qs}`, {
      method,
      headers: await sessionHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (_) {
    return { ok: false, status: 0, error: 'Sin conexión con el servidor. Revisa tu internet.' };
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* respuesta vacía */ }
  if (!res.ok) return { ok: false, status: res.status, error: data?.error || 'No se pudo completar la operación.', code: data?.code };
  return { ok: true, status: res.status, data };
}

export const getCurrentCash = (branchId) => request('GET', '/cash/current', { query: { branchId } });
export const listCashSessions = (branchId) => request('GET', '/cash/sessions', { query: { branchId } });
export const getCashSession = (sessionId) => request('GET', `/cash/sessions/${encodeURIComponent(sessionId)}`);
export const openCash = (branchId, openingFund) => request('POST', '/cash/open', { body: { branchId, openingFund } });
export const addCashOut = (branchId, amount, reason) => request('POST', '/cash/cash-out', { body: { branchId, amount, reason } });
export const closeCash = (branchId, payload) => request('POST', '/cash/close', { body: { branchId, ...payload } });
export const correctCashSession = (sessionId, { pin, reason, changes }) =>
  request('POST', `/cash/sessions/${encodeURIComponent(sessionId)}/correct`, { body: { pin, reason, changes } });
export const payCommission = ({ barberId, startDate, endDate, method, branchId }) =>
  request('POST', '/cash/commission-payments', { body: { barberId, startDate, endDate, method, branchId } });
