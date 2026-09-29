import { db } from '../../config/firebase.js';
import { calculateCommissionForCita } from './commissionModel.js';

async function getCitasEnRango(negocioId, startDate, endDate, branch) {
  const citasRef = db.collection('negocios').doc(negocioId).collection('citas');
  // Solo se leen citas completadas (índice compuesto: status ASC + date ASC).
  const query = citasRef
    .where('status', '==', 'completed')
    .where('date', '>=', startDate)
    .where('date', '<=', endDate);
  const snap = await query.get();
  let citas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (branch && branch !== 'all') {
    citas = citas.filter((c) => c.branch === branch);
  }
  return citas;
}

async function getBarbersYServicios(negocioId) {
  const negocioRef = db.collection('negocios').doc(negocioId);
  const [barbersSnap, serviciosSnap] = await Promise.all([
    negocioRef.collection('profesionales').get(),
    negocioRef.collection('servicios').get(),
  ]);
  const barbers = barbersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const servicios = serviciosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { barbers, servicios };
}

function ingresoDeCita(cita) {
  if (Array.isArray(cita.services) && cita.services.length > 0) {
    return cita.services.reduce((sum, s) => sum + Number(s?.price || 0), 0);
  }
  return Number(cita.price || 0);
}

function calcularResumen(citas, barbers, servicios) {
  let ingresosBrutos = 0;
  let comisionGenerada = 0;
  let comisionPagada = 0;

  for (const cita of citas) {
    ingresosBrutos += ingresoDeCita(cita);
    const barber = barbers.find((b) => b.id === cita.professionalId || b.id === cita.barberId);
    const { totalAmount } = calculateCommissionForCita(cita, barber, servicios);
    comisionGenerada += totalAmount;
    if (cita.commissionPaid) comisionPagada += totalAmount;
  }

  const comisionPendiente = comisionGenerada - comisionPagada;
  const resultadoBarberia = ingresosBrutos - comisionGenerada;

  return { ingresosBrutos, comisionGenerada, comisionPagada, comisionPendiente, resultadoBarberia, citasCount: citas.length };
}

function calcularComisionesPorProfesional(citas, barbers, servicios) {
  return barbers.map((barber) => {
    const citasDelBarbero = citas.filter((c) => c.professionalId === barber.id || c.barberId === barber.id);
    let ingresosGenerados = 0, comisionGenerada = 0, comisionPagada = 0;

    for (const cita of citasDelBarbero) {
      ingresosGenerados += ingresoDeCita(cita);
      const { totalAmount } = calculateCommissionForCita(cita, barber, servicios);
      comisionGenerada += totalAmount;
      if (cita.commissionPaid) comisionPagada += totalAmount;
    }

    return {
      barberId: barber.id,
      name: barber.name,
      citasAtendidas: citasDelBarbero.length,
      ingresosGenerados,
      comisionGenerada,
      comisionPagada,
      comisionPendiente: comisionGenerada - comisionPagada,
    };
  });
}

export async function getFinanceSummary(negocioId, { startDate, endDate, branch }) {
  const citas = await getCitasEnRango(negocioId, startDate, endDate, branch);
  const { barbers, servicios } = await getBarbersYServicios(negocioId);
  return calcularResumen(citas, barbers, servicios);
}

export async function getComisionesPorProfesional(negocioId, { startDate, endDate, branch }) {
  const citas = await getCitasEnRango(negocioId, startDate, endDate, branch);
  const { barbers, servicios } = await getBarbersYServicios(negocioId);
  return calcularComisionesPorProfesional(citas, barbers, servicios);
}

// Resumen + comisiones con UNA sola lectura de citas/profesionales/servicios
// (antes /summary y /commissions leían lo mismo dos veces).
export async function getFinanceOverview(negocioId, { startDate, endDate, branch }) {
  const [citas, { barbers, servicios }] = await Promise.all([
    getCitasEnRango(negocioId, startDate, endDate, branch),
    getBarbersYServicios(negocioId),
  ]);
  return {
    summary: calcularResumen(citas, barbers, servicios),
    commissions: calcularComisionesPorProfesional(citas, barbers, servicios),
  };
}

export async function getDetalleComisionesBarbero(negocioId, barberId, { startDate, endDate }) {
  const citas = await getCitasEnRango(negocioId, startDate, endDate, 'all');
  const { barbers, servicios } = await getBarbersYServicios(negocioId);
  const barber = barbers.find((b) => b.id === barberId);
  if (!barber) return [];

  const citasDelBarbero = citas.filter((c) => c.professionalId === barberId || c.barberId === barberId);

  citasDelBarbero.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return citasDelBarbero.map((cita) => {
    const { totalAmount, breakdown } = calculateCommissionForCita(cita, barber, servicios);
    return {
      citaId: cita.id,
      date: cita.date,
      clientName: cita.clientName,
      services: breakdown.map((b) => ({ serviceName: b.serviceName, price: b.price, comision: b.amount, isConfigured: b.isConfigured })),
      totalComision: totalAmount,
      commissionPaid: !!cita.commissionPaid,
    };
  });
}

export async function registrarPagoComision(negocioId, barberId, { startDate, endDate }) {
  const citas = await getCitasEnRango(negocioId, startDate, endDate, 'all');
  const { barbers, servicios } = await getBarbersYServicios(negocioId);
  const barber = barbers.find((b) => b.id === barberId);
  if (!barber) throw new Error('Profesional no encontrado.');

  const pendientes = citas.filter(
    (c) => (c.professionalId === barberId || c.barberId === barberId) && !c.commissionPaid
  );

  let monto = 0;
  const citaIds = [];
  const batch = db.batch();
  const citasRef = db.collection('negocios').doc(negocioId).collection('citas');

  for (const cita of pendientes) {
    const { totalAmount } = calculateCommissionForCita(cita, barber, servicios);
    if (totalAmount > 0) {
      monto += totalAmount;
      citaIds.push(cita.id);
      batch.update(citasRef.doc(cita.id), { commissionPaid: true });
    }
  }

  if (citaIds.length === 0) {
    return { monto: 0, citaIds: [] };
  }

  const pagoRef = db.collection('negocios').doc(negocioId).collection('commissionPayments').doc();
  batch.set(pagoRef, {
    barberId,
    barberName: barber.name,
    amount: monto,
    citaIds,
    paidAt: new Date().toISOString(),
  });

  await batch.commit();
  return { monto, citaIds, paymentId: pagoRef.id };
}