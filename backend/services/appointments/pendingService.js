// pendingService.js
//
// Evalúa citas "Pendiente" (professionalId/barberId === 'pending').
// Pendiente NO bloquea nada: aquí solo se decide si queda UN solo candidato
// (activo + hace el servicio + libre) para asignarla automáticamente, o si
// hay que avisar a los candidatos. Cada evaluación corre en una transacción
// de Firestore, por eso es idempotente: llamarla varias veces no duplica
// asignaciones ni notificaciones.

import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { sendNotification } from '../notificationService.js';
import {
  getPendingCandidates,
  getCitaServiceIds,
  isOpenPendingCita,
  pickAutoAssignee,
} from './pendingModel.js';

async function evaluateOne(negocioId, citaId) {
  const negocioRef = db.collection('negocios').doc(negocioId);
  const citasRef = negocioRef.collection('citas');

  const outcome = await db.runTransaction(async (tx) => {
    const citaRef = citasRef.doc(citaId);
    const citaSnap = await tx.get(citaRef);
    if (!citaSnap.exists) return { action: 'none' };
    const cita = { id: citaSnap.id, ...citaSnap.data() };
    if (!isOpenPendingCita(cita)) return { action: 'none' };

    const [negocioSnap, prosSnap, citasSnap, bloqSnap] = await Promise.all([
      tx.get(negocioRef),
      tx.get(negocioRef.collection('profesionales')),
      tx.get(citasRef.where('date', '==', cita.date)),
      tx.get(negocioRef.collection('horariosBloqueados').where('date', '==', cita.date)),
    ]);

    const businessSchedule = negocioSnap.data()?.businessSettings?.schedule || [];
    const professionals = prosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const citas = citasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const bloqueos = bloqSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const candidates = getPendingCandidates({
      professionals,
      serviceIds: getCitaServiceIds(cita),
      fecha: cita.date,
      time: cita.time,
      duration: cita.duration || 30,
      citas,
      bloqueos,
      businessSchedule,
      ignoreCitaId: cita.id,
    });

    const nowIso = new Date().toISOString();
    const assignee = pickAutoAssignee(candidates);

    if (assignee) {
      tx.update(citaRef, {
        professionalId: assignee.id,
        barberId: assignee.id,
        branch: assignee.branch || cita.branch || '',
        assignedFromPending: true,
        assignmentMode: 'auto',
        pendingAssignedAt: nowIso,
        updatedAt: nowIso,
      });
      return { action: 'assigned', cita, assignee };
    }

    if (!cita.pendingNotifiedAt) {
      tx.update(citaRef, { pendingNotifiedAt: nowIso });
      return { action: 'notify', cita, candidates };
    }
    return { action: 'none' };
  });

  // Notificaciones FUERA de la transacción (solo si el commit fue exitoso).
  try {
    if (outcome.action === 'assigned') {
      await sendNotification({
        tipo: 'RESERVA_PENDIENTE_ASIGNADA',
        negocioId,
        data: { clientName: outcome.cita.clientName, time: outcome.cita.time, serviceName: outcome.cita.serviceName },
        targetProfessionalId: outcome.assignee.id,
      });
    } else if (outcome.action === 'notify') {
      await sendNotification({
        tipo: 'RESERVA_PENDIENTE',
        negocioId,
        data: { clientName: outcome.cita.clientName, time: outcome.cita.time, serviceName: outcome.cita.serviceName },
        targetProfessionalIds: outcome.candidates.map((c) => c.id),
      });
    }
  } catch (err) {
    logger.warn('[pendingService] Notificación falló:', err.message);
  }

  return { citaId, action: outcome.action, professionalId: outcome.assignee?.id || null };
}

/** Evalúa UNA Pendiente (recién creada o cualquiera). */
export async function processPendingCita({ negocioId, citaId }) {
  if (!negocioId || !citaId) throw new Error('Faltan negocioId o citaId.');
  return evaluateOne(negocioId, citaId);
}

/**
 * Reevalúa las Pendientes de una fecha, o todas las futuras si no hay fecha.
 * Se ejecuta una por una (orden de creación, nunca por carga de trabajo)
 * para que una asignación ya confirmada cuente como ocupada en la siguiente.
 */
export async function reevaluatePending({ negocioId, date }) {
  if (!negocioId) throw new Error('Falta negocioId.');
  const citasRef = db.collection('negocios').doc(negocioId).collection('citas');

  let docs;
  if (date) {
    docs = (await citasRef.where('date', '==', date).get()).docs;
  } else {
    docs = (await citasRef.where('professionalId', '==', 'pending').get()).docs;
  }

  const minDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pendientes = docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => isOpenPendingCita(c) && (date || c.date >= minDate))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

  const results = [];
  for (const c of pendientes) {
    try {
      results.push(await evaluateOne(negocioId, c.id));
    } catch (err) {
      logger.warn(`[pendingService] No se pudo evaluar ${c.id}:`, err.message);
    }
  }
  return { evaluated: pendientes.length, results };
}
