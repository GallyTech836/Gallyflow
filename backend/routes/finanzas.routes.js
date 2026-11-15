// finanzas.routes.js — Finanzas: cuentas, saldos y resumen del mes.
//
// Solo el dueño (negocios.adminUid == uid del token), con la capacidad
// 'analiticas' del plan y, si el negocio usa PIN, la sesión financiera.
// El negocio sale del token, nunca del body. Rutas nuevas: no cambian nada
// de /api/finance ni de /api/cash.

import { Router } from 'express';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { requireSession } from '../middlewares/session.middleware.js';
import { requireAuth, requireFinanceSession } from '../middlewares/financeAuth.middleware.js';
import { requireCapability } from '../services/capabilities/capabilityService.js';
import { logger } from '../utils/logger.js';
import {
  FinanzasError, getEstado, setupFinanzas, createAccount, updateAccount, createTransfer, getResumen,
} from '../services/finanzas/finanzasService.js';

const router = Router();
const owner = [identifyRequester, requireSession, requireAuth, requireCapability('analiticas'), requireFinanceSession];

function handle(fn) {
  return async (req, res) => {
    try {
      res.status(200).json(await fn(req));
    } catch (err) {
      if (err instanceof FinanzasError) return res.status(err.status).json({ error: err.message, code: err.code });
      logger.error('[finanzas]', req.method, req.path, err.message);
      res.status(500).json({ error: 'Error interno.' });
    }
  };
}

const body = (req) => req.body || {};

router.get('/finanzas/estado', ...owner, handle((req) => getEstado(req.negocioId)));

router.post('/finanzas/setup', ...owner, handle((req) => setupFinanzas(req.negocioId, {
  newAccounts: body(req).newAccounts, map: body(req).map, requestId: body(req).requestId, actor: req.actor,
})));

router.post('/finanzas/cuentas', ...owner, handle((req) => createAccount(req.negocioId, {
  name: body(req).name, type: body(req).type, balance: body(req).balance, methods: body(req).methods,
  requestId: body(req).requestId, actor: req.actor,
})));

router.patch('/finanzas/cuentas/:accountId', ...owner, handle((req) => updateAccount(req.negocioId, req.params.accountId, {
  name: body(req).name, type: body(req).type, active: body(req).active, methods: body(req).methods,
  balance: body(req).balance, requestId: body(req).requestId, actor: req.actor,
})));

router.post('/finanzas/transferencias', ...owner, handle((req) => createTransfer(req.negocioId, {
  fromAccountId: body(req).fromAccountId, toAccountId: body(req).toAccountId, amount: body(req).amount,
  note: body(req).note, requestId: body(req).requestId, actor: req.actor,
})));

router.get('/finanzas/resumen', ...owner, handle((req) => getResumen(req.negocioId, { month: req.query.month })));

export default router;
