// cash.routes.js — Caja y cierre diario.
//
// Todas las rutas exigen el ADMINISTRADOR del negocio (Firebase Auth, rol
// admin, negocios.adminUid == uid). Un profesional (token con rol 'barber')
// recibe 401 en todas, salvo POST /staff/commission-payments, donde registra
// el cobro de SUS comisiones. El negocio sale del token, nunca del body.
// Corregir una caja cerrada pide además el PIN de Analítica, validado aquí.

import { Router } from 'express';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { requireSession } from '../middlewares/session.middleware.js';
import { requireNegocioAdmin } from '../middlewares/negocioAdmin.middleware.js';
import { requireStaffMember } from '../middlewares/staffMember.middleware.js';
import { financePinRateLimit } from '../middlewares/rateLimit.middleware.js';
import { requireCapability } from '../services/capabilities/capabilityService.js';
import { logger } from '../utils/logger.js';
import {
  CashError, getCurrentCash, listCashSessions, getCashSession, openCash, addCashOut, closeCash,
  correctCashSession, registerCommissionPayment,
} from '../services/cash/cashService.js';

const router = Router();
const admin = [identifyRequester, requireSession, requireNegocioAdmin];

function handle(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req);
      res.status(200).json(data);
    } catch (err) {
      if (err instanceof CashError) return res.status(err.status).json({ error: err.message, code: err.code });
      logger.error('[cash]', req.method, req.path, err.message);
      res.status(500).json({ error: 'Error interno.' });
    }
  };
}

const scopeOf = (src) => ({ branchId: src?.branchId || null, branchName: src?.branchName || null });

router.get('/cash/current', ...admin, handle((req) => getCurrentCash(req.negocioId, scopeOf(req.query))));

router.get('/cash/sessions', ...admin, handle((req) => listCashSessions(req.negocioId, { ...scopeOf(req.query), limit: Math.min(Number(req.query.limit) || 30, 60) })));

router.get('/cash/sessions/:sessionId', ...admin, handle((req) => getCashSession(req.negocioId, req.params.sessionId)));

router.post('/cash/open', ...admin, handle((req) => openCash(req.negocioId, { ...scopeOf(req.body), openingFund: req.body?.openingFund, actor: req.actor })));

router.post('/cash/cash-out', ...admin, handle((req) => addCashOut(req.negocioId, { ...scopeOf(req.body), amount: req.body?.amount, reason: req.body?.reason, actor: req.actor })));

router.post('/cash/close', ...admin, handle((req) => closeCash(req.negocioId, {
  ...scopeOf(req.body),
  sessionId: req.body?.sessionId,
  countedCash: req.body?.countedCash,
  envelopeAmount: req.body?.envelopeAmount,
  nextFund: req.body?.nextFund,
  note: req.body?.note,
  actor: req.actor,
})));

router.post('/cash/sessions/:sessionId/correct', ...admin, financePinRateLimit, handle((req) => correctCashSession(req.negocioId, req.params.sessionId, {
  pin: req.body?.pin,
  reason: req.body?.reason,
  changes: req.body?.changes || {},
  actor: req.actor,
})));

router.post('/cash/commission-payments', ...admin, requireCapability('comisiones', 'analiticas'), handle((req) => registerCommissionPayment(req.negocioId, {
  barberId: req.body?.barberId,
  startDate: req.body?.startDate,
  endDate: req.body?.endDate,
  method: req.body?.method,
  branchId: req.body?.branchId || null,
  actor: req.actor,
})));

// El profesional registra que le pagaron sus comisiones del periodo (incluye
// los servicios registrados). Mismo cálculo y misma transacción que el pago
// del admin: en efectivo sale de la caja de su sucursal. Solo las suyas
// (barberId = su uid) y solo si tiene el permiso "Ver comisiones".
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function requireCommissionsPermission(req, res, next) {
  if (req.professional?.permissions?.viewCommissions === false) {
    return res.status(403).json({ error: 'No tienes permiso para ver comisiones.', code: 'NO_PERMISSION' });
  }
  next();
}
router.post('/staff/commission-payments', identifyRequester, requireSession, requireStaffMember, requireCommissionsPermission, requireCapability('comisiones'), handle((req) => {
  const { startDate, endDate } = req.body || {};
  if (!ISO_DATE.test(String(startDate || '')) || !ISO_DATE.test(String(endDate || '')) || startDate > endDate) {
    throw new CashError(400, 'Periodo no válido.', 'RANGE_INVALID');
  }
  return registerCommissionPayment(req.negocioId, {
    barberId: req.actor.uid,
    startDate,
    endDate,
    method: req.body?.method,
    branchId: null,
    actor: req.actor,
  });
}));

export default router;
