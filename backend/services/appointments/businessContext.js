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

  return {
    negocioId,
    businessName: negocio.heroConfig?.businessName || negocio.slug || negocioId,
    status: negocio.status || 'active',
    plan: negocio.plan || null,
    assistantConfig: negocio.assistantConfig || { enabled: false, capabilities: {} },
    servicios,
    profesionales,
    sucursales,
  };
}