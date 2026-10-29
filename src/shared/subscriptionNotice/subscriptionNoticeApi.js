// subscriptionNoticeApi.js — único archivo del frontend que habla con
// /api/subscription-notice. El backend saca el negocio del token del
// administrador y recalcula todo; aquí no se decide nada.

import { sessionHeaders } from '../session/sessionStore';

const BASE_URL = 'https://gallyflow-production.up.railway.app/api';

async function request(method, path, body) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: await sessionHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      let code = null;
      try { code = (await res.json())?.code || null; } catch { /* sin cuerpo */ }
      console.warn(`[subscriptionNotice] ${method} ${path} → HTTP ${res.status}`, code || '');
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[subscriptionNotice] ${method} ${path} → sin conexión`, err?.message || '');
    return null;
  }
}

/** { show, tramo, diasRestantes, tipo, fechaVencimiento, whatsappUrl } o null si falla. */
export const getSubscriptionNotice = () => request('GET', '/subscription-notice');

export const ackSubscriptionNotice = ({ tramo, fechaVencimiento }) =>
  request('POST', '/subscription-notice/ack', { tramo, fechaVencimiento });

/** { whatsappUrl } a soporte de Nexus (funciona con el negocio bloqueado) o null si falla. */
export const getSupportContact = () => request('GET', '/support-contact');
