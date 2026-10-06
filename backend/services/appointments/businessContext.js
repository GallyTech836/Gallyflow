// businessContext.js
//
// Punto único para que el Assistant Engine obtenga todo lo que necesita
// saber de un negocio, sin queries sueltas repetidas en cada acción.

import { db } from '../../config/firebase.js';

export async function getBusinessContext(negocioId) {
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

    // Mismo criterio que useNegocioStatus del front: suspendido o con
  // subscriptionEnd vencido => bloqueado.
  let effectiveStatus = negocio.status || 'active';
  if (effectiveStatus !== 'suspended' && negocio.subscriptionEnd) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (new Date(negocio.subscriptionEnd) < hoy) effectiveStatus = 'expired';
  }

  return {
    negocioId,
    businessName: negocio.heroConfig?.businessName || negocio.slug || negocioId,
    status: effectiveStatus,
    isBlocked: effectiveStatus === 'suspended' || effectiveStatus === 'expired',
    plan: negocio.plan || null,
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