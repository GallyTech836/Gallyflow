// workingHours.js (Fase 4/5)
//
// Revisa si una cita cae DENTRO del horario:
//   1) horario del negocio (Configuración > Negocio: businessSettings.schedule)
//   2) jornada del profesional (profesional.availability)
// La cita completa (inicio + duración) debe entrar en ambos.
//
// No consulta Firestore ni cambia datos: solo responde sí/no con un mensaje.
// Si el negocio nunca configuró su horario, el valor por defecto es "abierto
// todo el día", así que no bloquea nada (igual que antes).

import { GENERIC_TERMS } from '../businessProfiles/businessProfileModel';

const DAY_NAMES_MON_FIRST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

// "23:59" se toma como fin del día (24:00) para no dejar fuera el último minuto.
const toEndMin = (hhmm) => {
  const v = toMin(hhmm);
  return v === 23 * 60 + 59 ? 24 * 60 : v;
};

export function getDayName(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return DAY_NAMES_MON_FIRST[(date.getDay() + 6) % 7];
}

/**
 * @param {object} p
 * @param {string} p.date        'YYYY-MM-DD'
 * @param {string} p.time        'HH:MM'
 * @param {number} p.duration    minutos
 * @param {Array}  p.businessSchedule   businessSettings.schedule
 * @param {object} [p.professional]     profesional (con availability); null/'pending' = sin profesional
 * @param {object} [p.terms]            términos del negocio (createTerms)
 * @returns {{ ok: boolean, message?: string }}
 */
export function checkWorkingHours({ date, time, duration, businessSchedule = [], professional = null, terms = GENERIC_TERMS }) {
  const dayName = getDayName(date);
  const start = toMin(time);
  if (!dayName || start === null) return { ok: true };
  const end = start + (Number(duration) > 0 ? Number(duration) : 30);
  const endLabel = `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  const range = `${time} – ${endLabel}`;

  // 1) Horario del negocio
  const bday = (businessSchedule || []).find((d) => d?.day === dayName);
  if (bday) {
    if (bday.status === 'Cerrado') {
      return { ok: false, message: `El negocio está cerrado los ${dayName.toLowerCase()}.` };
    }
    const bs = toMin(bday.start);
    const be = toEndMin(bday.end);
    if (bs !== null && be !== null && (start < bs || end > be)) {
      return { ok: false, message: `${range} queda fuera del horario del negocio (${bday.start} – ${bday.end}).` };
    }
  }

  // 2) Jornada del profesional (si tiene una configurada)
  const av = professional && Array.isArray(professional.availability) ? professional.availability : [];
  if (av.length > 0) {
    const pday = av.find((a) => a?.day === dayName);
    const who = professional?.name || terms.tl('professional');
    if (!pday || pday.status !== 'Disponible') {
      return { ok: false, message: `${who} no trabaja los ${dayName.toLowerCase()}.` };
    }
    const ps = toMin(pday.start);
    const pe = toEndMin(pday.end);
    if (ps !== null && pe !== null && (start < ps || end > pe)) {
      return { ok: false, message: `${range} queda fuera del horario de ${who} (${pday.start} – ${pday.end}).` };
    }
  }

  return { ok: true };
}
