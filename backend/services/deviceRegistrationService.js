import { db } from '../config/firebase.js';

export async function registerDevice({ uid, rol, negocioId, oneSignalId }) {
  // TODO (Fase 2): db.collection('usuarios').doc(uid).set({ rol, negocioId, oneSignalId }, { merge: true });
  throw new Error('[deviceRegistrationService] Registro de dispositivo no implementado todavía (Fase 2).');
}