// createAppointment.js
//
// Crea una cita validando disponibilidad dentro de una transacción de
// Firestore, para evitar que dos clientes reserven el mismo horario a la vez.

import { db } from '../../config/firebase.js';
import { getAvailableSlots } from './availability.js';
import { getPendingCandidates, PENDING_ID } from './pendingModel.js';
import { repriceCitaServices } from '../pricing/professionalPricing.js';
import { readServicesInTx } from '../pricing/catalogInTx.js';

// Precio por profesional: el precio NUNCA se toma de quien llama (el endpoint
// es público); se recalcula aquí con el catálogo y el profesional, dentro de
// la misma transacción. Nombre y duración sí se respetan.
function priceServicesOrThrow(services, catalog, professional, opts) {
  const missing = services.find((s) => !catalog.some((c) => String(c.id) === String(s.serviceId)));
  if (missing) throw new Error('Servicio no encontrado. Actualiza e inténtalo de nuevo.');
  return repriceCitaServices(services, catalog, professional, opts);
}

export async function createAppointment({
  negocioId,
  professionalId,
  date,
  time,
  serviceDuration,
  services,
  clientName,
  clientPhone,
  paymentMethod,
  branch,
  clientId,
  bookedBy = 'client',
}) {
  if (!negocioId || !professionalId || !date || !time || !serviceDuration || !services?.length) {
    throw new Error('Faltan campos requeridos para crear la cita.');
  }

  const negocioRef = db.collection('negocios').doc(negocioId);
  const citasRef = negocioRef.collection('citas');
  const profesionalRef = negocioRef.collection('profesionales').doc(professionalId);
  const bloqueosRef = negocioRef.collection('horariosBloqueados');

  return db.runTransaction(async (tx) => {
    const profesionalSnap = await tx.get(profesionalRef);
    if (!profesionalSnap.exists) {
      throw new Error('Profesional no encontrado.');
    }
    const profesional = { id: profesionalSnap.id, ...profesionalSnap.data() };

    const citasDelDiaSnap = await tx.get(citasRef.where('date', '==', date));
    const citasDelNegocio = citasDelDiaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const bloqueosDelDiaSnap = await tx.get(bloqueosRef.where('date', '==', date));
    const bloqueos = bloqueosDelDiaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const catalog = await readServicesInTx(tx, negocioRef, services.map((s) => s.serviceId));

    const slotsLibres = getAvailableSlots({
      fecha: date,
      serviceDuration,
      profesional,
      citasDelNegocio,
      bloqueos,
    });

    if (!slotsLibres.includes(time)) {
      throw new Error('El horario ya no está disponible. Elige otro horario.');
    }

    const priced = priceServicesOrThrow(services, catalog, profesional);

    const nowIso = new Date().toISOString();
    const nuevaCitaRef = citasRef.doc();
    const nuevaCita = {
      ...(clientId ? { clientId } : {}),
      clientName: clientName?.trim() || '',
      clientPhone: clientPhone?.trim() || 'No especificado',
      professionalId,
      barberId: professionalId,
      services: priced.services,
      serviceId: services[0]?.serviceId || '',
      serviceName: services.map((s) => s.serviceName).join(' + '),
      duration: serviceDuration,
      price: priced.totalPrice,
      date,
      time,
      status: 'confirmed',
      paymentMethod: paymentMethod || '',
      bookedBy,
      notes: '',
      branch: branch || '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    tx.set(nuevaCitaRef, nuevaCita);

    return { id: nuevaCitaRef.id, ...nuevaCita };
  });
}

/**
 * Cita "Pendiente" (sin profesional): mismo esquema que ClienteApp
 * (professionalId/barberId = 'pending'). Dentro de la transacción se exige que
 * exista al menos un candidato libre; la asignación la hace después
 * processPendingCita (pendingService), igual que con el link público.
 */
export async function createPendingAppointment({
  negocioId,
  date,
  time,
  serviceDuration,
  services,
  clientName,
  clientPhone,
  clientId,
  paymentMethod,
  branch,
  candidateIds,
  bookedBy = 'client',
}) {
  if (!negocioId || !date || !time || !serviceDuration || !services?.length) {
    throw new Error('Faltan campos requeridos para crear la cita.');
  }

  const negocioRef = db.collection('negocios').doc(negocioId);
  const citasRef = negocioRef.collection('citas');
  const soloEstos = Array.isArray(candidateIds) && candidateIds.length ? new Set(candidateIds) : null;

  return db.runTransaction(async (tx) => {
    const [negocioSnap, prosSnap, citasSnap, bloqSnap] = await Promise.all([
      tx.get(negocioRef),
      tx.get(negocioRef.collection('profesionales')),
      tx.get(citasRef.where('date', '==', date)),
      tx.get(negocioRef.collection('horariosBloqueados').where('date', '==', date)),
    ]);

    const candidatos = getPendingCandidates({
      professionals: prosSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => !soloEstos || soloEstos.has(p.id)),
      serviceIds: services.map((s) => s.serviceId),
      fecha: date,
      time,
      duration: serviceDuration,
      citas: citasSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      bloqueos: bloqSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      businessSchedule: negocioSnap.data()?.businessSettings?.schedule || [],
    });
    if (candidatos.length === 0) {
      throw new Error('El horario ya no está disponible. Elige otro horario.');
    }
    // Pendiente: precio = mínimo entre candidatos (rango guardado); se
    // recalcula con el del profesional cuando se asigna.
    const catalog = await readServicesInTx(tx, negocioRef, services.map((s) => s.serviceId));
    const priced = priceServicesOrThrow(services, catalog, null, { candidates: candidatos });

    const nowIso = new Date().toISOString();
    const nuevaCitaRef = citasRef.doc();
    const nuevaCita = {
      ...(clientId ? { clientId } : {}),
      clientName: clientName?.trim() || '',
      clientPhone: clientPhone?.trim() || 'No especificado',
      professionalId: PENDING_ID,
      barberId: PENDING_ID,
      services: priced.services,
      serviceId: services[0]?.serviceId || '',
      serviceName: services.map((s) => s.serviceName).join(' + '),
      duration: serviceDuration,
      price: priced.totalPrice,
      priceProvisional: true,
      date,
      time,
      status: 'confirmed',
      paymentMethod: paymentMethod || '',
      bookedBy,
      notes: '',
      branch: branch || '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    tx.set(nuevaCitaRef, nuevaCita);
    return { id: nuevaCitaRef.id, ...nuevaCita };
  });
}