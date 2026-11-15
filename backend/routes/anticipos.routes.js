// anticipos.routes.js — Anticipos por QR: lo que hace el dueño desde el modal de la reserva.
// Solo el dueño (negocios.adminUid == uid del token) y con la capacidad 'anticipos'.

import { Router } from 'express';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { requireSession } from '../middlewares/session.middleware.js';
import { requireAuth } from '../middlewares/financeAuth.middleware.js';
import { requireCapability } from '../services/capabilities/capabilityService.js';
import { logger } from '../utils/logger.js';
import { AnticipoError, expireHolds, confirmDeposit, rejectDeposit, resolveDeposit } from '../services/anticipos/anticipoService.js';

const router = Router();
const owner = [identifyRequester, requireSession, requireAuth, requireCapability('anticipos')];

function handle(fn) {
  return async (req, res) => {
    try {
      res.status(200).json(await fn(req));
    } catch (err) {
      if (err instanceof AnticipoError) return res.status(err.status).json({ error: err.message, code: err.code });
      logger.error('[anticipos]', req.method, req.path, err.message);
      res.status(500).json({ error: 'Error interno.' });
    }
  };
}

// Al abrir la agenda: cancela las reservas que no pagaron el anticipo a tiempo.
router.post('/anticipos/vencer', ...owner, handle(async (req) => ({ expired: await expireHolds(req.negocioId) })));

router.post('/anticipos/:citaId/confirmar', ...owner, handle((req) => confirmDeposit(req.negocioId, req.params.citaId, { actor: req.actor })));

router.post('/anticipos/:citaId/rechazar', ...owner, handle((req) => rejectDeposit(req.negocioId, req.params.citaId, { actor: req.actor })));

router.post('/anticipos/:citaId/resolver', ...owner, handle((req) => resolveDeposit(req.negocioId, req.params.citaId, { decision: req.body?.decision, actor: req.actor })));

export default router;
