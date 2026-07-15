// DECISIÓN DE ARQUITECTURA: sin JWT propio para BarberApp todavía.
// AdminApp (tiene Firebase Auth) se verifica de verdad; BarberApp/ClienteApp
// pasan sin verificar por ahora (limitación aceptada, ver README).

import { getAuth } from 'firebase-admin/auth';
import { logger } from '../utils/logger.js';

export async function identifyRequester(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme === 'Bearer' && token) {
    try {
      const decoded = await getAuth().verifyIdToken(token);
      req.actor = { uid: decoded.uid, rol: 'admin', verified: true };
      return next();
    } catch (err) {
      logger.warn('[auth] Token de Firebase inválido:', err.message);
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
  }

  req.actor = { verified: false };
  next();
}