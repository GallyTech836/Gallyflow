// publicBooking.js
//
// Reserva desde el link público (ClienteApp) a través del backend.
// Antes ClienteApp leía TODAS las citas del día y TODOS los clientes del
// negocio desde el navegador (nombres y teléfonos visibles para cualquiera)
// y escribía la cita directo en Firestore. Ahora:
//   - listBusyAppointments: solo lo necesario para calcular horarios libres
//     (profesional, hora, duración, estado, servicios). Sin datos del cliente.
//   - createPublicBooking: valida, guarda/actualiza el cliente y crea la cita
//     en una transacción (sin choques de horario). El precio y la duración
//     salen del catálogo, nunca de lo que manda el navegador.

import { db } from '../../config/firebase.js';
import { createAppointment, createPendingAppointment } from './createAppointment.js';
import { upsertClientFromPhone } from './clientRecord.js';
import { PENDING_ID } from './pendingModel.js';

const TZ = process.env.APP_TIMEZONE || 'America/La_Paz';
export const MIN_ANTICIPACION_MIN = 30; // igual que ClienteApp

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class BookingError extends Error {
  constructor(message, status = 400, code = 'INVALID') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Valida y limpia el body de la reserva pública. Lanza BookingError. */
export function validarReserva(body = {}) {
  const negocioId = texto(body.negocioId, 80);
  if (!ID_RE.test(negocioId)) throw new BookingError('Negocio inválido.');

  const date = texto(body.date, 10);
  const time = texto(body.time, 5);
  if (!FECHA_RE.test(date) || !HORA_RE.test(time)) throw new BookingError('Fecha u hora inválida.');

  const professionalId = texto(body.professionalId, 80);
  if (!ID_RE.test(professionalId)) throw new BookingError('Profesional inválido.');

  const serviceIds = [...new Set((Array.isArray(body.serviceIds) ? body.serviceIds : [])
    .map((s) => texto(s, 80)).filter((s) => ID_RE.test(s)))];
  if (serviceIds.length === 0 || serviceIds.length > 10) throw new BookingError('Elige al menos un servicio.');

  const clientName = texto(body.clientName, 80);
  if (clientName.length < 2) throw new BookingError('Escribe tu nombre.');
  const clientPhone = texto(body.clientPhone, 30);
  if (clientPhone && !/^[0-9+()\s-]{6,30}$/.test(clientPhone)) throw new BookingError('Teléfono inválido.');

  const branch = texto(body.branch, 120);
  const candidateIds = (Array.isArray(body.candidateIds) ? body.candidateIds : [])
    .map((s) => texto(s, 80)).filter((s) => ID_RE.test(s)).slice(0, 100);

  return { negocioId, date, time, professionalId, serviceIds, clientName, clientPhone, branch, candidateIds };
}

/** Minutos que faltan para date+time en la zona horaria del negocio. */
export function minutosHasta(date, time, ahora = new Date(), tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(ahora);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const ahoraLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return (Date.UTC(y, m - 1, d, hh, mm) - ahoraLocal) / 60000;
}

// Promo heredada de ClienteApp: martes, solo servicios con id 'sr' / 'jr'.
export function promoDeMartes(date) {
  const esMartes = new Date(`${date}T12:00:00Z`).getUTCDay() === 2;
  return (service) => esMartes && (service?.id === 'sr' || service?.id === 'jr');
}

/**
 * Citas y bloqueos de un día SIN datos privados (para calcular horarios
 * libres): ni nombre/teléfono del cliente ni el motivo del bloqueo.
 */
export async function listBusyAppointments(negocioId, date) {
  if (!ID_RE.test(String(negocioId || '')) || !FECHA_RE.test(String(date || ''))) {
    throw new BookingError('Datos inválidos.');
  }
  const negocioRef = db.collection('negocios').doc(negocioId);
  const [snap, bloqSnap] = await Promise.all([
    negocioRef.collection('citas').where('date', '==', date).get(),
    negocioRef.collection('horariosBloqueados').where('date', '==', date).get(),
  ]);
  const bloqueos = bloqSnap.docs.map((d) => d.data()).map((b) => ({
    date: b.date,
    startTime: b.startTime || '00:00',
    endTime: b.endTime || '00:00',
    professionalId: b.professionalId || b.barberId || null,
    barberId: b.barberId || b.professionalId || null,
  }));
  const citas = snap.docs
    .map((d) => d.data())
    .filter((c) => c && c.status !== 'cancelled')
    .map((c) => ({
      date: c.date,
      time: c.time || '00:00',
      duration: Number(c.duration) || 30,
      status: c.status || 'confirmed',
      professionalId: c.professionalId || c.barberId || null,
      barberId: c.barberId || c.professionalId || null,
      serviceId: c.serviceId || '',
      services: Array.isArray(c.services) ? c.services.map((s) => ({ serviceId: s?.serviceId || '' })) : [],
      branch: c.branch || '',
    }));
  return { citas, bloqueos };
}

/**
 * Crea la reserva pública. Devuelve { id, professionalId, price, priceProvisional }.
 * Lanza BookingError (400/409) con un mensaje para mostrar al cliente.
 */
export async function createPublicBooking(body, { ahora = new Date() } = {}) {
  const r = validarReserva(body);

  if (minutosHasta(r.date, r.time, ahora) < MIN_ANTICIPACION_MIN) {
    throw new BookingError(`Las reservas online deben hacerse con al menos ${MIN_ANTICIPACION_MIN} minutos de anticipación.`, 409, 'TOO_SOON');
  }

  // Servicios desde el catálogo: nombre y duración reales.
  const negocioRef = db.collection('negocios').doc(r.negocioId);
  const snaps = await Promise.all(r.serviceIds.map((id) => negocioRef.collection('servicios').doc(id).get()));
  if (snaps.some((s) => !s.exists)) {
    throw new BookingError('Un servicio ya no existe. Actualiza la página e inténtalo de nuevo.', 409, 'SERVICE_GONE');
  }
  const services = snaps.map((s) => {
    const d = s.data() || {};
    return { serviceId: s.id, serviceName: d.name || 'Servicio', duration: Number(d.duration) > 0 ? Number(d.duration) : 30 };
  });
  const serviceDuration = services.reduce((sum, s) => sum + s.duration, 0);
  const serviceName = services.map((s) => s.serviceName).join(' + ');

  // Cliente: se busca por teléfono en el servidor (el navegador ya no lee la base de clientes).
  const clientId = await upsertClientFromPhone({
    negocioId: r.negocioId,
    phone: r.clientPhone,
    displayPhone: r.clientPhone || null,
    name: r.clientName,
    date: r.date,
    serviceName: services[0]?.serviceName,
  });

  const datos = {
    negocioId: r.negocioId,
    date: r.date,
    time: r.time,
    serviceDuration,
    services,
    clientName: r.clientName,
    clientPhone: r.clientPhone || 'No especificado',
    clientId: clientId || undefined,
    paymentMethod: 'Pendiente',
    branch: r.branch,
    bookedBy: 'client',
    promoActive: promoDeMartes(r.date),
  };
  if (!datos.clientId) delete datos.clientId;

  let cita;
  try {
    cita = r.professionalId === PENDING_ID
      ? await createPendingAppointment({ ...datos, candidateIds: r.candidateIds })
      : await createAppointment({ ...datos, professionalId: r.professionalId });
  } catch (err) {
    throw new BookingError(err.message || 'No se pudo crear la reserva.', 409, 'UNAVAILABLE');
  }

  return {
    id: cita.id,
    professionalId: cita.professionalId,
    serviceName,
    price: cita.price,
    priceProvisional: cita.priceProvisional === true,
  };
}
