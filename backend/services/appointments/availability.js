// availability.js
//
// Copia intencional de src/shared/appointments/availability.js — mismo
// patrón que ya usa getNegocioSlug() (frontend: src/utils/negocio.js,
// backend: backend/routes/superadmin.routes.js). Se duplica en vez de
// importarse desde src/shared/ porque no está garantizado que Railway
// tenga visibilidad sobre esa carpeta si el "Root Directory" del deploy
// apunta a backend/. Si cambias la regla de negocio de disponibilidad,
// actualiza este archivo Y el de src/shared/ en el mismo cambio.

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

function getDayName(fechaStr) {
  const date = new Date(fechaStr + 'T12:00:00');
  return DAY_NAMES_MON_FIRST[(date.getDay() + 6) % 7];
}

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