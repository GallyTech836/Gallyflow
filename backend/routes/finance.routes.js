import { Router } from 'express';
import { db } from '../config/firebase.js';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { hashPin, verifyPin } from '../services/finance/pin.js';
import { createSessionToken, verifySessionToken } from '../services/finance/financeSession.js';
import { requireCapability } from '../services/capabilities/capabilityService.js';
import { getFinanceSummary, getFinanceOverview, getComisionesPorProfesional, getDetalleComisionesBarbero, registrarPagoComision } from '../services/finance/financeData.js';

const router = Router();

function getNegocioSlug(email) {
  if (!email) return null;
  return email.split('@')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function requireAuth(req, res, next) {
  if (!req.actor?.verified) return res.status(401).json({ error: 'No autenticado.' });
  req.negocioId = getNegocioSlug(req.actor.email);
  next();
}

async function requireFinanceSession(req, res, next) {
  try {
    const negocioSnap = await db.collection('negocios').doc(req.negocioId).get();
    const analyticsPinEnabled = negocioSnap.data()?.analyticsPinEnabled === true;
    if (!analyticsPinEnabled) return next();

    const token = req.headers['x-finance-session'];
    if (!verifySessionToken(token, req.negocioId)) {
      return res.status(401).json({ error: 'Sesión financiera inválida o expirada. Ingresa el PIN de nuevo.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.use(identifyRequester);

// Capacidades (validadas en servidor): la sección Analítica usa también
// el detalle/pago de comisiones, por eso esas rutas aceptan cualquiera de
// las dos capacidades.
const requireAnaliticas = requireCapability('analiticas');
const requireComisiones = requireCapability('comisiones', 'analiticas');

router.post('/finance/set-pin', requireAuth, requireAnaliticas, async (req, res) => {
  const { pin } = req.body || {};
  if (!pin || String(pin).length < 4) {
    return res.status(400).json({ error: 'El PIN debe tener al menos 4 dígitos.' });
  }
  const financePinHash = await hashPin(pin);
  await db.collection('negocios').doc(req.negocioId).update({ financePinHash });
  return res.status(200).json({ ok: true });
});

router.post('/finance/verify-pin', requireAuth, requireAnaliticas, async (req, res) => {
  const { pin } = req.body || {};
  const negocioSnap = await db.collection('negocios').doc(req.negocioId).get();
  const financePinHash = negocioSnap.data()?.financePinHash;
  if (!financePinHash) return res.status(409).json({ error: 'Todavía no configuraste un PIN financiero.' });
  const valido = await verifyPin(pin, financePinHash);
  if (!valido) return res.status(401).json({ error: 'PIN incorrecto.' });
  const sessionToken = createSessionToken(req.negocioId);
  return res.status(200).json({ sessionToken, expiresInMinutes: 15 });
});

router.get('/finance/summary', requireAuth, requireAnaliticas, requireFinanceSession, async (req, res) => {
  try {
    const { startDate, endDate, branch } = req.query;
    const data = await getFinanceSummary(req.negocioId, { startDate, endDate, branch });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/finance/overview', requireAuth, requireAnaliticas, requireFinanceSession, async (req, res) => {
  try {
    const { startDate, endDate, branch } = req.query;
    const data = await getFinanceOverview(req.negocioId, { startDate, endDate, branch });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/finance/commissions', requireAuth, requireComisiones, requireFinanceSession, async (req, res) => {
  try {
    const { startDate, endDate, branch } = req.query;
    const data = await getComisionesPorProfesional(req.negocioId, { startDate, endDate, branch });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/finance/commissions/:barberId', requireAuth, requireComisiones, requireFinanceSession, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const data = await getDetalleComisionesBarbero(req.negocioId, req.params.barberId, { startDate, endDate });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/finance/commissions/:barberId/pay', requireAuth, requireComisiones, requireFinanceSession, async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};
    const data = await registrarPagoComision(req.negocioId, req.params.barberId, { startDate, endDate });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;