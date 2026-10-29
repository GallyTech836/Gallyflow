// staffCommissionApi.js — el profesional registra que le pagaron sus
// comisiones del periodo. Va con su token + la sesión del servidor; el
// backend saca el negocio y el profesional del token (nunca del body).

import { sessionHeaders } from '../session/sessionStore';

const BASE_URL = 'https://gallyflow-production.up.railway.app/api';

/** -> { ok, error?, data? } con data = { monto, method, isCash, ... } */
export async function collectMyCommissions({ startDate, endDate, method }) {
  try {
    const res = await fetch(`${BASE_URL}/staff/commission-payments`, {
      method: 'POST',
      headers: await sessionHeaders(),
      body: JSON.stringify({ startDate, endDate, method }),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) return { ok: false, error: data?.error || 'No se pudo registrar el cobro.' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.' };
  }
}
