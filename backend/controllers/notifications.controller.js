import { registerDevice } from '../services/deviceRegistrationService.js';
import { sendNotification, sendDirectNotification } from '../services/notificationService.js';
import { logger } from '../utils/logger.js';

export async function handleRegisterDevice(req, res) {
  const { uid, rol, negocioId, oneSignalId } = req.body || {};
  if (!uid || !rol || !negocioId || !oneSignalId) {
    return res.status(400).json({ error: 'Faltan campos requeridos: uid, rol, negocioId, oneSignalId.' });
  }
  try {
    const result = await registerDevice({ uid, rol, negocioId, oneSignalId });
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    logger.warn('[notifications.controller] registerDevice pendiente:', err.message);
    return res.status(501).json({ error: err.message });
  }
}

export async function handleSendNotification(req, res) {
  const { tipo, negocioId, data, actorUid, targetProfessionalId } = req.body || {};
  if (!tipo || !negocioId) {
    return res.status(400).json({ error: 'Faltan campos requeridos: tipo, negocioId.' });
  }
  try {
    const result = await sendNotification({ tipo, negocioId, data, actorUid, targetProfessionalId });
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    logger.warn('[notifications.controller] sendNotification pendiente:', err.message);
    return res.status(501).json({ error: err.message });
  }
}

// Push directo al dispositivo del cliente (ClienteApp), sin pasar por la
// colección `usuarios` ni por getRecipients(). No falla la petición aunque
// el push no se pueda enviar: la reserva del cliente ya quedó guardada
// en Firestore de todos modos, esto es solo un "extra".
export async function handleSendDirectNotification(req, res) {
  const { oneSignalId, tipo, data } = req.body || {};
  if (!oneSignalId || !tipo) {
    return res.status(400).json({ error: 'Faltan campos requeridos: oneSignalId, tipo.' });
  }
  try {
    const result = await sendDirectNotification({ oneSignalId, tipo, data });
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    logger.warn('[notifications.controller] sendDirectNotification pendiente:', err.message);
    return res.status(200).json({ ok: false, error: err.message });
  }
}