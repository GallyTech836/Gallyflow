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
  cupo_alcanzado: 'Se alcanzó el máximo permitido por el plan del negocio.',
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

  const profile = getBusinessProfile(negocio.businessType);
  const status = computeEffectiveStatus(negocio.status, negocio.subscriptionEnd || null, negocio.trialEnd || null);
  return {
    negocioId,
    exists: true,
    status,
    isBlocked: isBlockedStatus(status),
    planId,
    planName: plan?.name || null,
    planActive: plan ? plan.active !== false : null,
    addons: negocio.addons || null,
    // Para textos (terminología) — no afectan capacidades.
    businessType: negocio.businessType || null,
    terminologyOverrides: negocio.terminologyOverrides || null,
    capabilities: resolveCapabilities({
      planFeatures: plan?.features || null,
      overrides: negocio.capabilityOverrides || null,
      // Complementos contratados (profesionales extra, Asistente de WhatsApp).
      addons: negocio.addons || null,
      // El tipo de negocio solo restringe (nunca habilita).
      profileDefaults: profile.capabilityDefaults || null,
      relevantModules: profile.modules || null,
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

// ───────────── Límite mensual por sucursal (respuestas de WhatsApp) ─────────────
//
// Cada número de WhatsApp está vinculado a una sucursal (whatsappAccounts.branch
// guarda su NOMBRE). El consumo se cuenta por el ID de la sucursal, para que
// renombrarla no parta el conteo del mes:
//   negocios/{id}/uso/{AAAA-MM}/sucursales/{sucursalId} = { enviados, nombre }
// Si el número no tiene sucursal y el negocio tiene UNA sola, se usa esa.
// Si no se puede saber (varias sucursales y número sin vincular, o ninguna),
// se cuenta en sucursales/sin-sucursal, que también tiene el límite.

export const NO_BRANCH_ID = 'sin-sucursal';
const SUCURSAL_CACHE_MS = 60 * 1000;
const cacheSucursales = new Map();

const soloDigitos = (v) => String(v || '').replace(/\D/g, '').slice(0, 20);

async function sucursalesActivas(negocioId, { fresh = false } = {}) {
  const enCache = cacheSucursales.get(negocioId);
  if (!fresh && enCache && Date.now() - enCache.at < SUCURSAL_CACHE_MS) return enCache.data;
  const snap = await db.collection('negocios').doc(negocioId).collection('sucursales').get();
  const data = snap.docs
    .map((d) => ({ id: d.id, name: d.data()?.name || '', active: d.data()?.active !== false }))
    .filter((s) => s.active);
  cacheSucursales.set(negocioId, { at: Date.now(), data });
  return data;
}

/**
 * Sucursal a la que se le cuenta el consumo de un número.
 * Nunca lanza: ante un error de lectura cae en sin-sucursal.
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function resolveUsageBranch(negocioId, branchName) {
  try {
    let sucursales = await sucursalesActivas(negocioId);
    const nombre = String(branchName || '').trim();
    if (nombre) {
      let s = sucursales.find((x) => x.name === nombre);
      // Sucursal recién creada o renombrada: se relee sin esperar la caché.
      if (!s) {
        sucursales = await sucursalesActivas(negocioId, { fresh: true });
        s = sucursales.find((x) => x.name === nombre);
      }
      if (s) return { id: s.id, name: s.name };
    }
    if (sucursales.length === 1) return { id: sucursales[0].id, name: sucursales[0].name };
  } catch (err) {
    logger.warn(`[capabilities] No se pudo leer sucursales (${negocioId}):`, err.message);
  }
  return { id: NO_BRANCH_ID, name: 'Sin sucursal asignada' };
}

function branchUsageRef(negocioId, branchId, period = currentPeriod()) {
  return usageRef(negocioId, period).collection('sucursales').doc(String(branchId || NO_BRANCH_ID));
}

/**
 * ¿Esta sucursal todavía tiene respuestas disponibles este mes?
 * limit null = sin límite. Ante un error de lectura se permite (no cortar el servicio).
 * @returns {{ allowed: boolean, used: number, limit: number|null }}
 */
export async function checkBranchLimit(negocioId, branchId, limit) {
  if (limit === null || limit === undefined) return { allowed: true, used: 0, limit: null };
  try {
    const snap = await branchUsageRef(negocioId, branchId).get();
    const used = snap.exists ? Number(snap.data().enviados) || 0 : 0;
    return { allowed: used < limit, used, limit };
  } catch (err) {
    logger.warn(`[capabilities] No se pudo leer consumo de la sucursal (${negocioId}):`, err.message);
    return { allowed: true, used: 0, limit };
  }
}

/**
 * Suma una respuesta enviada desde el número de esta sucursal. Si con esta
 * llega justo al límite, suma 1 a uso/{AAAA-MM}.sucursalesAlLimite.
 * Nunca lanza.
 */
export async function incrementBranchUsage(negocioId, branch, limit) {
  if (!negocioId) return;
  const period = currentPeriod();
  const id = branch?.id || NO_BRANCH_ID;
  try {
    await db.runTransaction(async (tx) => {
      const ref = branchUsageRef(negocioId, id, period);
      const snap = await tx.get(ref);
      const enviados = (snap.exists ? Number(snap.data().enviados) || 0 : 0) + 1;
      tx.set(ref, { enviados, nombre: branch?.name || '', updatedAt: new Date().toISOString() }, { merge: true });
      if (typeof limit === 'number' && enviados === limit) {
        tx.set(usageRef(negocioId, period), {
          periodo: period, sucursalesAlLimite: FieldValue.increment(1), updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
    });
  } catch (err) {
    logger.warn(`[capabilities] No se pudo registrar consumo de la sucursal (${negocioId}):`, err.message);
  }
}

/**
 * Respuestas enviadas a cada cliente (celular) en el mes. Solo es un dato
 * (Super Admin muestra el top 3); no corta el servicio. Nunca lanza.
 */
export async function incrementClientUsage(negocioId, clientId) {
  if (!negocioId || !clientId) return;
  try {
    await usageRef(negocioId).collection('clientes').doc(soloDigitos(clientId) || 'desconocido').set({
      enviados: FieldValue.increment(1), updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    logger.warn(`[capabilities] No se pudo registrar consumo del cliente (${negocioId}):`, err.message);
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
  // Límite por sucursal: se valida aparte con checkBranchLimit (necesita el número que recibió el mensaje).
  if (checkLimit && cap?.limit?.period === 'month' && limit !== null && !cap.limit.perBranch) {
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
