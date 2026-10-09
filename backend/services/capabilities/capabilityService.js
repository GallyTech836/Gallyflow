// capabilityService.js
//
// Validación REAL (servidor) de capacidades y límites de un negocio.
// El front solo oculta botones; aquí es donde se decide si se permite.
//
//   getNegocioAccess(id)      -> estado efectivo + capacidades resueltas
//   checkCapability(id, key)  -> { allowed, reason, ... } (incluye límite mensual)
//   requireCapability(...k)   -> middleware Express (usa req.negocioId)
//   incrementUsage(id, key)   -> suma consumo en negocios/{id}/uso/{AAAA-MM}
//
// Caché de 60 s por negocio: un cambio hecho desde Super Admin tarda como
// máximo eso en aplicarse aquí (GET /api/superadmin/negocios/:id/access lo
// refresca al instante).

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import {
  resolveCapabilities,
  canUse,
  getLimit,
  getCapability,
  usageStatus,
  usagePeriodKey,
  computeEffectiveStatus,
  isBlockedStatus,
} from './capabilityModel.js';
import { getBusinessProfile } from '../businessProfiles/businessProfileModel.js';

const TZ = process.env.APP_TIMEZONE || 'America/La_Paz';
const CACHE_MS = 60 * 1000;
const cache = new Map();

export const DENY_MESSAGES = {
  negocio_no_encontrado: 'Negocio no encontrado.',
  negocio_bloqueado: 'El negocio está suspendido o su suscripción venció.',
  capacidad_no_incluida: 'Esta función no está incluida en el plan del negocio.',
  limite_alcanzado: 'Se alcanzó el límite de uso de esta función para este período.',
};

export function currentPeriod() {
  return usagePeriodKey(new Date(), TZ);
}

async function readAccess(negocioId) {
  const snap = await db.collection('negocios').doc(negocioId).get();
  if (!snap.exists) return { negocioId, exists: false, capabilities: resolveCapabilities({}) };

  const negocio = snap.data();
  const planId = negocio.plan || null;
  let plan = null;
  if (planId) {
    const planSnap = await db.collection('planes').doc(String(planId)).get();
    plan = planSnap.exists ? planSnap.data() : null;
  }

  const status = computeEffectiveStatus(negocio.status, negocio.subscriptionEnd || null, negocio.trialEnd || null);
  return {
    negocioId,
    exists: true,
    status,
    isBlocked: isBlockedStatus(status),
    planId,
    planName: plan?.name || null,
    capabilities: resolveCapabilities({
      planFeatures: plan?.features || null,
      overrides: negocio.capabilityOverrides || null,
      profileDefaults: getBusinessProfile(negocio.businessType).capabilityDefaults || null,
    }),
  };
}

export async function getNegocioAccess(negocioId, { fresh = false } = {}) {
  if (!negocioId) throw new Error('Falta negocioId.');
  const hit = cache.get(negocioId);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = await readAccess(negocioId);
  cache.set(negocioId, { at: Date.now(), data });
  return data;
}

export function invalidateNegocioAccess(negocioId) {
  cache.delete(negocioId);
}

function usageRef(negocioId, period = currentPeriod()) {
  return db.collection('negocios').doc(negocioId).collection('uso').doc(period);
}

export async function getUsage(negocioId, period = currentPeriod()) {
  const snap = await usageRef(negocioId, period).get();
  return snap.exists ? snap.data() : {};
}

/** Suma consumo del período actual. Nunca lanza (el consumo no debe cortar el servicio). */
export async function incrementUsage(negocioId, usageKey, amount = 1) {
  if (!negocioId || !usageKey) return;
  const period = currentPeriod();
  try {
    await usageRef(negocioId, period).set({
      periodo: period,
      [usageKey]: FieldValue.increment(amount),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    logger.warn(`[capabilities] No se pudo registrar consumo ${usageKey} (${negocioId}):`, err.message);
  }
}

/** Registra intentos rechazados por límite (se muestra como "excedente" en Super Admin). */
export async function incrementRejected(negocioId, usageKey, amount = 1) {
  if (!negocioId || !usageKey) return;
  const period = currentPeriod();
  try {
    await usageRef(negocioId, period).set({
      periodo: period,
      rechazados: { [usageKey]: FieldValue.increment(amount) },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    logger.warn(`[capabilities] No se pudo registrar rechazo ${usageKey} (${negocioId}):`, err.message);
  }
}

/**
 * ¿Puede el negocio usar esta capacidad ahora mismo?
 * Revisa: existe, no bloqueado, capacidad activa y (si tiene límite
 * mensual) que no lo haya alcanzado.
 */
export async function checkCapability(negocioId, key, { checkLimit = true } = {}) {
  const access = await getNegocioAccess(negocioId);
  if (!access.exists) return { allowed: false, reason: 'negocio_no_encontrado', access };
  if (access.isBlocked) return { allowed: false, reason: 'negocio_bloqueado', access };
  if (!canUse(access.capabilities, key)) return { allowed: false, reason: 'capacidad_no_incluida', access };

  const cap = getCapability(key);
  const limit = getLimit(access.capabilities, key);
  if (checkLimit && cap?.limit?.period === 'month' && limit !== null) {
    const usage = await getUsage(negocioId);
    const used = Number(usage[cap.limit.usageKey]) || 0;
    const st = usageStatus(limit, used);
    if (st.exceeded) return { allowed: false, reason: 'limite_alcanzado', access, ...st, usageKey: cap.limit.usageKey };
    return { allowed: true, access, ...st, usageKey: cap.limit.usageKey };
  }
  return { allowed: true, access, limit };
}

/**
 * Middleware: permite si el negocio (req.negocioId) tiene AL MENOS UNA de
 * las capacidades indicadas. Responde 403 con `code` si no.
 */
export function requireCapability(...keys) {
  return async (req, res, next) => {
    const negocioId = req.negocioId || req.body?.negocioId || req.query?.negocioId;
    if (!negocioId) return res.status(400).json({ error: 'Falta negocioId.' });
    try {
      let last = null;
      for (const key of keys) {
        const r = await checkCapability(negocioId, key);
        if (r.allowed) return next();
        last = { key, reason: r.reason };
      }
      logger.warn(`[capabilities] Rechazado ${req.method} ${req.originalUrl} negocio=${negocioId} (${last.key}: ${last.reason})`);
      return res.status(403).json({ error: DENY_MESSAGES[last.reason] || 'No permitido.', code: last.reason, capability: last.key });
    } catch (err) {
      logger.error('[capabilities] Error validando capacidad:', err.message);
      return res.status(500).json({ error: 'No se pudo validar el acceso.' });
    }
  };
}
