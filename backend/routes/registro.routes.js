// registro.routes.js
//
// Formulario público de registro de negocios (public/registro.html,
// servido en nexusbo.vercel.app/registro).
//
//   POST /api/registro  { website, data } -> { ok: true, id }
//
// Solo guarda una SOLICITUD pendiente en solicitudesRegistro. No crea
// usuarios ni negocios: eso lo hace el Super Admin desde Solicitudes.

import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { registroRateLimit } from '../middlewares/rateLimit.middleware.js';
import { saveSolicitud, RegistroError } from '../services/registro/registroService.js';

const router = Router();

router.post('/registro', registroRateLimit, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Campo trampa: lo llenan los bots, nunca una persona.
  if (typeof body.website === 'string' && body.website.trim()) {
    logger.warn('[registro] Envío descartado (campo trampa).');
    return res.status(200).json({ ok: true, id: null });
  }

  try {
    const { id } = await saveSolicitud(body.data, { ip: req.ip, userAgent: req.get('user-agent') });
    logger.info(`[registro] Solicitud recibida: ${id}`);
    return res.status(201).json({ ok: true, id });
  } catch (err) {
    if (err instanceof RegistroError) {
      return res.status(err.status).json({ error: err.message, errors: err.errors || [] });
    }
    logger.error('[registro] Error guardando solicitud:', err.message);
    return res.status(500).json({ error: 'No pudimos guardar tu registro. Intenta de nuevo en unos minutos.' });
  }
});

export default router;
