import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../config/firebase.js';
import { runAssistant } from '../services/assistantEngine/router.js';
import * as whatsappProvider from '../services/providers/whatsappProvider.js';
import { logger } from '../utils/logger.js';
import {
  checkCapability, incrementUsage, incrementRejected, resolveUsageBranch, checkBranchLimit, incrementBranchUsage, incrementClientUsage,
} from '../services/capabilities/capabilityService.js';
import { updateConversation } from '../services/appointments/conversationState.js';
import { enqueue, drain, inboxEnabled, registerBatchHandler } from '../services/whatsapp/inboundQueue.js';
import {
  recordInbound, recordOutboundDaily, recordConversationEvent, safe,
} from '../services/assistantMetrics/assistantMetrics.js';

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

// ───────────────────── Mensajes entrantes (Meta y YCloud) ─────────────────────
//
// 1. Se normaliza cada mensaje (texto, botón, foto, archivo, reacción...).
// 2. Se guarda en la cola de Firestore ANTES de responder 200: si el guardado
//    falla se responde 500 y el proveedor reintenta. Un mensaje repetido (mismo
//    id de WhatsApp) no se guarda dos veces.
// 3. La cola procesa cada conversación de a un lote por vez (inboundQueue.js):
//    varias fotos seguidas = una sola respuesta.
// No se marca como leído: el cliente ve "leído" solo cuando alguien del
// negocio abre el chat (en YCloud, marcar leído y "escribiendo…" son la
// misma llamada, así que tampoco se muestra "escribiendo…").

// Tipos que se aceptan sin responder nada.
const TIPOS_IGNORADOS = new Set(['reaction', 'sticker', 'system', 'ephemeral', 'unknown']);

/**
 * Mensaje del proveedor -> forma única que guarda la cola:
 * { id, from, phoneNumberId, displayPhone, kind, type, text, media, referral }
 *   kind: 'text' | 'interactive' | 'media' (foto) | 'unsupported' | 'ignored'
 * Nunca deja campos en undefined (Firestore no los acepta).
 */
export function normalizarMensaje(mensaje = {}, value = {}) {
  const type = String(mensaje.type || 'unknown');
  const base = {
    id: mensaje.id ? String(mensaje.id) : null,
    from: mensaje.from ? String(mensaje.from) : null,
    phoneNumberId: String(value?.metadata?.phone_number_id || ''),
    displayPhone: value?.metadata?.display_phone_number || null,
    type,
    kind: 'ignored',
    text: null,
    media: null,
    // Click to WhatsApp (anuncios de Facebook/Instagram): llega en el primer mensaje.
    referral: mensaje.referral || null,
  };
  if (type === 'text') return { ...base, kind: 'text', text: mensaje.text?.body || '' };
  if (type === 'interactive') {
    // Toque en un botón / fila de lista: su id es lo que entiende el motor.
    const id = mensaje.interactive?.button_reply?.id ?? mensaje.interactive?.list_reply?.id ?? null;
    return id === null ? { ...base, kind: 'unsupported' } : { ...base, kind: 'interactive', text: String(id) };
  }
  // Respuesta rápida de una plantilla (botón de un mensaje con plantilla).
  if (type === 'button') return { ...base, kind: 'text', text: mensaje.button?.payload || mensaje.button?.text || '' };
  if (type === 'image' && mensaje.image) {
    return {
      ...base,
      kind: 'media',
      // La descripción de la foto se usa como texto del cliente.
      text: mensaje.image.caption ? String(mensaje.image.caption) : null,
      media: { link: mensaje.image.link || null, mimeType: mensaje.image.mime_type || null, id: mensaje.image.id || null },
    };
  }
  if (TIPOS_IGNORADOS.has(type)) return base;
  // Audio, video, documento, ubicación y cualquier tipo nuevo: no soportado
  // (un solo aviso por lote). La descripción, si viene, se usa como texto.
  const caption = mensaje[type]?.caption;
  return { ...base, kind: 'unsupported', text: caption ? String(caption) : null };
}

/**
 * Procesa un lote de mensajes de UN cliente en UN número del negocio
 * (normalmente uno; varios si mandó fotos o archivos seguidos).
 */
