// clientHistoryModel.js
// Lógica PURA (sin Firebase ni UI) de la ficha del cliente. Genérico: no
// asume rubro (barbería, spa, clínica...). Todo se deriva de:
//   - el documento del cliente   negocios/{id}/clientes/{clientId}
//   - sus citas                  negocios/{id}/citas  (services[], price, paymentMethod...)
//
// Campos NUEVOS y opcionales en el documento del cliente (sin migración;
// si no existen se usan valores vacíos):
//   email, birthDate (YYYY-MM-DD), address,
//   notes:        [{ id, text, createdAt }]
//   preferences:  { preferredProfessionalId, contactChannel, details }
//   customFields: [{ id, label, value }]
import { getServicesFromCita } from '../appointments/serviceSelection.js';

export const CONTACT_CHANNELS = [
  { value: '', label: 'Sin preferencia' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'llamada', label: 'Llamada' },
  { value: 'email', label: 'Correo' },
];

export const BOOKING_CHANNEL_LABELS = {
  admin: 'Panel de administración',
  barber: 'Profesional',
  client: 'Reserva online',
  whatsapp: 'WhatsApp',
};

const ACTIVE_STATUSES = ['pending', 'confirmed', 'in-process'];

const norm = (v) => String(v || '').trim().toLowerCase();
const digits = (v) => String(v || '').replace(/\D/g, '');

export function isRealPhone(p) {
  return !!p && !['n/a', 'no especificado'].includes(norm(p));
}

export function phonesMatch(a, b) {
  const da = digits(a);
  const db = digits(b);
  if (da.length < 7 || db.length < 7) return false;
  return da.slice(-8) === db.slice(-8);
}

// Estados: Admin guarda inglés ('completed'); datos viejos pueden venir en español.
export function normalizeCitaStatus(status) {
  const s = norm(status);
  if (['completed', 'completado', 'finalizado', 'completada'].includes(s)) return 'completed';
  if (['cancelled', 'cancelado', 'cancelada'].includes(s)) return 'cancelled';
  if (['in-process', 'en atención'].includes(s)) return 'in-process';
  if (['confirmed', 'confirmado', 'confirmada'].includes(s)) return 'confirmed';
  return 'pending';
}

/**
 * ¿La cita pertenece a este cliente? Primero por clientId; las citas que
 * no lo tienen (reserva online / WhatsApp) se reconocen por teléfono o,
 * como último recurso, por nombre exacto (mismo criterio que usa Admin
 * al crear citas).
 */
export function citaBelongsToClient(cita, client) {
  if (!cita || !client) return false;
  if (cita.clientId) return cita.clientId === client.id;
  if (isRealPhone(cita.clientPhone) && phonesMatch(cita.clientPhone, client.phone)) return true;
  return !!norm(cita.clientName) && norm(cita.clientName) === norm(client.name);
}

export function normalizeClientProfile(client) {
  const prefs = client?.preferences || {};
  return {
    email: client?.email || '',
    birthDate: client?.birthDate || '',
    address: client?.address || '',
    notes: Array.isArray(client?.notes) ? client.notes : [],
    preferences: {
      preferredProfessionalId: prefs.preferredProfessionalId || '',
      contactChannel: prefs.contactChannel || '',
      details: prefs.details || '',
    },
    customFields: Array.isArray(client?.customFields) ? client.customFields : [],
  };
}

const sortKey = (c) => `${c.date || ''} ${c.time || ''}`;

function eventTime(iso, fallbackDate, fallbackTime) {
  return iso || `${fallbackDate || ''}T${fallbackTime || '00:00'}`;
}

/**
 * Construye todo lo que muestra la ficha a partir del cliente y sus citas.
 * @param {Object} client
 * @param {Array}  citas   - citas ya filtradas del cliente
 * @param {Object} lookups - { professionals: [], todayStr: 'YYYY-MM-DD' }
 */
