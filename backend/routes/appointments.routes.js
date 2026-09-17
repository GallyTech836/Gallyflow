import { Router } from 'express';
import { createAppointment } from '../services/appointments/createAppointment.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.post('/appointments', async (req, res) => {
  try {
    const cita = await createAppointment(req.body || {});
    return res.status(201).json({ ok: true, cita });
  } catch (err) {
    logger.warn('[appointments.routes] createAppointment falló:', err.message);
    return res.status(409).json({ error: err.message });
  }
});

export default router;