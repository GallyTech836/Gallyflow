// restaurante.js
//
// Flujo del asistente de WhatsApp para negocios del vertical 'restaurante'.
// Paso 1: solo responde un saludo (así un restaurante nunca recibe el flujo
// de citas). Los pedidos y las reservas de mesa se agregan en sus pasos.
// Devuelve el mismo formato que engine.js: { replyText, interactive?, preMessages? }.

// Meta puede reenviar el mismo mensaje: se ignora si ya se respondió.
const RECIENTES_MS = 10 * 60 * 1000;
const respondidos = new Map();

function yaRespondido(messageId) {
  if (!messageId) return false;
  const ahora = Date.now();
  for (const [id, t] of respondidos) if (ahora - t > RECIENTES_MS) respondidos.delete(id);
  if (respondidos.has(messageId)) return true;
  respondidos.set(messageId, ahora);
  return false;
}

// Mientras no hay flujo, el saludo se manda una vez cada 6 h por cliente
// (no responde lo mismo a cada mensaje ni gasta mensajes del plan).
const SALUDO_CADA_MS = 6 * 60 * 60 * 1000;
const saludados = new Map();

export async function restauranteEngine({ negocioId, phone, messageId }) {
  if (yaRespondido(messageId)) return { replyText: null };
  const clave = `${negocioId}:${phone}`;
  const ahora = Date.now();
  if (ahora - (saludados.get(clave) || 0) < SALUDO_CADA_MS) return { replyText: null };
  saludados.set(clave, ahora);
  return {
    replyText: '¡Hola! 👋 Gracias por escribirnos.\nMuy pronto vas a poder hacer tu pedido y reservar mesa por aquí. Si necesitas algo ahora, un encargado te responderá.',
  };
}
