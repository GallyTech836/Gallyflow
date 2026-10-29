// staffMember.middleware.js — Profesional activo del negocio (token con rol
// 'barber'). Va después de identifyRequester y requireSession.
//
// El negocio sale del claim negocioId del token y se comprueba en
// usuarios/{uid} y en negocios/{id}/profesionales/{uid}: así un profesional
// desactivado o de otro negocio no entra. Nunca se toma del body.
// Deja req.negocioId y req.professional ({ id, ...datos }).

import { db } from '../config/firebase.js';
import { logger } from '../utils/logger.js';

export async function requireStaffMember(req, res, next) {
  if (!req.actor?.verified) return res.status(401).json({ error: 'No autenticado.' });
  if (req.actor.rol !== 'barber') return res.status(403).json({ error: 'Solo para profesionales.' });
  const negocioId = req.actor.negocioId;
  if (!negocioId) return res.status(403).json({ error: 'No autorizado.' });
  try {
    const [userSnap, proSnap] = await Promise.all([
      db.collection('usuarios').doc(req.actor.uid).get(),
      db.collection('negocios').doc(negocioId).collection('profesionales').doc(req.actor.uid).get(),
    ]);
    const u = userSnap.exists ? userSnap.data() : null;
    if (!u || u.rol !== 'barber' || u.negocioId !== negocioId || !proSnap.exists || proSnap.data()?.active === false) {
      return res.status(403).json({ error: 'No autorizado.' });
    }
    req.negocioId = negocioId;
    req.professional = { id: proSnap.id, ...proSnap.data() };
    next();
  } catch (err) {
    logger.error('[staff] requireStaffMember:', err.message);
    res.status(500).json({ error: 'Error interno.' });
  }
}
