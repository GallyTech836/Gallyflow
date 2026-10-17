// quotaService.js
//
// Altas con cupo (profesionales y sucursales) validadas en el SERVIDOR.
// El límite sale de las capacidades resueltas del negocio (plan +
// complementos + excepción + tipo), leídas sin caché para que un cambio de
// plan se aplique al instante.
//
// Regla de bajada de plan: si el negocio ya tiene MÁS de lo permitido, no se
// borra nada; solo se rechazan las altas nuevas hasta que vuelva a cumplir
// el límite (eliminando) o amplíe su capacidad (plan / complemento / excepción).
//
// El conteo y la escritura van en la misma transacción para que dos altas
// simultáneas no puedan pasar el límite.

import { db } from '../../config/firebase.js';
import { getNegocioAccess, DENY_MESSAGES } from './capabilityService.js';
import { getLimit } from './capabilityModel.js';

export const QUOTA_COLLECTIONS = {
  profesionales: 'profesionales',
  sucursales: 'sucursales',
};

export class QuotaError extends Error {
  constructor(code, status, extra = {}) {
    super(extra.message || DENY_MESSAGES[code] || code);
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

/** Estado del cupo: { key, limit, used, remaining, exceeded, over } */
export function quotaState(key, limit, used) {
  const u = Number(used) || 0;
  if (limit === null || limit === undefined) {
    return { key, limit: null, used: u, remaining: null, exceeded: false, over: 0 };
  }
  return { key, limit, used: u, remaining: Math.max(0, limit - u), exceeded: u >= limit, over: Math.max(0, u - limit) };
}

/** Acceso fresco + validaciones comunes (existe, no bloqueado). */
async function accessFor(negocioId) {
  const access = await getNegocioAccess(negocioId, { fresh: true });
  if (!access.exists) throw new QuotaError('negocio_no_encontrado', 404);
  if (access.isBlocked) throw new QuotaError('negocio_bloqueado', 403);
  return access;
}

/** Cupos actuales del negocio (para mostrar en el panel). */
export async function getQuotas(negocioId) {
  const access = await accessFor(negocioId);
  const negocioRef = db.collection('negocios').doc(negocioId);
  const out = {};
  for (const [key, col] of Object.entries(QUOTA_COLLECTIONS)) {
    const snap = await negocioRef.collection(col).get();
    out[key] = quotaState(key, getLimit(access.capabilities, key), snap.size);
  }
  return { planId: access.planId, planName: access.planName, quotas: out };
}

/**
 * Crea un documento en una colección con cupo, dentro de una transacción.
 * @param {string} negocioId
 * @param {'profesionales'|'sucursales'} key
 * @param {(tx, ctx) => Promise<{ ref, data, extraWrites? }>} build
 *   Arma lo que se va a escribir. Puede hacer lecturas con `tx` (van antes
 *   de cualquier escritura).
 */
export async function createWithinQuota(negocioId, key, build) {
  const access = await accessFor(negocioId);
  const limit = getLimit(access.capabilities, key);
  const negocioRef = db.collection('negocios').doc(negocioId);
  const colRef = negocioRef.collection(QUOTA_COLLECTIONS[key]);

  return db.runTransaction(async (tx) => {
    const current = await tx.get(colRef);
    const state = quotaState(key, limit, current.size);
    if (state.exceeded) {
      throw new QuotaError('cupo_alcanzado', 403, {
        message: `Tu plan permite hasta ${limit} ${key}${state.over > 0 ? ` y ya tienes ${state.used}` : ''}. Elimina alguno o amplía tu plan.`,
        quota: state,
      });
    }
    const { ref, data, extraWrites = [] } = await build(tx, { colRef, negocioRef });
    tx.set(ref, data);
    for (const w of extraWrites) tx.set(w.ref, w.data);
    return { id: ref.id, quota: quotaState(key, limit, current.size + 1) };
  });
}
