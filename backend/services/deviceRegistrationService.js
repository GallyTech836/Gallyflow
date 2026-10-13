// services/deviceRegistrationService.js
//
// Responsabilidad única: guardar el oneSignalId de un usuario (admin o
// barber) en Firestore, en usuarios/{uid}.

import { db } from '../config/firebase.js';
import { logger } from '../utils/logger.js';

/**
 * @param {object} params
 * @param {string} params.uid
 * @param {'admin'|'barber'} params.rol
 * @param {string} params.negocioId
 * @param {string} params.oneSignalId
 */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Admin: exige token de Firebase del propio admin y que sea el adminUid del negocio.
// Barber: solo actualiza el oneSignalId de un barber que ya existe en ese negocio;
// nunca cambia rol ni negocioId.
export async function registerDevice({ uid, rol, negocioId, oneSignalId, actor }) {
  if (typeof uid !== 'string' || typeof negocioId !== 'string' || typeof oneSignalId !== 'string' || oneSignalId.length > 100) {
    throw httpError(400, 'Datos inválidos.');
  }
  const ref = db.collection('usuarios').doc(uid);

  if (rol === 'admin') {
    if (!actor?.verified || actor.uid !== uid) throw httpError(401, 'No autenticado.');
    const negocio = await db.collection('negocios').doc(negocioId).get();
    if (!negocio.exists || negocio.data().adminUid !== uid) throw httpError(403, 'No autorizado.');
    await ref.set({ rol: 'admin', negocioId, oneSignalId }, { merge: true });
  } else if (rol === 'barber') {
    const snap = await ref.get();
    const u = snap.exists ? snap.data() : null;
    if (!u || u.rol !== 'barber' || u.negocioId !== negocioId) throw httpError(403, 'No autorizado.');
    await ref.update({ oneSignalId });
  } else {
    throw httpError(400, 'Rol inválido.');
  }

  logger.info('[deviceRegistrationService] Dispositivo registrado (' + rol + ', negocio=' + negocioId + ')');
  return { registered: true };
}