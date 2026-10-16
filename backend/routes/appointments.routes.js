import { Router } from 'express';
import { createAppointment } from '../services/appointments/createAppointment.js';
import { processPendingCita, reevaluatePending } from '../services/appointments/pendingService.js';
import { pendingRateLimit, publicBookingRateLimit, publicReadRateLimit } from '../middlewares/rateLimit.middleware.js';
import { createPublicBooking, listBusyAppointments, BookingError } from '../services/appointments/publicBooking.js';
import { logger } from '../utils/logger.js';
import { checkCapability, DENY_MESSAGES } from '../services/capabilities/capabilityService.js';

const router = Router();

router.post('/appointments', publicBookingRateLimit, async (req, res) => {
  // Endpoint público de reserva: exige la capacidad `reservaPublica` y que
  // el negocio no esté bloqueado.
  const negocioId = req.body?.negocioId;
  if (!negocioId || typeof negocioId !== 'string') return res.status(400).json({ error: 'Falta negocioId.' });
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
    // Público: el canal y el cliente nunca se toman del body.
    const { bookedBy: _b, clientId: _c, ...body } = req.body || {};
    const cita = await createAppointment({ ...body, bookedBy: 'client' });
    return res.status(201).json({ ok: true, cita });
  } catch (err) {
    logger.warn('[appointments.routes] createAppointment falló:', err.message);
    return res.status(409).json({ error: err.message });
  }
});

// Reserva pública validada que se usa desde la reserva online del cliente (ClienteApp).
// Mismo control que arriba: capacidad `reservaPublica` y negocio activo.
async function exigirReservaPublica(negocioId, res) {
  try {
    const permiso = await checkCapability(negocioId, 'reservaPublica');
    if (!permiso.allowed) {
      res.status(403).json({ error: DENY_MESSAGES[permiso.reason], code: permiso.reason, capability: 'reservaPublica' });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('[appointments.routes] No se pudo validar reservaPublica:', err.message);
    res.status(500).json({ error: 'No se pudo validar el acceso.' });
    return false;
  }
}

router.post('/appointments/public', publicBookingRateLimit, async (req, res) => {
  const negocioId = typeof req.body?.negocioId === 'string' ? req.body.negocioId : '';
  if (!negocioId) return res.status(400).json({ error: 'Falta negocioId.' });
  if (!(await exigirReservaPublica(negocioId, res))) return undefined;
  try {
    const cita = await createPublicBooking(req.body || {});
    return res.status(201).json({ ok: true, cita });
  } catch (err) {
    if (err instanceof BookingError) return res.status(err.status).json({ error: err.message, code: err.code });
    logger.error('[appointments.routes] reserva pública:', err.message);
    return res.status(500).json({ error: 'No se pudo guardar la reserva. Inténtalo de nuevo.' });
  }
});

// Horarios ocupados de un día (sin nombres ni teléfonos de clientes).
router.get('/appointments/busy', publicReadRateLimit, async (req, res) => {
  try {
    const ocupado = await listBusyAppointments(String(req.query.negocioId || ''), String(req.query.date || ''));
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(ocupado);
  } catch (err) {
    if (err instanceof BookingError) return res.status(err.status).json({ error: err.message });
    logger.error('[appointments.routes] busy:', err.message);
    return res.status(500).json({ error: 'No se pudieron cargar los horarios.' });
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