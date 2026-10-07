import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../config/firebase.js';
import { assistantEngine } from '../services/assistantEngine/engine.js';
import * as whatsappProvider from '../services/providers/whatsappProvider.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Verificación inicial de Meta (una sola vez, al configurar el webhook).
router.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Firma de Meta: HMAC-SHA256 del body crudo con el App Secret.
// Sin WHATSAPP_APP_SECRET configurado se acepta (con aviso) para no cortar
// el servicio mientras se configura; en producción debe estar puesto.
let avisoSinSecret = false;
function firmaValida(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    if (!avisoSinSecret) {
      logger.warn('[whatsappWebhook] WHATSAPP_APP_SECRET no configurado: no se valida la firma de Meta.');
      avisoSinSecret = true;
    }
    return true;
  }
  const firma = req.get('x-hub-signature-256') || '';
  if (!req.rawBody || !firma.startsWith('sha256=')) return false;

  const esperada = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Para la sección "Asistente WhatsApp" de AdminApp: número visible y último
// mensaje. Como máximo una escritura cada 10 min por negocio (cada cambio al
// doc del negocio dispara los listeners abiertos de las apps).
const ACTIVIDAD_INTERVALO_MS = 10 * 60 * 1000;
const ultimaActividad = new Map();
function registrarActividad(negocioId, displayPhone) {
  const ahora = Date.now();
  if (ahora - (ultimaActividad.get(negocioId) || 0) < ACTIVIDAD_INTERVALO_MS) return;
  ultimaActividad.set(negocioId, ahora);
  db.collection('negocios').doc(negocioId).update({
    'assistantConfig.displayPhone': displayPhone || null,
    'assistantConfig.lastMessageAt': new Date(ahora).toISOString(),
  }).catch((err) => logger.warn('[whatsappWebhook] No se pudo registrar actividad:', err.message));
}

const MENSAJE_NO_TEXTO = 'Por ahora solo entiendo mensajes de texto 🙂 Toca una opción o escribe su número.';

async function procesarMensaje(value, mensaje) {
  const phoneNumberId = value?.metadata?.phone_number_id;
  const from = mensaje.from;

  const cuenta = await whatsappProvider.resolveAccount(phoneNumberId);
  if (!cuenta) {
    logger.warn('[whatsappWebhook] Sin negocio para phoneNumberId:', phoneNumberId);
    return;
  }
  const envio = { phoneNumberId: cuenta.phoneNumberId, token: cuenta.token };
  registrarActividad(cuenta.negocioId, value?.metadata?.display_phone_number);
  whatsappProvider.markAsRead(mensaje.id, envio); // sin await: no retrasa la respuesta

  // Texto escrito, o toque en un botón / fila de lista (su id es el mismo
  // número que se escribiría a mano: "1", "2", ... o "mas").
  let texto = null;
  if (mensaje.type === 'text') texto = mensaje.text?.body || '';
  else if (mensaje.type === 'interactive') {
    texto = mensaje.interactive?.button_reply?.id ?? mensaje.interactive?.list_reply?.id ?? null;
  }

  if (texto === null) {
    await whatsappProvider.send(from, MENSAJE_NO_TEXTO, envio);
    return;
  }

  const { replyText, interactive, preMessages = [] } = await assistantEngine({
    negocioId: cuenta.negocioId,
    phone: from,
    message: texto,
    messageId: mensaje.id,
  });

  // Mensajes previos (tarjetas con foto), en orden. Si uno falla, se sigue.
  for (const pre of preMessages) {
    try {
      await whatsappProvider.sendInteractive(from, pre.interactive, envio);
    } catch (err) {
      logger.warn('[whatsappWebhook] Tarjeta rechazada:', err.message);
    }
  }

  if (interactive) {
    try {
      await whatsappProvider.sendInteractive(from, interactive, envio);
      return;
    } catch (err) {
      // Si Meta rechaza el interactivo, se manda la versión de texto.
      logger.warn('[whatsappWebhook] Interactivo rechazado, se envía texto:', err.message);
    }
  }
  if (replyText) {
    await whatsappProvider.send(from, replyText, envio);
  }
}

// Mensajes entrantes reales.
router.post('/whatsapp/webhook', async (req, res) => {
  if (!firmaValida(req)) {
    logger.warn('[whatsappWebhook] Firma inválida, se ignora la petición.');
    return res.sendStatus(401);
  }
  res.sendStatus(200); // Meta espera respuesta rápida; procesamos después.

  // Un mismo webhook puede traer varios mensajes (entries/changes/messages).
  for (const entry of req.body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      for (const mensaje of value?.messages || []) {
        try {
          await procesarMensaje(value, mensaje);
        } catch (err) {
          logger.error('[whatsappWebhook] Error procesando mensaje:', err.message);
        }
      }
    }
  }
});

export default router;
