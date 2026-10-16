// whatsappConnectionApi.js
// Panel "Número de WhatsApp" del admin: todo pasa por el backend, porque
// whatsappAccounts guarda tokens y el front no puede leerla directo.

import { BASE_URL } from '../notifications/notificationApi';
import { sessionHeaders } from '../session/sessionStore';

async function call(method, path, body) {
  try {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: await sessionHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (_) {
    return { ok: false, status: 0, data: { error: 'Sin conexión con el servidor.' } };
  }
}

export const listWhatsAppNumbers = () => call('GET', '/whatsapp/connections');
export const connectWhatsAppNumber = (phone, branch) => call('POST', '/whatsapp/connections', { phone, branch: branch || null });
export const setWhatsAppNumberBranch = (id, branch) => call('POST', '/whatsapp/connections/' + encodeURIComponent(id) + '/branch', { branch: branch || null });
export const removeWhatsAppNumber = (id) => call('DELETE', '/whatsapp/connections/' + encodeURIComponent(id));
