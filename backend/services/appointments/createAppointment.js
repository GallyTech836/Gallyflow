// createAppointment.js
//
// Crea una cita validando disponibilidad dentro de una transacción de
// Firestore, para evitar que dos clientes reserven el mismo horario a la vez.

import { db } from '../../config/firebase.js';
import { getAvailableSlots } from './availability.js';

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

    const totalPrice = services.reduce((acc, s) => acc + Number(s.price || 0), 0);

    const nuevaCitaRef = citasRef.doc();
    const nuevaCita = {
      clientName: clientName?.trim() || '',
      clientPhone: clientPhone?.trim() || 'No especificado',
      professionalId,
      barberId: professionalId,
      services,
      serviceId: services[0]?.serviceId || '',
      serviceName: services.map((s) => s.serviceName).join(' + '),
      duration: serviceDuration,
      price: totalPrice,
      date,
      time,
      status: 'confirmed',
      paymentMethod: paymentMethod || '',
      bookedBy,
      notes: '',
      branch: branch || '',
      createdAt: new Date().toISOString(),
    };

    tx.set(nuevaCitaRef, nuevaCita);

    return { id: nuevaCitaRef.id, ...nuevaCita };
  });
}