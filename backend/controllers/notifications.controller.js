import { registerDevice } from '../services/deviceRegistrationService.js';
import { sendNotification } from '../services/notificationService.js';
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
  const { tipo, negocioId, data, actorUid } = req.body || {};
  if (!tipo || !negocioId) {
    return res.status(400).json({ error: 'Faltan campos requeridos: tipo, negocioId.' });
  }
  try {
    const result = await sendNotification({ tipo, negocioId, data, actorUid });
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    logger.warn('[notifications.controller] sendNotification pendiente:', err.message);
    return res.status(501).json({ error: err.message });
  }
}