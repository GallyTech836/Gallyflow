import { Router } from 'express';
import { db } from '../config/firebase.js';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { requireSession } from '../middlewares/session.middleware.js';
import { createSession, revokeAllSessions } from '../services/session/sessionService.js';
import { staffLoginIpRateLimit, staffLoginUserRateLimit, staffAdminRateLimit } from '../middlewares/rateLimit.middleware.js';
import { logger } from '../utils/logger.js';
import {
  verifyStaffLogin, issueStaffToken, setStaffPassword, isUsernameAvailable, suggestUsername,
} from '../services/staff/staffCredentials.js';

const router = Router();
const texto = (v) => (typeof v === 'string' ? v : '');

// POST /api/auth/staff/login  { username, password }
// Público. Nunca devuelve ni registra la contraseña.
router.post('/auth/staff/login', staffLoginIpRateLimit, staffLoginUserRateLimit, async (req, res) => {
  const username = texto(req.body?.username).trim();
  const password = texto(req.body?.password);
  if (!username || !password || username.length > 80 || password.length > 200) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  try {
    const result = await verifyStaffLogin(username, password);
    if (!result) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    const negocioId = result.data.negocioId;
    if (!negocioId) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    // Límite de 2 sesiones: si ya hay 2, el profesional elige cuál cerrar
    // y vuelve a llamar con replaceSid.
    const replaceSid = texto(req.body?.replaceSid) || null;
    const ses = await createSession({
      uid: result.uid, rol: 'barber', negocioId, userAgent: req.get('user-agent'), replaceSid, exempt: false,
    });
    if (ses.limit) {
      return res.status(409).json({ code: 'SESSION_LIMIT', error: 'Ya tienes 2 sesiones abiertas.', sessions: ses.sessions });
    }
    const token = await issueStaffToken(result.uid, negocioId, ses.sid);
    return res.status(200).json({ token, sid: ses.sid, user: { id: result.uid, ...result.data } });
  } catch (err) {
    logger.error('[staff] login:', err.message);
    return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
});

// --- Rutas del administrador del negocio ---
async function requireNegocioAdmin(req, res, next) {
  if (!req.actor?.verified || req.actor.rol !== 'admin') return res.status(401).json({ error: 'No autenticado.' });
  try {
    const snap = await db.collection('negocios').where('adminUid', '==', req.actor.uid).limit(2).get();
    if (snap.size !== 1) return res.status(403).json({ error: 'No autorizado.' });
    req.negocioId = snap.docs[0].id;
    next();
  } catch (err) {
    logger.error('[staff] requireNegocioAdmin:', err.message);
    res.status(500).json({ error: 'Error interno.' });
  }
}

// GET /api/staff/username-available?username=juan.perez&exclude=<id>
router.get('/staff/username-available', identifyRequester, requireSession, requireNegocioAdmin, staffAdminRateLimit, async (req, res) => {
  const username = texto(req.query.username).trim();
  const exclude = texto(req.query.exclude);
  if (!username || username.length > 80) return res.status(400).json({ error: 'Usuario inválido.' });
  try {
    const available = await isUsernameAvailable(username, exclude);
    const suggestion = available ? username : await suggestUsername(username, exclude);
    return res.status(200).json({ available, suggestion });
  } catch (err) {
    logger.error('[staff] username-available:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
});

// POST /api/staff/:profesionalId/password  { password }
// El admin asigna una contraseña nueva. Nunca se puede leer la actual.
router.post('/staff/:profesionalId/password', identifyRequester, requireSession, requireNegocioAdmin, staffAdminRateLimit, async (req, res) => {
  const { profesionalId } = req.params;
  const password = texto(req.body?.password);
  if (password.length < 4 || password.length > 100) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 4 y 100 caracteres.' });
  }
  try {
    const [proSnap, userSnap] = await Promise.all([
      db.collection('negocios').doc(req.negocioId).collection('profesionales').doc(profesionalId).get(),
      db.collection('usuarios').doc(profesionalId).get(),
    ]);
    const u = userSnap.exists ? userSnap.data() : null;
    if (!proSnap.exists || !u || u.rol !== 'barber' || u.negocioId !== req.negocioId) {
      return res.status(404).json({ error: 'Profesional no encontrado.' });
    }
    await setStaffPassword(profesionalId, password, 'admin');
    // Contraseña nueva: se cierran las sesiones abiertas de ese profesional.
    await revokeAllSessions(profesionalId, 'password-reset');
    logger.info('[staff] Contraseña asignada por el admin (negocio=' + req.negocioId + ')');
    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('[staff] set password:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
});

// POST /api/staff/:profesionalId/revoke-sessions
// El admin cierra todas las sesiones de un profesional (ej. antes de eliminarlo).
router.post('/staff/:profesionalId/revoke-sessions', identifyRequester, requireSession, requireNegocioAdmin, staffAdminRateLimit, async (req, res) => {
  const { profesionalId } = req.params;
  try {
    const userSnap = await db.collection('usuarios').doc(profesionalId).get();
    const u = userSnap.exists ? userSnap.data() : null;
    if (!u || u.rol !== 'barber' || u.negocioId !== req.negocioId) {
      return res.status(404).json({ error: 'Profesional no encontrado.' });
    }
    const cerradas = await revokeAllSessions(profesionalId, 'admin');
    return res.status(200).json({ ok: true, cerradas });
  } catch (err) {
    logger.error('[staff] revoke-sessions:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
});

export default router;
