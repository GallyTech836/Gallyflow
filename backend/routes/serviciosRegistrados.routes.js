// serviciosRegistrados.routes.js — Registro de servicios (plan Nexus Control).
//
// Todas las rutas: identifyRequester + requireSession + (admin del negocio o
// profesional del negocio) + capacidad `registroServicios`.
//   - Admin: el negocio sale de negocios.adminUid == uid del token.
//   - Profesional: el negocio sale del claim negocioId de su token y se
//     comprueba en usuarios/{uid} y negocios/{id}/profesionales/{uid}.
// Nunca se toma el negocio ni el profesional (del barbero) del body.

import { Router } from 'express';
import { db } from '../config/firebase.js';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { requireSession } from '../middlewares/session.middleware.js';
import { requireNegocioAdmin } from '../middlewares/negocioAdmin.middleware.js';
import { requireCapability } from '../services/capabilities/capabilityService.js';
import { logger } from '../utils/logger.js';
import {
  RegistroError, createRegistro, correctRegistro, voidRegistro, listRegistros, listCorrecciones, summarizeYear, invalidateYearSummary,
} from '../services/registros/registroService.js';

const router = Router();

/** Admin del negocio o profesional activo del negocio. Deja req.negocioId. */
export async function requireAdminOrStaff(req, res, next) {
  if (!req.actor?.verified) return res.status(401).json({ error: 'No autenticado.' });
  if (req.actor.rol !== 'barber') return requireNegocioAdmin(req, res, next);
  const negocioId = req.actor.negocioId;
  if (!negocioId) return res.status(403).json({ error: 'No autorizado.' });
  try {
    const [userSnap, proSnap] = await Promise.all([
      db.collection('usuarios').doc(req.actor.uid).get(),
      db.collection('negocios').doc(negocioId).collection('profesionales').doc(req.actor.uid).get(),
    ]);
    const u = userSnap.exists ? userSnap.data() : null;
    if (!u || u.rol !== 'barber' || u.negocioId !== negocioId || !proSnap.exists || proSnap.data()?.active === false) {
      return res.status(403).json({ error: 'No autorizado.' });
    }
    req.negocioId = negocioId;
    next();
  } catch (err) {
    logger.error('[registros] requireAdminOrStaff:', err.message);
    res.status(500).json({ error: 'Error interno.' });
  }
}

const guard = [identifyRequester, requireSession, requireAdminOrStaff, requireCapability('registroServicios')];

function handle(fn, okStatus = 200) {
  return async (req, res) => {
    try {
      const data = await fn(req);
      if (req.method !== 'GET') invalidateYearSummary(req.negocioId);
      res.status(typeof okStatus === 'function' ? okStatus(data) : okStatus).json(data);
    } catch (err) {
      if (err instanceof RegistroError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
      logger.error('[registros]', req.method, req.path, err.message);
      res.status(500).json({ error: 'Error interno.' });
    }
  };
}

router.get('/servicios-registrados', ...guard, handle((req) => listRegistros({ negocioId: req.negocioId, actor: req.actor, query: req.query || {} })));

// GET /servicios-registrados/resumen?year=2026&professionalId=  -> totales por mes.
router.get('/servicios-registrados/resumen', ...guard, handle((req) => summarizeYear({ negocioId: req.negocioId, actor: req.actor, query: req.query || {} })));

router.post('/servicios-registrados', ...guard,
  handle((req) => createRegistro({ negocioId: req.negocioId, actor: req.actor, body: req.body || {} }), (data) => (data.replay ? 200 : 201)));

router.get('/servicios-registrados/:id/correcciones', ...guard,
  handle((req) => listCorrecciones({ negocioId: req.negocioId, actor: req.actor, id: req.params.id })));

router.post('/servicios-registrados/:id/correct', ...guard,
  handle((req) => correctRegistro({ negocioId: req.negocioId, actor: req.actor, id: req.params.id, body: req.body || {} })));

router.post('/servicios-registrados/:id/void', ...guard,
  handle((req) => voidRegistro({ negocioId: req.negocioId, actor: req.actor, id: req.params.id, body: req.body || {} })));

export default router;
