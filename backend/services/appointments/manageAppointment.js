// manageAppointment.js
//
// Cancelar y reprogramar citas desde el asistente de WhatsApp.
// Todo se valida en el servidor y dentro de transacciones:
//   - la cita debe ser del mismo teléfono que escribe,
//   - debe estar activa (confirmed / pending),
//   - debe faltar al menos `minHours` (assistantConfig.changeMinHours),
//   - al reprogramar, el nuevo horario debe estar libre (sin contar la propia cita).
//
// `ahora` es un Date en la hora del negocio (ahoraNegocio() del engine), el
// mismo marco que se usa para armar la fecha/hora de la cita.

import { db } from '../../config/firebase.js';
import { getAvailableSlots } from './availability.js';
import { professionalCanDo, getCitaServiceIds, PENDING_ID } from './pendingModel.js';
import { variantesTelefono } from './clientRecord.js';

const ACTIVAS = new Set(['confirmed', 'pending']);
const digitos = (p) => String(p || '').replace(/\D/g, '');

function esDelCliente(cita, phone) {
    const suyo = digitos(cita?.clientPhone);
    if (!suyo) return false;
    const propias = new Set(variantesTelefono(digitos(phone)).map(digitos));
    // Mismo número aunque uno tenga código de país y el otro no.
    return propias.has(suyo) || (suyo.length >= 8 && suyo.slice(-8) === digitos(phone).slice(-8));
  }

export function fechaHoraCita(cita) {
  const [y, m, d] = String(cita.date || '').split('-').map(Number);
  const [hh, mm] = String(cita.time || '').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

export function faltaSuficiente(cita, ahora, minHours) {
  return fechaHoraCita(cita).getTime() - ahora.getTime() >= (Number(minHours) || 0) * 3600000;
}

function validarCita(snap, phone, ahora, minHours) {
  if (!snap.exists) throw new Error('No encontré esa cita.');
  const cita = { id: snap.id, ...snap.data() };
  if (!esDelCliente(cita, phone)) throw new Error('No encontré esa cita.');
  if (!ACTIVAS.has(cita.status)) throw new Error('Esa cita ya no está activa.');
  if (!faltaSuficiente(cita, ahora, minHours)) throw new Error('DEMASIADO_TARDE');
  return cita;
}

/**
 * Citas activas y futuras de un teléfono, de la más próxima a la más lejana.
 * Nunca lanza: si falla devuelve [].
 */
export async function findUpcomingCitas(negocioId, phone, ahora, max = 5) {
  try {
        // Se buscan las citas desde hoy y se compara el teléfono por dígitos, porque
    // el admin lo guarda en distintos formatos ("+591 75196640", "59175196640"...).
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    const snap = await db.collection('negocios').doc(negocioId).collection('citas')
      .where('date', '>=', hoy)
      .get();
    const ahoraMs = ahora.getTime();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => esDelCliente(c, phone))
      .filter((c) => ACTIVAS.has(c.status) && c.date && c.time && fechaHoraCita(c).getTime() > ahoraMs)
      .sort((a, b) => fechaHoraCita(a) - fechaHoraCita(b))
      .slice(0, max);
  } catch {
    return [];
  }
}

export async function cancelAppointment({ negocioId, citaId, phone, ahora, minHours }) {
  const ref = db.collection('negocios').doc(negocioId).collection('citas').doc(citaId);
  return db.runTransaction(async (tx) => {
    const cita = validarCita(await tx.get(ref), phone, ahora, minHours);
    const nowIso = new Date().toISOString();
    const cambios = {
      status: 'cancelled',
      cancelledBy: 'client',
      cancelledVia: 'whatsapp',
      cancelledAt: nowIso,
      updatedAt: nowIso,
    };
    tx.update(ref, cambios);
    return { ...cita, ...cambios };
  });
}

/**
 * Cambia día, hora y (opcional) profesional de una cita.
 * `professionalId` = uno concreto; o `candidateIds` = "cualquiera": se asigna
 * el primero que esté libre a esa hora (la cita queda asignada, no Pendiente).
 */
export async function rescheduleAppointment({
  negocioId, citaId, phone, ahora, minHours, date, time, duration, professionalId, candidateIds,
}) {
  if (!date || !time || !duration) throw new Error('Faltan datos para reprogramar.');
  const negocioRef = db.collection('negocios').doc(negocioId);
  const ref = negocioRef.collection('citas').doc(citaId);

  return db.runTransaction(async (tx) => {
    const [citaSnap, prosSnap, citasSnap, bloqSnap] = await Promise.all([
      tx.get(ref),
      tx.get(negocioRef.collection('profesionales')),
      tx.get(negocioRef.collection('citas').where('date', '==', date)),
      tx.get(negocioRef.collection('horariosBloqueados').where('date', '==', date)),
    ]);
    const cita = validarCita(citaSnap, phone, ahora, minHours);

    const nueva = { date, time };
    if (!faltaSuficiente(nueva, ahora, 0)) throw new Error('Ese horario ya pasó.');

    const serviceIds = getCitaServiceIds(cita);
    const ids = professionalId ? [professionalId] : (candidateIds || []);
    const pros = prosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const citasDelDia = citasSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.id !== citaId);
    const bloqueos = bloqSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const elegido = ids
      .map((id) => pros.find((p) => p.id === id))
      .filter((p) => p && p.active !== false && p.id !== PENDING_ID && professionalCanDo(p, serviceIds))
      .find((p) => getAvailableSlots({
        fecha: date,
        serviceDuration: duration,
        profesional: p,
        citasDelNegocio: citasDelDia,
        bloqueos,
      }).includes(time));
    if (!elegido) throw new Error('El horario ya no está disponible. Elige otro horario.');

    const nowIso = new Date().toISOString();
    const cambios = {
      date,
      time,
      professionalId: elegido.id,
      barberId: elegido.id,
      branch: elegido.branch || cita.branch || '',
      status: 'confirmed',
      rescheduledBy: 'client',
      rescheduledVia: 'whatsapp',
      rescheduledAt: nowIso,
      updatedAt: nowIso,
    };
    tx.update(ref, cambios);
    return { antes: cita, despues: { ...cita, ...cambios }, professionalName: elegido.name || '' };
  });
}