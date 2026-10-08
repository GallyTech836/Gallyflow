import { Router } from 'express';
import { createAppointment } from '../services/appointments/createAppointment.js';
import { processPendingCita, reevaluatePending } from '../services/appointments/pendingService.js';
import { pendingRateLimit } from '../middlewares/rateLimit.middleware.js';
import { logger } from '../utils/logger.js';
import { checkCapability, DENY_MESSAGES } from '../services/capabilities/capabilityService.js';

const router = Router();

router.post('/appointments', async (req, res) => {
  // Endpoint público de reserva: exige la capacidad `reservaPublica` y que
  // el negocio no esté bloqueado.
  const negocioId = req.body?.negocioId;
  if (negocioId) {
    try {
      const permiso = await checkCapability(negocioId, 'reservaPublica');
      if (!permiso.allowed) {
        return res.status(403).json({ error: DENY_MESSAGES[permiso.reason], code: permiso.reason, capability: 'reservaPublica' });
      }
    } catch (err) {
      logger.warn('[appointments.routes] No se pudo validar reservaPublica:', err.message);
      return res.status(500).json({ error: 'No se pudo validar el acceso.' });
    }
  }
  try {
    const cita = await createAppointment(req.body || {});
    return res.status(201).json({ ok: true, cita });
  } catch (err) {
    logger.warn('[appointments.routes] createAppointment falló:', err.message);
    return res.status(409).json({ error: err.message });
  }
});

// Citas "Pendiente": evaluar una recién creada / reevaluar una fecha.
// Idempotentes (transacción): se pueden llamar las veces que haga falta.
router.post('/appointments/pending/process', pendingRateLimit, async (req, res) => {
  try {
    const result = await processPendingCita(req.body || {});
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    logger.warn('[appointments.routes] processPendingCita falló:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

router.post('/appointments/pending/reevaluate', pendingRateLimit, async (req, res) => {
  try {
    const result = await reevaluatePending(req.body || {});
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    logger.warn('[appointments.routes] reevaluatePending falló:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

export default router;