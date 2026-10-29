// subscriptionNotice.routes.js — Aviso de vencimiento para el ADMINISTRADOR.
//
// Mismo middleware que las rutas de caja: el negocio sale del token, nunca
// del body. Un profesional recibe 401.

import { Router } from 'express';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { requireSession } from '../middlewares/session.middleware.js';
import { requireNegocioAdmin } from '../middlewares/negocioAdmin.middleware.js';
import { logger } from '../utils/logger.js';
import { NoticeError, getNotice, ackNotice } from '../services/subscription/subscriptionNoticeService.js';

const router = Router();
const admin = [identifyRequester, requireSession, requireNegocioAdmin];

function handle(fn) {
  return async (req, res) => {
    try {
      res.status(200).json(await fn(req));
    } catch (err) {
      if (err instanceof NoticeError) return res.status(err.status).json({ error: err.message, code: err.code });
      logger.error('[subscriptionNotice]', req.method, req.path, err.message);
      res.status(500).json({ error: 'Error interno.' });
    }
  };
}

router.get('/subscription-notice', ...admin, handle((req) => getNotice(req.negocioId, req.negocio)));

router.post('/subscription-notice/ack', ...admin, handle((req) => ackNotice(
  req.negocioId,
  req.negocio,
  { tramo: req.body?.tramo, fechaVencimiento: req.body?.fechaVencimiento },
  req.actor,
)));

export default router;
