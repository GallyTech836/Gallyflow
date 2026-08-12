// services/notificationService.js
//
// Servicio GENÉRICO. No sabe qué es OneSignal: solo conoce la interfaz
// común de un "provider" (send(destinatario, mensaje)).

import { db } from '../config/firebase.js';
import { logger } from '../utils/logger.js';
import { buildMessage } from './notificationTemplates.js';
import * as oneSignalProvider from './providers/oneSignalProvider.js';
import * as whatsappProvider from './providers/whatsappProvider.js';
import * as emailProvider from './providers/emailProvider.js';

const PROVIDERS = {
  push: oneSignalProvider,
  whatsapp: whatsappProvider,
  email: emailProvider,
};

// URLs de destino según el rol de quien recibe la notificación. Deben
// coincidir exactamente con las rutas que reconoce App.jsx en el frontend.
const APP_URLS = {
  admin: 'https://gallyflow.vercel.app/',
  barber: 'https://gallyflow.vercel.app/barber',
};

export async function getRecipients(negocioId, roles, options = {}) {
  const snap = await db
    .collection('usuarios')
    .where('negocioId', '==', negocioId)
    .where('rol', 'in', roles)
    .get();

  let recipients = snap.docs
    .map((doc) => ({ uid: doc.id, ...doc.data() }))
    .filter((u) => u.oneSignalId && u.uid !== options.excludeUid);

  // Si viene un profesional específico, solo ese barbero (+ todos los
  // admins, que siempre deben enterarse) reciben la notificación. Si no
  // viene (ej. cita sin asignar todavía), se mantiene el broadcast a
  // todo el negocio, igual que antes.
  if (options.targetProfessionalId && options.targetProfessionalId !== 'pending') {
    recipients = recipients.filter(
      (u) => u.rol === 'admin' || u.uid === options.targetProfessionalId
    );
  }

  return recipients;
}

// Envío DIRECTO a un solo subscriptionId de OneSignal, sin pasar por
// getRecipients() ni por la colección `usuarios` (esa colección y esa
// función son solo para admin/barber). Pensado para notificar al propio
// cliente su propia reserva justo después de crearla, en la misma sesión
// del navegador donde reservó — no requiere guardar nada en Firestore.
export async function sendDirectNotification({ oneSignalId, tipo, data }) {
  if (!oneSignalId) {
    return { sent: 0, skipped: true, reason: 'sin oneSignalId' };
  }

  const mensaje = buildMessage(tipo, data);

  try {
    await PROVIDERS.push.send(oneSignalId, mensaje);
    logger.info(`[notificationService] ${tipo}: push directo enviado a oneSignalId=${oneSignalId}`);
    return { sent: 1, failed: 0, total: 1 };
  } catch (err) {
    logger.warn(`[notificationService] Falló push directo (${tipo}):`, err.message);
    return { sent: 0, failed: 1, total: 1 };
  }
}

export async function sendNotification({ tipo, negocioId, data, actorUid, targetProfessionalId }) {
  const recipients = await getRecipients(negocioId, ['admin', 'barber'], {
    excludeUid: actorUid,
    targetProfessionalId,
  });

  if (recipients.length === 0) {
    logger.info(`[notificationService] Sin destinatarios para negocio=${negocioId}, tipo=${tipo}`);
    return { sent: 0, total: 0 };
  }

  const mensaje = buildMessage(tipo, data);

  const results = await Promise.allSettled(
    recipients.map((r) => PROVIDERS.push.send(r.oneSignalId, mensaje, APP_URLS[r.rol]))
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - sent;

  if (failed > 0) {
    logger.warn(`[notificationService] ${failed} envíos fallaron de ${results.length} (negocio=${negocioId})`);
  }
  logger.info(`[notificationService] ${tipo}: enviado a ${sent}/${results.length} destinatarios (negocio=${negocioId})`);

  return { sent, failed, total: results.length };
}