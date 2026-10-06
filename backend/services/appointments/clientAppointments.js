// clientAppointments.js
//
// "Mis citas" para el asistente de WhatsApp: listar las próximas citas de un
// teléfono y cancelarlas. Solo el mismo teléfono puede cancelar su cita.

import { db } from '../../config/firebase.js';

const CANCELABLES = new Set(['confirmed', 'pending']);
const soloDigitos = (v) => String(v || '').replace(/[^0-9]/g, '');

// La cita puede tener el teléfono como "59171234567", "+59171234567" o "71234567"
// (ClienteApp guarda lo que escribe el cliente).
function variantesTelefono(phone) {
  const d = soloDigitos(phone);
  const set = new Set([d, `+${d}`]);
  if (d.length > 8) {
    const local = d.slice(-8);
    set.add(local);
    set.add(`+591 ${local}`);
  }
  return [...set].filter(Boolean);
}

function mismoTelefono(a, b) {
  const da = soloDigitos(a);
  const dbb = soloDigitos(b);
  if (!da || !dbb) return false;
  return da === dbb || (da.length >= 8 && dbb.length >= 8 && da.slice(-8) === dbb.slice(-8));
}

/** Próximas citas (desde `hoyIso`) que el cliente todavía puede cancelar. */
export async function listUpcomingClientAppointments({ negocioId, phone, hoyIso, limite = 10 }) {
  const citasRef = db.collection('negocios').doc(negocioId).collection('citas');
  const snap = await citasRef.where('clientPhone', 'in', variantesTelefono(phone)).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.date >= hoyIso && CANCELABLES.has(c.status))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, limite);
}

/** Cancela una cita del cliente. Devuelve la cita (antes del cambio). */
export async function cancelClientAppointment({ negocioId, citaId, phone }) {
  const citaRef = db.collection('negocios').doc(negocioId).collection('citas').doc(citaId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(citaRef);
    if (!snap.exists) throw new Error('La cita ya no existe.');
    const cita = { id: snap.id, ...snap.data() };
    if (!mismoTelefono(cita.clientPhone, phone)) throw new Error('La cita no pertenece a este número.');
    if (!CANCELABLES.has(cita.status)) throw new Error('La cita ya no se puede cancelar.');

    const nowIso = new Date().toISOString();
    tx.update(citaRef, { status: 'cancelled', cancelledBy: 'client', cancelledAt: nowIso, updatedAt: nowIso });
    return cita;
  });
}
