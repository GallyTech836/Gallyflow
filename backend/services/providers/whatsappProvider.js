// providers/whatsappProvider.js
//
// Meta Cloud API, multi-negocio. Cada negocio tiene su propio número
// (phoneNumberId). El token puede ser propio del negocio (whatsappAccounts)
// o el token general del .env (System User de tu Business, que sirve para
// todos los números que administras).
//
// Colección `whatsappAccounts/{phoneNumberId}` = { negocioId, token? }.
// Solo la lee el backend (Admin SDK); las reglas de Firestore no deben
// permitir leerla desde el front porque guarda tokens.

import { db } from '../../config/firebase.js';

const GRAPH_URL = 'https://graph.facebook.com/v20.0';

/**
 * Devuelve { negocioId, phoneNumberId, token, branch, appSecret } para un número.
 * 1) whatsappAccounts/{phoneNumberId}  2) negocio con whatsappPhoneNumberId (legado).
 * Caché de 60 s: se consulta en cada mensaje (firma + procesamiento).
 */
const CUENTA_CACHE_MS = 60 * 1000;
const cacheCuentas = new Map();

export async function resolveAccount(phoneNumberId) {
  if (!phoneNumberId) return null;
  const id = String(phoneNumberId);
  const enCache = cacheCuentas.get(id);
  if (enCache && Date.now() - enCache.at < CUENTA_CACHE_MS) return enCache.data;
  const data = await leerCuenta(id);
  cacheCuentas.set(id, { at: Date.now(), data });
  return data;
}

async function leerCuenta(id) {
  const accSnap = await db.collection('whatsappAccounts').doc(id).get();
  if (accSnap.exists) {
    const acc = accSnap.data();
    if (acc?.negocioId) {
      return {
        negocioId: acc.negocioId,
        phoneNumberId: id,
        token: acc.token || null,
        branch: acc.branch || null,
        appSecret: acc.appSecret || null,
      };
    }
  }

  const snap = await db.collection('negocios').where('whatsappPhoneNumberId', '==', id).limit(1).get();
  if (snap.empty) return null;
  return { negocioId: snap.docs[0].id, phoneNumberId: id, token: null, branch: null, appSecret: null };
}

/**
 * send(destinatario, mensaje, { phoneNumberId, token }?)
 * Sin opciones usa las variables del .env (compatible con notificationService).
 */
export async function send(destinatario, mensaje, opciones = {}) {
  return enviar(destinatario, { type: 'text', text: { body: mensaje } }, opciones);
}

/**
 * Botones o lista de WhatsApp. `interactive` es el objeto que arma el
 * Assistant Engine ({ type: 'button' | 'list', body, action }).
 */
export async function sendInteractive(destinatario, interactive, opciones = {}) {
  return enviar(destinatario, { type: 'interactive', interactive }, opciones);
}

/**
 * Marca el mensaje como leído (doble check azul) y muestra "escribiendo…"
 * mientras el bot arma la respuesta. Si Meta no acepta el indicador de
 * escritura, al menos marca como leído. Nunca lanza.
 */
export async function markAsRead(messageId, opciones = {}) {
  if (!messageId) return;
  const base = { messaging_product: 'whatsapp', status: 'read', message_id: messageId };
  try {
    await post({ ...base, typing_indicator: { type: 'text' } }, opciones);
  } catch {
    try { await post(base, opciones); } catch { /* sin importancia */ }
  }
}

async function enviar(destinatario, contenido, opciones) {
  return post({ messaging_product: 'whatsapp', to: destinatario, ...contenido }, opciones);
}

async function post(payload, opciones) {
  const phoneNumberId = opciones.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = opciones.token || process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error('[whatsappProvider] Falta phoneNumberId o token (ni en la cuenta ni en .env).');
  }

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`[whatsappProvider] Meta API error: ${JSON.stringify(data)}`);
  }
  return data;
}
