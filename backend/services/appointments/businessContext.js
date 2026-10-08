// businessContext.js
//
// Punto único para que el Assistant Engine obtenga todo lo que necesita
// saber de un negocio, sin queries sueltas repetidas en cada acción.

import { db } from '../../config/firebase.js';
import { computeEffectiveStatus, isBlockedStatus } from '../capabilities/capabilityModel.js';
import { getNegocioAccess } from '../capabilities/capabilityService.js';

// Caché en memoria: el asistente lee el negocio en cada mensaje; con esto se
// lee como máximo una vez por minuto por negocio (más rápido y menos lecturas).
// Un cambio en Admin (servicios, profesionales, encender/apagar) tarda hasta
// CACHE_MS en notarse en el bot.
const CACHE_MS = 60 * 1000;
const cache = new Map();

export async function getBusinessContext(negocioId) {
  const enCache = cache.get(negocioId);
  if (enCache && Date.now() - enCache.at < CACHE_MS) return enCache.data;
  const data = await leerContexto(negocioId);
  cache.set(negocioId, { at: Date.now(), data });
  return data;
}

async function leerContexto(negocioId) {
  const negocioRef = db.collection('negocios').doc(negocioId);
  const negocioSnap = await negocioRef.get();

  if (!negocioSnap.exists) {
    throw new Error(`Negocio no encontrado: ${negocioId}`);
  }
  const negocio = negocioSnap.data();

  const [serviciosSnap, profesionalesSnap, sucursalesSnap] = await Promise.all([
    negocioRef.collection('servicios').get(),
    negocioRef.collection('profesionales').get(),
    negocioRef.collection('sucursales').get(),
  ]);

  const servicios = serviciosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const profesionales = profesionalesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.active !== false);
  const sucursales = sucursalesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Mismo criterio que useNegocioStatus del front (capabilityModel):
  // suspendido, prueba vencida o subscriptionEnd vencido => bloqueado.
  const effectiveStatus = computeEffectiveStatus(negocio.status, negocio.subscriptionEnd || null, negocio.trialEnd || null);
  const access = await getNegocioAccess(negocioId);

  return {
    negocioId,
    businessName: negocio.heroConfig?.businessName || negocio.slug || negocioId,
    status: effectiveStatus,
    isBlocked: isBlockedStatus(effectiveStatus),
    plan: negocio.plan || null,
    capabilities: access.capabilities,
    assistantConfig: negocio.assistantConfig || { enabled: false, capabilities: {} },
    // Tener whatsappPhoneNumberId ya es la activación; esto solo permite
    // apagarlo explícitamente con assistantConfig.enabled = false.
    assistantEnabled: negocio.assistantConfig?.enabled !== false,
    businessSettings: negocio.businessSettings || {},
    servicios,
    profesionales,
    sucursales,
  };
}