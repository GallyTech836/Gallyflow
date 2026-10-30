// services/notificationService.js
//
// Servicio GENÉRICO. No sabe qué es OneSignal: solo conoce la interfaz
// común de un "provider" (send(destinatario, mensaje)).

import { db } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { PUBLIC_APP_URL } from '../config/app.js';
import { logger } from '../utils/logger.js';
import { buildMessage } from './notificationTemplates.js';
import { getDeviceIds } from './deviceRegistrationService.js';
import { getBusinessTerms } from './businessProfiles/businessTerms.js';
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
  admin: `${PUBLIC_APP_URL}/`,
  barber: `${PUBLIC_APP_URL}/barber`,
};

export async function getRecipients(negocioId, roles, options = {}) {
  const snap = await db
    .collection('usuarios')
    .where('negocioId', '==', negocioId)
    .where('rol', 'in', roles)
    .get();

  let recipients = snap.docs
    .map((doc) => ({ uid: doc.id, ...doc.data() }))
    .map((u) => ({ ...u, deviceIds: getDeviceIds(u) }))
    .filter((u) => u.deviceIds.length > 0 && u.uid !== options.excludeUid);

  // Si viene un profesional específico, solo ese barbero (+ todos los
  // admins, que siempre deben enterarse) reciben la notificación. Si no
  // viene (ej. cita sin asignar todavía), se mantiene el broadcast a
  // todo el negocio, igual que antes.
  if (options.onlyTargetProfessional && options.targetProfessionalId) {
    // Recordatorios: solo el profesional dueño de la cita, sin avisar a admins.
    recipients = recipients.filter((u) => u.uid === options.targetProfessionalId);
  } else if (Array.isArray(options.targetProfessionalIds)) {
    // Lista de candidatos (Pendiente): admins + solo esos profesionales.
    // Lista vacía => solo admins; nunca se avisa a quien no hace el servicio.
    const ids = new Set(options.targetProfessionalIds);
    recipients = recipients.filter((u) => u.rol === 'admin' || ids.has(u.uid));
  } else if (options.targetProfessionalId && options.targetProfessionalId !== 'pending') {
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

  // El cliente no está asociado a `usuarios`; si el front manda data.negocioId
  // se usa solo para la terminología. Sin él -> términos genéricos.
  const terms = await getBusinessTerms(data?.negocioId);
  const mensaje = buildMessage(tipo, data, terms);

  try {
    await PROVIDERS.push.send(oneSignalId, mensaje);
    logger.info(`[notificationService] ${tipo}: push directo enviado a oneSignalId=${oneSignalId}`);
    return { sent: 1, failed: 0, total: 1 };
  } catch (err) {
    logger.warn(`[notificationService] Falló push directo (${tipo}):`, err.message);
    return { sent: 0, failed: 1, total: 1 };
  }
}

function isDeadDeviceError(err) {
  const msg = String(err?.message || err || '');
  return /not subscribed|invalid_player_ids|invalid_subscription|invalid_aliases/i.test(msg);
}

async function pruneDevices(user, deadIds) {
  const remaining = user.deviceIds.filter((id) => !deadIds.includes(id));
  try {
    await db.collection('usuarios').doc(user.uid).update({
      oneSignalIds: remaining,
      oneSignalId: remaining.length ? remaining[remaining.length - 1] : FieldValue.delete(),
    });
    logger.info(`[notificationService] ${deadIds.length} dispositivo(s) dado(s) de baja quitado(s) (uid=${user.uid})`);
  } catch (err) {
    logger.warn(`[notificationService] No se pudieron limpiar dispositivos (uid=${user.uid}):`, err.message);
  }
}

export async function sendNotification({ tipo, negocioId, data, actorUid, targetProfessionalId, targetProfessionalIds, onlyTargetProfessional }) {
  const recipients = await getRecipients(negocioId, ['admin', 'barber'], {
    excludeUid: actorUid,
    targetProfessionalId,
    targetProfessionalIds,
    onlyTargetProfessional,
  });

  if (recipients.length === 0) {
    logger.info(`[notificationService] Sin destinatarios para negocio=${negocioId}, tipo=${tipo}`);
    return { sent: 0, total: 0 };
  }

  const terms = await getBusinessTerms(negocioId);
  const mensaje = buildMessage(tipo, data, terms);

  // Un envío por dispositivo; el destinatario cuenta como "enviado" si le
  // llegó al menos a uno de sus dispositivos.
  const results = await Promise.all(
    recipients.map(async (r) => {
      const perDevice = await Promise.allSettled(
        r.deviceIds.map((id) => PROVIDERS.push.send(id, mensaje, APP_URLS[r.rol]))
      );
      const ok = perDevice.filter((d) => d.status === 'fulfilled').length;
      const errors = perDevice
        .filter((d) => d.status === 'rejected')
        .map((d) => d.reason?.message || String(d.reason));
      // Dispositivos que OneSignal da por muertos (dados de baja o ID inválido):
      // se quitan de la lista. Si el usuario vuelve a abrir la app y acepta
      // notificaciones, se registra de nuevo solo.
      const dead = r.deviceIds.filter((id, i) =>
        perDevice[i].status === 'rejected' && isDeadDeviceError(perDevice[i].reason));
      if (dead.length) await pruneDevices(r, dead);
      return { user: r, ok, devices: perDevice.length, errors };
    })
  );

  const sent = results.filter((r) => r.ok > 0).length;
  const failed = results.length - sent;

  if (failed > 0) {
    logger.warn(`[notificationService] ${failed} envíos fallaron de ${results.length} (negocio=${negocioId})`);
  }
  // Detalle de quién no recibió (o recibió solo en parte) y qué respondió OneSignal.
  results.forEach(({ user: u, ok, devices, errors }) => {
    if (errors.length === 0) return;
    const quien = u.nombre || u.name || u.username || u.uid;
    logger.warn(`[notificationService]   ↳ ${u.rol} "${quien}" (uid=${u.uid}): ${ok}/${devices} dispositivos. ${errors[0]}`);
  });
  logger.info(`[notificationService] ${tipo}: enviado a ${sent}/${results.length} destinatarios (negocio=${negocioId})`);

  return { sent, failed, total: results.length };
}