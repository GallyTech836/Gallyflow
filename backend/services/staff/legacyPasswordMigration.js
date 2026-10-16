// legacyPasswordMigration.js
//
// Quita las contraseñas antiguas en texto plano de usuarios/{uid}.password.
// Se ejecuta UNA vez al arrancar el servidor, solo si en Railway existe la
// variable MIGRATE_LEGACY_PASSWORDS:
//   MIGRATE_LEGACY_PASSWORDS=dry    -> solo cuenta y muestra en los logs qué haría
//   MIGRATE_LEGACY_PASSWORDS=apply  -> lo hace
// Después de usarla, BORRA la variable en Railway.
//
// Por cada profesional (rol 'barber') con el campo `password`:
//   - si ya tiene hash en staffCredentials -> solo se borra el texto plano;
//   - si no tiene hash -> primero se crea el hash con esa contraseña (sigue
//     entrando igual) y después se borra el texto plano.
// Nunca se escribe una contraseña en los logs.

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { setStaffPassword } from './staffCredentials.js';

export async function runLegacyPasswordMigration({ apply = false } = {}) {
  const resumen = { revisados: 0, soloBorrar: 0, hashYBorrar: 0, vacias: 0, errores: 0, aplicado: apply };
  const snap = await db.collection('usuarios').where('rol', '==', 'barber').get();

  for (const d of snap.docs) {
    const data = d.data() || {};
    if (!Object.prototype.hasOwnProperty.call(data, 'password')) continue;
    resumen.revisados += 1;
    try {
      const cred = await db.collection('staffCredentials').doc(d.id).get();
      const tieneHash = cred.exists && !!cred.data()?.passwordHash;
      const antigua = typeof data.password === 'string' ? data.password : '';

      if (tieneHash) resumen.soloBorrar += 1;
      else if (antigua) resumen.hashYBorrar += 1;
      else resumen.vacias += 1;

      if (!apply) continue;
      if (!tieneHash && antigua) await setStaffPassword(d.id, antigua, 'legacy-migration');
      await d.ref.update({ password: FieldValue.delete() });
    } catch (err) {
      resumen.errores += 1;
      logger.error(`[legacyPasswords] Error con el usuario ${d.id}:`, err.message);
    }
  }
  return resumen;
}

/** Lee la variable de entorno y corre la migración si corresponde. Nunca lanza. */
export async function maybeRunLegacyPasswordMigration(env = process.env) {
  const modo = String(env.MIGRATE_LEGACY_PASSWORDS || '').trim().toLowerCase();
  if (modo !== 'dry' && modo !== 'apply') return null;
  try {
    const r = await runLegacyPasswordMigration({ apply: modo === 'apply' });
    logger.info(`[legacyPasswords] ${modo === 'apply' ? 'APLICADO' : 'SIMULACIÓN (no se cambió nada)'}: ` +
      `${r.revisados} con contraseña antigua · ${r.soloBorrar} ya tenían hash (se borra el texto) · ` +
      `${r.hashYBorrar} sin hash (se crea hash y se borra el texto) · ${r.vacias} vacías · ${r.errores} errores. ` +
      'Recuerda borrar MIGRATE_LEGACY_PASSWORDS en Railway.');
    return r;
  } catch (err) {
    logger.error('[legacyPasswords] Falló la migración:', err.message);
    return null;
  }
}
