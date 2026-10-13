// Exige una sesión del servidor válida (después de identifyRequester).
// La sesión viaja en el header x-session-id (o en el claim sid del token).

import { validateSession } from '../services/session/sessionService.js';
import { logger } from '../utils/logger.js';

export async function requireSession(req, res, next) {
  if (!req.actor?.verified) return res.status(401).json({ error: 'No autenticado.' });
  const sid = req.get('x-session-id') || req.actor.sid;
  try {
    const r = await validateSession(sid, req.actor.uid);
    if (!r.ok) {
      return res.status(401).json({ error: 'Tu sesión se cerró. Inicia sesión de nuevo.', code: r.code });
    }
    req.session = r.session;
    next();
  } catch (err) {
    logger.error('[session] requireSession:', err.message);
    res.status(500).json({ error: 'Error interno.' });
  }
}
