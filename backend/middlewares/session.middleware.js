// Exige una sesión del servidor válida (después de identifyRequester).
// La sesión viaja en el header x-session-id (o en el claim sid del token).

import { validateSession } from '../services/session/sessionService.js';
import { logger } from '../utils/logger.js';

export async function requireSession(req, res, next) {
  if (!req.actor?.verified) return res.status(401).json({ error: 'No autenticado.', code: 'NOT_AUTHENTICATED' });
  const sid = req.get('x-session-id') || req.actor.sid;
  try {
    const r = await validateSession(sid, req.actor.uid);
    if (!r.ok) {
      return res.status(401).json({ error: 'Tu sesión se cerró. Inicia sesión de nuevo.', code: r.code });
    }
    req.session = r.session;
    next();
  } catch (err) {
    // Error al leer la sesión (ej. Firestore no responde): no es una sesión
    // cerrada. 503 para que el front reintente.
    logger.error('[session] requireSession:', err.message);
    res.status(503).json({ error: 'No se pudo validar tu sesión. Intenta de nuevo.', code: 'SESSION_UNAVAILABLE' });
  }
}