async function procesarLote(lote) {
  if (!lote?.length) return;
  const base = lote[0];
  const from = base.from;

  const cuenta = await whatsappProvider.resolveAccount(base.phoneNumberId);
  if (!cuenta) {
    logger.warn('[whatsappWebhook] Sin negocio para phoneNumberId:', base.phoneNumberId);
    return;
  }
  const envio = { phoneNumberId: cuenta.phoneNumberId, token: cuenta.token, provider: cuenta.provider, from: cuenta.phone };
  registrarActividad(cuenta.negocioId, base.displayPhone);
  // Capacidad `asistenteWhatsapp` + límite mensual de mensajes. Si no está
  // permitido, el bot no responde (no gasta mensajes). Se valida aquí, en el
  // servidor, sin importar lo que muestre AdminApp.
  const permiso = await checkCapability(cuenta.negocioId, 'asistenteWhatsapp');
  if (!permiso.allowed) {
    logger.warn(`[whatsappWebhook] Asistente no permitido para ${cuenta.negocioId}: ${permiso.reason}`);
    if (permiso.reason === 'limite_alcanzado') incrementRejected(cuenta.negocioId, permiso.usageKey);
    return;
  }
  // Métricas de Super Admin: cada entrante sin duplicados. En paralelo para
  // no retrasar la respuesta.
  const entrantes = lote.map((m) => safe(recordInbound({ negocioId: cuenta.negocioId, phone: from, messageId: m.id }), 'entrante'));

  // Reacciones y stickers: se registran como entrantes, sin respuesta.
  const principal = [...lote].reverse().find((m) => m.kind === 'text' || m.kind === 'interactive') || null;
  const fotos = lote.filter((m) => m.kind === 'media' && m.media).map((m) => m.media);
  const noSoportados = lote.filter((m) => m.kind === 'unsupported').length;
  if (!principal && fotos.length === 0 && noSoportados === 0) {
    await Promise.all(entrantes);
    return;
  }

  // Límite POR SUCURSAL: respuestas que el bot envía desde el número de esta
  // sucursal en el mes. Si ya llegó, el bot no responde en ese número (las
  // demás sucursales siguen normales).
  const limiteSucursal = permiso.limit ?? null;
  const sucursal = await resolveUsageBranch(cuenta.negocioId, cuenta.branch);
  const porSucursal = await checkBranchLimit(cuenta.negocioId, sucursal.id, limiteSucursal);
  if (!porSucursal.allowed) {
    logger.warn(`[whatsappWebhook] Sucursal ${sucursal.id} alcanzó ${porSucursal.limit} respuestas del mes (${cuenta.negocioId})`);
    incrementRejected(cuenta.negocioId, 'whatsappMensajes');
    return;
  }
  // Cada mensaje que el bot envía cuenta: total del negocio y por cliente
  // (datos) + el de la sucursal (límite).
  const contarEnvio = () => Promise.all([
    incrementUsage(cuenta.negocioId, 'whatsappMensajes', 1),
    incrementBranchUsage(cuenta.negocioId, sucursal, limiteSucursal),
    incrementClientUsage(cuenta.negocioId, from),
    safe(recordOutboundDaily({ negocioId: cuenta.negocioId }), 'saliente diario'),
  ]);

  // Texto del lote: lo que escribió o tocó; si solo mandó fotos/archivos,
  // la descripción que les puso (si la hay).
  const descripciones = lote.filter((m) => m !== principal && m.kind !== 'text' && m.kind !== 'interactive' && m.text).map((m) => m.text);
  const texto = principal ? principal.text : descripciones.join('\n');

  const resultado = await runAssistant({
    negocioId: cuenta.negocioId,
    phone: from,
    message: texto,
    messageId: lote[lote.length - 1].id,
    branch: cuenta.branch,
    referral: lote.find((m) => m.referral)?.referral || null,
    media: fotos.length ? fotos : null,
    unsupportedCount: noSoportados,
  });
  try {
    await enviarRespuesta(from, resultado, envio, contarEnvio, cuenta.negocioId);
  } finally {
    // Métricas: en qué paso quedó la conversación y si hubo reserva,
    // reprogramación o pase a una persona. Un webhook repetido no cuenta.
    const regs = await Promise.all(entrantes);
    if (regs.some((r) => r?.counted)) {
      await safe(recordConversationEvent({
        negocioId: cuenta.negocioId,
        phone: from,
        flow: resultado?.conversation?.currentFlow || null,
        event: resultado?.metricEvent || null,
      }), 'evento de conversación');
    }
  }
}

registerBatchHandler(procesarLote);

async function enviarRespuesta(from, { replyText, interactive, preMessages = [] } = {}, envio, contarEnvio, negocioId = '') {
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
      // Si se rechaza el interactivo se manda el texto de respaldo (siempre
      // corto). Se registra con detalle para poder diagnosticarlo.
      const filas = (interactive.action?.sections || []).reduce((n, sec) => n + (sec.rows || []).length, 0);
      const botones = (interactive.action?.buttons || []).length;
      logger.error(`[whatsappWebhook] Interactivo rechazado (negocio ${negocioId}, ${envio?.provider || 'meta'}, tipo ${interactive.type}, filas ${filas}, botones ${botones}); se envía texto:`, err.message);
    }
  }
  if (replyText) {
    await whatsappProvider.send(from, replyText, envio);
    await contarEnvio();
  }
}

/**
 * Recibe los mensajes de un webhook: los guarda en la cola, responde 200 y
 * procesa cada conversación. Con ASSISTANT_INBOX=off, procesamiento directo.
 * `items` = [{ value, mensaje }] en formato Meta.
 */
