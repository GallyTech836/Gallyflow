import { Router } from 'express';
import { db } from '../config/firebase.js';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { requireSession } from '../middlewares/session.middleware.js';
import { sessionRateLimit } from '../middlewares/rateLimit.middleware.js';
import { logger } from '../utils/logger.js';
import {
  createSession, listSessions, revokeSession, isExemptFromLimit, IDLE_DAYS, MAX_SESSIONS,
} from '../services/session/sessionService.js';

const router = Router();

// POST /api/auth/session/start  { replaceSid? }
// Admin: después de entrar con correo y contraseña, abre su sesión del servidor.
// (Los profesionales la abren en /auth/staff/login.)
router.post('/auth/session/start', sessionRateLimit, identifyRequester, async (req, res) => {
  if (!req.actor?.verified || req.actor.rol !== 'admin') return res.status(401).json({ error: 'No autenticado.' });
  try {
    const neg = await db.collection('negocios').where('adminUid', '==', req.actor.uid).limit(1).get();
    const replaceSid = typeof req.body?.replaceSid === 'string' ? req.body.replaceSid : null;
    const r = await createSession({
      uid: req.actor.uid,
      rol: 'admin',
      negocioId: neg.empty ? null : neg.docs[0].id,
      userAgent: req.get('user-agent'),
      replaceSid,
      exempt: isExemptFromLimit(req.actor),
    });
    if (r.limit) {
      return res.status(409).json({ code: 'SESSION_LIMIT', error: 'Ya tienes ' + MAX_SESSIONS + ' sesiones abiertas.', sessions: r.sessions });
    }
    return res.status(201).json({ sid: r.sid });
  } catch (err) {
    logger.error('[session] start:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
});

// POST /api/auth/session/check  -> 200 si la sesión sigue activa, 401 si no.
router.post('/auth/session/check', sessionRateLimit, identifyRequester, requireSession, (req, res) => {
  res.status(200).json({ ok: true });
});

// GET /api/auth/sessions  -> sesiones activas del propio usuario.
router.get('/auth/sessions', sessionRateLimit, identifyRequester, requireSession, async (req, res) => {
  try {
    const sessions = await listSessions(req.actor.uid);
    return res.status(200).json({
      idleDays: IDLE_DAYS,
      maxSessions: MAX_SESSIONS,
      sessions: sessions.map((s) => ({ ...s, current: s.id === req.session.id })),
    });
  } catch (err) {
    logger.error('[session] list:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
});

// POST /api/auth/sessions/:sid/revoke  -> cierra una sesión propia.
router.post('/auth/sessions/:sid/revoke', sessionRateLimit, identifyRequester, requireSession, async (req, res) => {
  try {
    const ok = await revokeSession(req.params.sid, req.actor.uid, 'user');
    if (!ok) return res.status(404).json({ error: 'Sesión no encontrada.' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('[session] revoke:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
});

// POST /api/auth/session/end  -> cerrar sesión en este dispositivo.
router.post('/auth/session/end', sessionRateLimit, identifyRequester, async (req, res) => {
  const sid = req.get('x-session-id');
  if (req.actor?.verified && sid) {
    await revokeSession(sid, req.actor.uid, 'logout').catch(() => {});
  }
  res.status(200).json({ ok: true });
});

export default router;
