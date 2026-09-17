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

async function resolveNegocioByPhoneNumberId(phoneNumberId) {
  const snap = await db.collection('negocios').where('whatsappPhoneNumberId', '==', phoneNumberId).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

// Mensajes entrantes reales.
router.post('/whatsapp/webhook', async (req, res) => {
  res.sendStatus(200); // Meta espera respuesta rápida; procesamos después.

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const mensajeEntrante = value?.messages?.[0];
    if (!mensajeEntrante) return; // Puede ser un evento de "status", no un mensaje.

    const phoneNumberId = value?.metadata?.phone_number_id;
    const from = mensajeEntrante.from;
    const texto = mensajeEntrante.text?.body || '';

    const negocioId = await resolveNegocioByPhoneNumberId(phoneNumberId);
    if (!negocioId) {
      logger.warn('[whatsappWebhook] Sin negocio para phoneNumberId:', phoneNumberId);
      return;
    }

    const { replyText } = await assistantEngine({ negocioId, phone: from, message: texto });
    await whatsappProvider.send(from, replyText);
  } catch (err) {
    logger.error('[whatsappWebhook] Error procesando mensaje:', err.message);
  }
});

export default router;