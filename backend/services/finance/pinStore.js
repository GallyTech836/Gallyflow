// pinStore.js
//
// Dónde vive el hash del PIN de Analítica/Finanzas.
// Antes: negocios/{id}.financePinHash. Ese documento lo lee el link público
// (logo, horario...), así que cualquiera podía bajar el hash y probar los
// 10.000 PIN de 4 dígitos en su computadora. Ahora: negocioSecrets/{id},
// colección que solo lee el backend (las reglas la cierran).
// Migración perezosa: si el hash todavía está en el negocio, se mueve la
// primera vez que se lee.

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';

const secretRef = (negocioId) => db.collection('negocioSecrets').doc(negocioId);
const negocioRef = (negocioId) => db.collection('negocios').doc(negocioId);

export async function getPinHash(negocioId) {
  const sec = await secretRef(negocioId).get();
  const nuevo = sec.exists ? sec.data()?.financePinHash : null;
  if (nuevo) return nuevo;

  const neg = await negocioRef(negocioId).get();
  const viejo = neg.exists ? neg.data()?.financePinHash : null;
  if (!viejo) return null;
  try {
    await secretRef(negocioId).set({ financePinHash: viejo, updatedAt: new Date().toISOString() }, { merge: true });
    await negocioRef(negocioId).update({ financePinHash: FieldValue.delete() });
    logger.info(`[pinStore] PIN movido a negocioSecrets (negocio=${negocioId}).`);
  } catch (err) {
    logger.warn('[pinStore] No se pudo mover el PIN:', err.message);
  }
  return viejo;
}

/** hash = null borra el PIN. También limpia el campo viejo del negocio. */
export async function setPinHash(negocioId, hash) {
  await secretRef(negocioId).set(
    { financePinHash: hash || FieldValue.delete(), updatedAt: new Date().toISOString() },
    { merge: true },
  );
  const neg = await negocioRef(negocioId).get();
  if (neg.exists && neg.data()?.financePinHash !== undefined) {
    await negocioRef(negocioId).update({ financePinHash: FieldValue.delete() });
  }
}