export function buildClientHistory(client, citas = [], { professionals = [], todayStr } = {}) {
  const today = todayStr || new Date().toISOString().split('T')[0];
  const profName = (id) => professionals.find((p) => p.id === id)?.name || '';

  const appointments = [...citas]
    .map((c) => {
      const status = normalizeCitaStatus(c.status);
      const services = getServicesFromCita(c);
      return {
        id: c.id,
        date: c.date || c.reservationDate || '',
        time: c.time || c.startTime || '',
        status,
        services,
        serviceLabel: services.map((s) => s.serviceName).filter(Boolean).join(' + ') || c.serviceName || c.service || 'Servicio',
        price: Number(c.price || 0),
        paymentMethod: c.paymentMethod || '',
        professionalName: profName(c.professionalId || c.barberId) || '',
        branch: c.branch || '',
        bookedBy: c.bookedBy || '',
        notes: c.notes || '',
        createdAt: c.createdAt || '',
        updatedAt: c.updatedAt || '',
      };
    })
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  const completed = appointments.filter((a) => a.status === 'completed');
  const cancelled = appointments.filter((a) => a.status === 'cancelled');
  const upcoming = appointments.filter((a) => ACTIVE_STATUSES.includes(a.status) && a.date >= today);

  // Servicios: cuántas veces los usó y cuánto gastó en cada uno (solo citas completadas).
  const svcMap = new Map();
  appointments.forEach((a) => {
    if (a.status === 'cancelled') return;
    a.services.forEach((s) => {
      const key = s.serviceId || s.serviceName;
      const entry = svcMap.get(key) || { key, name: s.serviceName || 'Servicio', count: 0, completed: 0, spent: 0, lastDate: '' };
      entry.count += 1;
      if (a.status === 'completed') {
        entry.completed += 1;
        entry.spent += Number(s.price || 0);
      }
      if (a.date > entry.lastDate) entry.lastDate = a.date;
      svcMap.set(key, entry);
    });
  });
  const services = [...svcMap.values()].sort((a, b) => b.count - a.count);

  // Pagos: citas completadas con un método real registrado.
  const payments = completed
    .filter((a) => a.paymentMethod && norm(a.paymentMethod) !== 'pendiente')
    .map((a) => ({ id: a.id, date: a.date, amount: a.price, method: a.paymentMethod, label: a.serviceLabel }));
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const byMethod = payments.reduce((acc, p) => ({ ...acc, [p.method]: (acc[p.method] || 0) + p.amount }), {});

  const visitDates = completed.map((a) => a.date).filter(Boolean).sort();
  const stats = {
    total: appointments.length,
    completed: completed.length,
    cancelled: cancelled.length,
    upcoming: upcoming.length,
    totalPaid,
    averageTicket: payments.length ? totalPaid / payments.length : 0,
    firstVisit: visitDates[0] || '',
    lastVisit: visitDates[visitDates.length - 1] || '',
    favoriteService: services[0]?.name || '',
  };

  // Línea de tiempo: agendado → realizado/cancelado → pago → notas → alta.
  const timeline = [];
  appointments.forEach((a) => {
    timeline.push({
      id: `${a.id}-created`, kind: 'appointment', at: eventTime(a.createdAt, a.date, a.time),
      title: 'Cita agendada',
      detail: `${a.serviceLabel} · ${a.date} ${a.time}${a.bookedBy ? ` · ${BOOKING_CHANNEL_LABELS[a.bookedBy] || a.bookedBy}` : ''}`,
    });
    if (a.status === 'completed') {
      timeline.push({
        id: `${a.id}-done`, kind: 'service', at: eventTime(a.updatedAt, a.date, a.time),
        title: 'Servicio realizado',
        detail: `${a.serviceLabel}${a.professionalName ? ` · ${a.professionalName}` : ''}`,
      });
    }
    if (a.status === 'cancelled') {
      timeline.push({
        id: `${a.id}-cancel`, kind: 'cancel', at: eventTime(a.updatedAt, a.date, a.time),
        title: 'Cita cancelada', detail: `${a.serviceLabel} · ${a.date} ${a.time}`,
      });
    }
  });
  payments.forEach((p) => {
    const src = appointments.find((a) => a.id === p.id);
    timeline.push({
      id: `${p.id}-pay`, kind: 'payment', at: eventTime(src?.updatedAt, p.date, src?.time),
      title: 'Pago registrado', detail: `${p.label} · ${p.method}`, amount: p.amount,
    });
  });
  normalizeClientProfile(client).notes.forEach((n) => {
    timeline.push({ id: `note-${n.id}`, kind: 'note', at: n.createdAt || '', title: 'Nota agregada', detail: n.text });
  });
  if (client?.createdAt) {
    timeline.push({ id: 'client-created', kind: 'client', at: client.createdAt, title: 'Cliente registrado', detail: '' });
  }
  timeline.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return { appointments, services, payments, byMethod, stats, timeline };
}
