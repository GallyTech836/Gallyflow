// financeAuth.middleware.js
//
// Autenticación compartida de /api/finance y /api/finanzas:
//   requireAuth            el negocio sale de negocios.adminUid == uid del token
//                          (nunca del correo ni del body). Solo el dueño.
//   requireFinanceSession  si el negocio protege Analítica con PIN, exige la
//                          sesión financiera (x-finance-session) que da verify-pin.

import { db } from '../config/firebase.js';
import { logger } from '../utils/logger.js';
import { verifySessionToken } from '../services/finance/financeSession.js';

export async function requireAuth(req, res, next) {
  if (!req.actor?.verified) return res.status(401).json({ error: 'No autenticado.' });
  try {
    const snap = await db.collection('negocios').where('adminUid', '==', req.actor.uid).limit(2).get();
    if (snap.size !== 1) {
      logger.warn('[finance] uid sin negocio único:', req.actor.uid, snap.size);
      return res.status(403).json({ error: 'No autorizado.' });
    }
    req.negocioId = snap.docs[0].id;
    next();
  } catch (err) {
    logger.error('[finance] requireAuth:', err.message);
    res.status(500).json({ error: 'Error interno.' });
  }
}

export async function requireFinanceSession(req, res, next) {
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
    logger.error('[finance]', err.message); res.status(500).json({ error: 'Error interno.' });
  }
}
