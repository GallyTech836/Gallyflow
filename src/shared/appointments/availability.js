// availability.js
//
// Extraído de ClienteApp.jsx (bloque "HORAS DISPONIBLES"). Misma regla de
// negocio exacta, sin cambios de comportamiento — solo separada de React y
// de Firebase para poder correr también en el backend (Railway), donde no
// existen ni hooks ni onSnapshot. Quien llame a esta función ya debe traer
// los datos leídos de Firestore (da igual si vinieron del SDK de cliente o
// del Admin SDK).
//
// No reemplaza todavía el useMemo de ClienteApp.jsx — ese cambio se hace
// aparte, para no tocar el flujo del cliente en el mismo paso que se crea
// esta función.

const DAY_NAMES_MON_FIRST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SLOT_STEP = 30; // minutos entre cada horario mostrado (09:00, 09:30, ...)

function timeToMin(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minToTime(min) {
  const h = Math.floor(min / 60).toString().padStart(2, '0');
  const m = (min % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** 'YYYY-MM-DD' -> nombre de día en español, lunes primero (mismo criterio que ClienteApp). */
function getDayName(fechaStr) {
  const date = new Date(fechaStr + 'T12:00:00');
  return DAY_NAMES_MON_FIRST[(date.getDay() + 6) % 7];
}

/**
 * Calcula las horas disponibles de un profesional en una fecha dada,
 * considerando su jornada (`availability`), las citas ya existentes y los
 * bloqueos administrativos. Misma lógica que ClienteApp.jsx: slots cada 30
 * minutos, se permite iniciar el servicio aunque termine después del cierre,
 * y un slot se descarta si se cruza con una cita o bloqueo existente.
 *
 * @param {Object} params
 * @param {string} params.fecha - 'YYYY-MM-DD'
 * @param {number} params.serviceDuration - minutos del servicio a reservar
 * @param {{availability?: Array<{day, status, start, end}>}} params.profesional
 * @param {Array<{date, time, duration, status, professionalId, barberId}>} params.citasDelNegocio
 *   - Todas las citas del negocio (se filtran acá por fecha + profesional; no
 *     hace falta que quien llama las filtre antes).
 * @param {Array<{date, barberId, professionalId, startTime, endTime}>} [params.bloqueos]
 * @param {boolean} [params.aplicarAnticipacion] - Si true, exige 30 min de
 *   anticipación cuando `fecha` es hoy (regla actual de ClienteApp; Admin/Barber
 *   no la usan, por eso es opcional).
 * @param {Date} [params.ahora] - Inyectable para pruebas; por defecto `new Date()`.
 * @returns {string[]} Horas disponibles, formato 'HH:MM'.
 */
export function getAvailableSlots({
  fecha,
  serviceDuration,
  profesional,
  citasDelNegocio = [],
  bloqueos = [],
  aplicarAnticipacion = false,
  ahora = new Date(),
}) {
  if (!fecha || !profesional) return [];

  const dayName = getDayName(fecha);
  const dayAvailability = (profesional.availability || []).find((a) => a?.day === dayName);
  if (!dayAvailability || dayAvailability.status !== 'Disponible') return [];

  const startOfDayMin = timeToMin(dayAvailability.start || '00:00');
  const endOfDayMin = timeToMin(dayAvailability.end || '00:00');
  if (Number.isNaN(startOfDayMin) || Number.isNaN(endOfDayMin) || endOfDayMin <= startOfDayMin) {
    return [];
  }

  const citasDelBarbero = citasDelNegocio.filter(
    (c) =>
      c?.date === fecha &&
      (c?.professionalId === profesional.id || c?.barberId === profesional.id) &&
      c?.status !== 'cancelled'
  );

  const bloqueosDelBarbero = bloqueos.filter(
    (b) => b?.date === fecha && (b?.barberId === profesional.id || b?.professionalId === profesional.id)
  );

  const todayStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
    ahora.getDate()
  ).padStart(2, '0')}`;
  const esHoy = fecha === todayStr;
  const nowMin = ahora.getHours() * 60 + ahora.getMinutes();
  const cumpleAnticipacion = (hourStr) =>
    !aplicarAnticipacion || !esHoy || timeToMin(hourStr) >= nowMin + 30;

  const hours = [];
  for (let slotStart = startOfDayMin; slotStart < endOfDayMin; slotStart += SLOT_STEP) {
    const hourStr = minToTime(slotStart);
    const slotEnd = slotStart + serviceDuration;

    if (!cumpleAnticipacion(hourStr)) continue;

    const seCruzaCita = citasDelBarbero.some((c) => {
      const cDuration = c?.duration || 30;
      const cStart = timeToMin(c?.time);
      const cEnd = cStart + cDuration;
      return slotStart < cEnd && slotEnd > cStart;
    });
    if (seCruzaCita) continue;

    const seCruzaBloqueo = bloqueosDelBarbero.some((b) => {
      const bStart = timeToMin(b?.startTime);
      const bEnd = timeToMin(b?.endTime);
      return slotStart < bEnd && slotEnd > bStart;
    });
    if (seCruzaBloqueo) continue;

    hours.push(hourStr);
  }

  return hours;
}