async function recibir(items, res) {
  if (!inboxEnabled()) {
    res.sendStatus(200);
    for (const { value, mensaje } of items) {
      try {
        await procesarLote([normalizarMensaje(mensaje, value)]);
      } catch (err) {
        logger.error('[whatsappWebhook] Error procesando mensaje:', err.message);
      }
    }
    return;
  }

  const conversaciones = new Map();
  try {
    for (const { value, mensaje } of items) {
      const norm = normalizarMensaje(mensaje, value);
      if (!norm.id || !norm.from) continue;
      const cuenta = await whatsappProvider.resolveAccount(norm.phoneNumberId);
      if (!cuenta) {
        logger.warn('[whatsappWebhook] Sin negocio para phoneNumberId:', norm.phoneNumberId);
        continue;
      }
      const { duplicate } = await enqueue({ negocioId: cuenta.negocioId, phone: norm.from, mensaje: norm });
      if (duplicate) continue;
      conversaciones.set(`${cuenta.negocioId}__${norm.from}`, { negocioId: cuenta.negocioId, phone: norm.from });
    }
  } catch (err) {
    // Sin guardar no se confirma: el proveedor reintenta (lo ya guardado no se duplica).
    logger.error('[whatsappWebhook] No se pudo guardar el mensaje entrante:', err.message);
    return res.sendStatus(500);
  }
  res.sendStatus(200);

  for (const { negocioId, phone } of conversaciones.values()) {
    try {
      await drain(negocioId, phone);
    } catch (err) {
      logger.error('[whatsappWebhook] Error procesando la conversación:', err.message);
    }
  }
}

// Mensajes entrantes reales (Meta Cloud API).
router.post('/whatsapp/webhook', async (req, res) => {
  if (!(await firmaValida(req))) {
    logger.warn('[whatsappWebhook] Firma inválida, se ignora la petición.');
    return res.sendStatus(401);
  }
  // Un mismo webhook puede traer varios mensajes (entries/changes/messages).
  const items = [];
  for (const entry of req.body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      for (const mensaje of value?.messages || []) items.push({ value, mensaje });
    }
  }
  if (items.length === 0) return res.sendStatus(200); // estados de entrega, etc.
  return recibir(items, res);
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
// Coexistencia: Meta exige abrir la app de WhatsApp Business al menos cada
// 14 días. Cada mensaje que el dueño manda desde la app prueba que la usó:
// se guarda (como máximo una vez por hora) para el aviso del panel.
const APP_ACTIVIDAD_INTERVALO_MS = 60 * 60 * 1000;
const ultimaActividadApp = new Map();
function registrarActividadApp(cuentaId) {
  const ahora = Date.now();
  if (ahora - (ultimaActividadApp.get(cuentaId) || 0) < APP_ACTIVIDAD_INTERVALO_MS) return;
  ultimaActividadApp.set(cuentaId, ahora);
  db.collection('whatsappAccounts').doc(cuentaId)
    .update({ lastAppActivityAt: new Date(ahora).toISOString() }) // update: nunca recrea un número quitado
    .catch((err) => logger.warn('[ycloudWebhook] No se pudo registrar uso de la app:', err.message));
}

async function pausarBotPorRespuestaHumana(m) {
  const cuentaId = `ycloud_${soloDigitos(m.from)}`;
  const cuenta = await whatsappProvider.resolveAccount(cuentaId);
  if (cuenta) registrarActividadApp(cuentaId);
  const cliente = soloDigitos(m.to);
  if (!cuenta || !cliente) return;
  await updateConversation(cuenta.negocioId, cliente, {
    currentFlow: 'human',
    humanUntil: new Date(Date.now() + PAUSA_HUMANO_MS).toISOString(),
  });
  // Métricas: si el cliente tiene una conversación abierta, la atendió una persona.
  await safe(recordConversationEvent({ negocioId: cuenta.negocioId, phone: cliente, event: 'humano' }), 'respuesta humana');
}

router.post('/whatsapp/ycloud/webhook', async (req, res) => {
  if (!firmaYCloudValida(req)) {
    logger.warn('[ycloudWebhook] Firma inválida, se ignora la petición.');
    return res.sendStatus(401);
  }
  const evento = req.body || {};
  if (evento.type === 'whatsapp.inbound_message.received') {
    const m = evento.whatsappInboundMessage || {};
    // Se adapta al formato de Meta (mismo camino que los mensajes de Meta).
    return recibir([{
      value: { metadata: { phone_number_id: `ycloud_${soloDigitos(m.to)}`, display_phone_number: m.to || null } },
      mensaje: { ...m, id: m.wamid || m.id, from: soloDigitos(m.from), referral: m.referral || null },
    }], res);
  }
  res.sendStatus(200);

  try {
    if (evento.type === 'whatsapp.smb.message.echoes') {
      await pausarBotPorRespuestaHumana(evento.whatsappMessage || {});
    }
  } catch (err) {
    logger.error('[ycloudWebhook] Error procesando evento:', err.message);
  }
});

export default router;
