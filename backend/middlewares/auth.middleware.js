// DECISIÓN DE ARQUITECTURA: sin JWT propio para BarberApp todavía.
// AdminApp (tiene Firebase Auth) se verifica de verdad; BarberApp/ClienteApp
// pasan sin verificar por ahora (limitación aceptada, ver README).

import { getAuth } from 'firebase-admin/auth';
import { logger } from '../utils/logger.js';

// Errores de firebase-admin que no dicen nada del token (red, claves de
// Google, errores internos). Los demás `auth/...` son token inválido.
export function isTransientAuthError(err) {
  const code = String(err?.code || '');
  return !code.startsWith('auth/') || code === 'auth/internal-error';
}

export async function identifyRequester(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme === 'Bearer' && token) {
    try {
      const decoded = await getAuth().verifyIdToken(token);
            // Profesionales: token con claim rol 'barber'. Todo lo demás es admin.
            const rol = decoded.rol === 'barber' ? 'barber' : 'admin';
            req.actor = { uid: decoded.uid, email: decoded.email, rol, negocioId: decoded.negocioId || null, sid: decoded.sid || null, verified: true };
      return next();
    } catch (err) {
      // Error temporal al verificar (ej. no se pudieron bajar las claves de
      // Google): 503, para que el front reintente y no cierre la sesión.
      if (isTransientAuthError(err)) {
        logger.error('[auth] No se pudo verificar el token (temporal):', err.code || '', err.message);
        return res.status(503).json({ error: 'No se pudo verificar tu sesión. Intenta de nuevo.', code: 'AUTH_UNAVAILABLE' });
      }
      logger.warn('[auth] Token de Firebase inválido:', err.message);
      return res.status(401).json({ error: 'Token inválido o expirado.', code: 'TOKEN_INVALID' });
    }
  }

  req.actor = { verified: false };
  next();
}