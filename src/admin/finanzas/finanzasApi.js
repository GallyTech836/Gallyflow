// finanzasApi.js — único archivo del frontend que habla con /api/finanzas/*.
// El negocio sale del token en el backend; aquí nunca se manda.

import { sessionHeaders } from '../../shared/session/sessionStore';

const BASE_URL = 'https://gallyflow-production.up.railway.app/api';

/** Identificador de la operación: un doble clic o un reintento no duplica nada. */
export function newRequestId() {
  const rnd = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return rnd.slice(0, 32);
}

async function call(method, path, token, body) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: await sessionHeaders(token ? { 'x-finance-session': token } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, data: { error: 'Sin conexión. Revisa internet e intenta de nuevo.' } };
  }
  let data = {};
  try { data = await res.json(); } catch { /* respuesta vacía */ }
  if (res.status === 404 && !data.error) data.error = 'Finanzas todavía no está disponible en el servidor.';
  return { ok: res.ok, status: res.status, data };
}

export const getFinanzasEstado = (token) => call('GET', '/finanzas/estado', token);
export const getFinanzasResumen = (token, month) => call('GET', `/finanzas/resumen${month ? `?month=${encodeURIComponent(month)}` : ''}`, token);
export const setupFinanzas = (token, body) => call('POST', '/finanzas/setup', token, body);
export const createCuenta = (token, body) => call('POST', '/finanzas/cuentas', token, body);
export const updateCuenta = (token, id, body) => call('PATCH', `/finanzas/cuentas/${encodeURIComponent(id)}`, token, body);
export const createTransferencia = (token, body) => call('POST', '/finanzas/transferencias', token, body);

// Gastos y punto de equilibrio
export const getGastos = (token) => call('GET', '/finanzas/gastos', token);
export const createGasto = (token, body) => call('POST', '/finanzas/gastos', token, body);
export const payGasto = (token, id, body) => call('POST', `/finanzas/gastos/${encodeURIComponent(id)}/pagos`, token, body);
export const deleteGasto = (token, id) => call('DELETE', `/finanzas/gastos/${encodeURIComponent(id)}`, token);
export const stopFijo = (token, id) => call('POST', `/finanzas/fijos/${encodeURIComponent(id)}/detener`, token);
export const getEquilibrio = (token) => call('GET', '/finanzas/equilibrio', token);

// Compras de inventario (Inventario › Registrar compra). No usan la sesión del PIN.
export const getCompraOpciones = () => call('GET', '/finanzas/compras/opciones', null);
export const createCompra = (body) => call('POST', '/finanzas/compras', null, body);
