import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../config/firebase.js';
import { runAssistant } from '../services/assistantEngine/router.js';
import * as whatsappProvider from '../services/providers/whatsappProvider.js';
import { logger } from '../utils/logger.js';
import { checkCapability, incrementUsage, incrementRejected } from '../services/capabilities/capabilityService.js';
import { updateConversation } from '../services/appointments/conversationState.js';

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

// Firma de Meta: HMAC-SHA256 del body crudo con el App Secret de la app que
// envía el webhook. Primero WHATSAPP_APP_SECRET (tu app); si no coincide, el
// appSecret del número en whatsappAccounts (app propia del negocio).
function firmaCoincide(req, secret) {
  if (!secret) return false;
  const firma = req.get('x-hub-signature-256') || '';
  if (!req.rawBody || !firma.startsWith('sha256=')) return false;
  const esperada = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function firmaValida(req) {
  if (firmaCoincide(req, process.env.WHATSAPP_APP_SECRET)) return true;
  const ids = new Set();
  for (const entry of req.body?.entry || []) {
    for (const change of entry?.changes || []) {
      const id = change?.value?.metadata?.phone_number_id;
      if (id) ids.add(String(id));
    }
  }
  for (const id of ids) {
    const cuenta = await whatsappProvider.resolveAccount(id);
    if (firmaCoincide(req, cuenta?.appSecret)) return true;
  }
  return false;
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
  const envio = { phoneNumberId: cuenta.phoneNumberId, token: cuenta.token, provider: cuenta.provider, from: cuenta.phone };
  registrarActividad(cuenta.negocioId, value?.metadata?.display_phone_number);
  // Capacidad `asistenteWhatsapp` + límite mensual de mensajes. Si no está
  // permitido, el bot no responde (no gasta mensajes). Se valida aquí, en el
  // servidor, sin importar lo que muestre AdminApp.
  const permiso = await checkCapability(cuenta.negocioId, 'asistenteWhatsapp');
  if (!permiso.allowed) {
    logger.warn(`[whatsappWebhook] Asistente no permitido para ${cuenta.negocioId}: ${permiso.reason}`);
    if (permiso.reason === 'limite_alcanzado') incrementRejected(cuenta.negocioId, permiso.usageKey);
    return;
  }
  // Cada mensaje que el bot envía cuenta para el consumo del mes.
  const contarEnvio = () => incrementUsage(cuenta.negocioId, 'whatsappMensajes', 1);

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
    await contarEnvio();
    return;
  }

  const { replyText, interactive, preMessages = [] } = await runAssistant({
    negocioId: cuenta.negocioId,
    phone: from,
    message: texto,
    messageId: mensaje.id,
    branch: cuenta.branch,
    // Click to WhatsApp (anuncios de Facebook/Instagram): Meta y YCloud lo
    // mandan en el primer mensaje del cliente.
    referral: mensaje.referral || null,
  });

  // Mensajes previos (tarjetas con foto), en orden. Si uno falla, se sigue.
  for (const pre of preMessages) {
    try {
      await whatsappProvider.sendInteractive(from, pre.interactive, envio);
      await contarEnvio(); // cada tarjeta con foto es un mensaje enviado
    } catch (err) {
      logger.warn('[whatsappWebhook] Tarjeta rechazada:', err.message);
    }
  }

  if (interactive) {
    try {
      await whatsappProvider.sendInteractive(from, interactive, envio);
      await contarEnvio();
      return;
    } catch (err) {
      // Si Meta rechaza el interactivo, se manda la versión de texto.
      logger.warn('[whatsappWebhook] Interactivo rechazado, se envía texto:', err.message);
    }
  }
  if (replyText) {
    await whatsappProvider.send(from, replyText, envio);
    await contarEnvio();
  }
}

// Mensajes entrantes reales.
router.post('/whatsapp/webhook', async (req, res) => {
  if (!(await firmaValida(req))) {
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

// ───────────────────────── YCloud (coexistencia) ─────────────────────────
// El negocio sigue usando su app de WhatsApp Business y el bot responde por
// YCloud en el mismo número. Webhook: POST /api/whatsapp/ycloud/webhook

// Firma: header YCloud-Signature "t=<timestamp>,s=<firma>", HMAC-SHA256 de
// "<timestamp>.<body>" con YCLOUD_WEBHOOK_SECRET (el whsec_... del endpoint).
function firmaYCloudValida(req) {
  const secret = process.env.YCLOUD_WEBHOOK_SECRET;
  if (!secret || !req.rawBody) return false;
  const partes = {};
  for (const p of (req.get('ycloud-signature') || '').split(',')) {
    const i = p.indexOf('=');
    if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  if (!partes.t || !partes.s) return false;
  const esperada = crypto.createHmac('sha256', secret).update(`${partes.t}.${req.rawBody.toString('utf8')}`).digest('hex');
  const a = Buffer.from(partes.s);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const soloDigitos = (n) => String(n || '').replace(/\D/g, '');
const PAUSA_HUMANO_MS = 2 * 60 * 60 * 1000; // igual que "Hablar con alguien"

// El dueño respondió desde la app de WhatsApp Business: el bot se calla en
// ese chat por 2 h (el cliente puede escribir "menu" para volver al bot).
async function pausarBotPorRespuestaHumana(m) {
  const cuenta = await whatsappProvider.resolveAccount(`ycloud_${soloDigitos(m.from)}`);
  const cliente = soloDigitos(m.to);
  if (!cuenta || !cliente) return;
  await updateConversation(cuenta.negocioId, cliente, {
    currentFlow: 'human',
    humanUntil: new Date(Date.now() + PAUSA_HUMANO_MS).toISOString(),
  });
}

router.post('/whatsapp/ycloud/webhook', async (req, res) => {
  if (!firmaYCloudValida(req)) {
    logger.warn('[ycloudWebhook] Firma inválida, se ignora la petición.');
    return res.sendStatus(401);
  }
  res.sendStatus(200);

  const evento = req.body || {};
  try {
    if (evento.type === 'whatsapp.inbound_message.received') {
      const m = evento.whatsappInboundMessage || {};
      // Se adapta al formato de Meta para reutilizar procesarMensaje.
      await procesarMensaje(
        { metadata: { phone_number_id: `ycloud_${soloDigitos(m.to)}`, display_phone_number: m.to } },
        { id: m.wamid || m.id, from: soloDigitos(m.from), type: m.type, text: m.text, interactive: m.interactive, referral: m.referral || null },
      );
    } else if (evento.type === 'whatsapp.smb.message.echoes') {
      await pausarBotPorRespuestaHumana(evento.whatsappMessage || {});
    }
  } catch (err) {
    logger.error('[ycloudWebhook] Error procesando evento:', err.message);
  }
});

export default router;
