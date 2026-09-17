// providers/whatsappProvider.js
//
// Meta Cloud API. Por ahora usa un solo número (variables de entorno) para
// probar con un negocio. En Fase 3 esto se extiende para leer el
// phoneNumberId/token de cada negocio desde Firestore en vez del .env.

const GRAPH_URL = 'https://graph.facebook.com/v20.0';

export async function send(destinatario, mensaje) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error('[whatsappProvider] Faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN en .env.');
  }

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: destinatario,
      type: 'text',
      text: { body: mensaje },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`[whatsappProvider] Meta API error: ${JSON.stringify(data)}`);
  }
  return data;
}