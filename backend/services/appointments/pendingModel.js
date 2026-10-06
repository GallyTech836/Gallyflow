// pendingModel.js
//
// Copia intencional de src/shared/appointments/pendingModel.js (mismo patrón que
// availability.js: Railway puede no ver src/). Si cambias una, cambia la otra.
//
// Fuente única de la lógica de citas "Pendiente" (reserva sin profesional).
// Pendiente = cita con professionalId/barberId === 'pending'. Es solo un
// indicador visual: NUNCA bloquea horario ni resta capacidad. Aquí solo se
// calcula quién es CANDIDATO (activo + hace el servicio + libre a esa hora).
//
// Funciones puras, sin React ni Firebase.

export const PENDING_ID = 'pending';

const DAY_NAMES_MON_FIRST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function timeToMin(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getDayName(fechaStr) {
  const date = new Date(fechaStr + 'T12:00:00');
  return DAY_NAMES_MON_FIRST[(date.getDay() + 6) % 7];
}

/** ¿La cita es una Pendiente (sin profesional) y sigue viva? */
export function isOpenPendingCita(cita) {
  if (!cita) return false;
  const sinPro = cita.professionalId === PENDING_ID || cita.barberId === PENDING_ID;
  return sinPro && cita.status !== 'cancelled' && cita.status !== 'completed';
}

/** IDs de servicios que realiza un profesional (acepta objetos o strings). */
export function getProfessionalServiceIds(professional) {
  return new Set(
    (Array.isArray(professional?.services) ? professional.services : [])
      .map((a) => (typeof a === 'string' ? a : a?.serviceId))
      .filter(Boolean)
      .map(String)
  );
}

/** ¿El profesional realiza TODOS los servicios indicados? */
export function professionalCanDo(professional, serviceIds = []) {
  const own = getProfessionalServiceIds(professional);
  if (own.size === 0) return false;
  return serviceIds.every((id) => own.has(String(id)));
}

/** IDs de servicio de una cita (esquema nuevo services[] o legacy serviceId). */
export function getCitaServiceIds(cita) {
  if (Array.isArray(cita?.services) && cita.services.length > 0) {
    return cita.services.map((s) => s?.serviceId).filter(Boolean).map(String);
  }
  return cita?.serviceId ? [String(cita.serviceId)] : [];
}

/**
 * ¿El profesional está libre en `fecha` desde `time` durante `duration` min?
 * Respeta: horario del profesional, horario del negocio, otras citas
 * (canceladas no cuentan; las Pendiente no cuentan porque no tienen su id)
 * y bloqueos. Mismo criterio que ClienteApp: el servicio puede terminar
 * después del cierre, pero debe EMPEZAR dentro de la jornada.
 */
export function isProfessionalFreeAt({
  professional,
  fecha,
  time,
  duration,
  citas = [],
  bloqueos = [],
  businessSchedule = [],
  ignoreCitaId = null,
}) {
  if (!professional || !fecha || !time) return false;

  const dayName = getDayName(fecha);
  const dayAvailability = (professional.availability || []).find((a) => a?.day === dayName);
  if (!dayAvailability || dayAvailability.status !== 'Disponible') return false;

  const businessDay = (businessSchedule || []).find((d) => d?.day === dayName);
  if (businessDay && businessDay.status !== 'Disponible') return false;

  const proStart = timeToMin(dayAvailability.start || '00:00');
  const proEnd = timeToMin(dayAvailability.end || '00:00');
  const bizStart = businessDay ? timeToMin(businessDay.start || '00:00') : 0;
  const bizEnd = businessDay ? timeToMin(businessDay.end || '23:59') : 24 * 60 - 1;
  const dayStart = Math.max(proStart, bizStart);
  const dayEnd = Math.min(proEnd, bizEnd);
  if (Number.isNaN(dayStart) || Number.isNaN(dayEnd) || dayEnd <= dayStart) return false;

  const slotStart = timeToMin(time);
  const slotEnd = slotStart + (Number(duration) > 0 ? Number(duration) : 30);
  if (slotStart < dayStart || slotStart >= dayEnd) return false;

  const choca = citas.some((c) => {
    if (!c || c.id === ignoreCitaId || c.date !== fecha || c.status === 'cancelled') return false;
    if (c.professionalId !== professional.id && c.barberId !== professional.id) return false;
    const cStart = timeToMin(c.time);
    const cEnd = cStart + (c.duration || 30);
    return slotStart < cEnd && slotEnd > cStart;
  });
  if (choca) return false;

  const bloqueado = bloqueos.some((b) => {
    if (!b || b.date !== fecha) return false;
    if (b.barberId !== professional.id && b.professionalId !== professional.id && b.barber !== professional.id) {
      return false;
    }
    return slotStart < timeToMin(b.endTime) && slotEnd > timeToMin(b.startTime);
  });
  return !bloqueado;
}

/**
 * Candidatos de una Pendiente: activos + hacen el servicio + libres a esa hora.
 * `serviceIds` vacío => cualquier profesional que haga al menos un servicio.
 */
export function getPendingCandidates({
  professionals = [],
  serviceIds = [],
  fecha,
  time,
  duration,
  citas = [],
  bloqueos = [],
  businessSchedule = [],
  ignoreCitaId = null,
}) {
  return professionals.filter((p) => {
    if (!p || p.active === false) return false;
    const hacesServicio =
      serviceIds.length > 0 ? professionalCanDo(p, serviceIds) : getProfessionalServiceIds(p).size > 0;
    if (!hacesServicio) return false;
    return isProfessionalFreeAt({ professional: p, fecha, time, duration, citas, bloqueos, businessSchedule, ignoreCitaId });
  });
}

/**
 * Regla de asignación automática: SOLO si queda exactamente un candidato.
 * Con 2 o más decide el administrador; con 0 sigue Pendiente.
 * Nunca elige por carga de trabajo.
 */
export function pickAutoAssignee(candidates = []) {
  return candidates.length === 1 ? candidates[0] : null;
}
