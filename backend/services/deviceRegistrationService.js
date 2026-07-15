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
export async function registerDevice({ uid, rol, negocioId, oneSignalId }) {
  await db.collection('usuarios').doc(uid).set(
    { rol, negocioId, oneSignalId },
    { merge: true }
  );

  logger.info(`[deviceRegistrationService] Dispositivo registrado para uid=${uid} (${rol}, negocio=${negocioId})`);

  return { uid, rol, negocioId, registered: true };
}