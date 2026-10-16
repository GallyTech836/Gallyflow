// negocioAdmin.middleware.js
//
// Exige que quien llama sea el administrador de UN negocio (negocios.adminUid
// == uid del token). Va después de identifyRequester + requireSession.
// Deja el id del negocio en req.negocioId: nunca se toma del body ni de la URL.

import { db } from '../config/firebase.js';
import { logger } from '../utils/logger.js';

export async function requireNegocioAdmin(req, res, next) {
  if (!req.actor?.verified || req.actor.rol !== 'admin') {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  try {
    const snap = await db.collection('negocios').where('adminUid', '==', req.actor.uid).limit(2).get();
    if (snap.size !== 1) return res.status(403).json({ error: 'No autorizado.' });
    req.negocioId = snap.docs[0].id;
    req.negocio = snap.docs[0].data();
    next();
  } catch (err) {
    logger.error('[negocioAdmin] requireNegocioAdmin:', err.message);
    res.status(500).json({ error: 'Error interno.' });
  }
}
