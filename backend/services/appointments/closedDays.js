// closedDays.js
//
// Días cerrados / feriados del negocio (businessSettings.closedDays).
// Copia intencional de src/shared/businessSettings/closedDaysModel.js (Railway
// puede no ver src/). Si cambias una, cambia la otra: tests/closedDays.test.js
// verifica que sean iguales.
//
// Funciones puras, sin React ni Firebase.
//
// Forma guardada (todo dentro de negocios/{id}.businessSettings):
//   closedDays: [{
//     id: 'cd_...',
//     start: 'YYYY-MM-DD',   // primer día cerrado
//     end: 'YYYY-MM-DD',     // último día cerrado (= start si es un solo día)
//     reason: 'Feriado',     // opcional
//     branch: '',            // '' = todo el negocio; si no, nombre de la sucursal
//     branchId: '',          // id de la sucursal (opcional, por si cambia el nombre)
//     openStart: '', openEnd: '', // opcional: HORARIO ESPECIAL. Si están los dos, ese
//                                 // día NO está cerrado: solo se atiende de openStart a
//                                 // openEnd (ej. 08:00–12:00). Vacíos = cerrado todo el día.
//   }]

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DIAS_CERRADOS = 200;
const MAX_RANGO_DIAS = 62; // un rango no puede durar más de ~2 meses

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function diasEntre(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function nuevoId() {
  return `cd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Limpia lo guardado en Firestore. Entradas inválidas se descartan. */
export function normalizeClosedDays(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    const start = texto(r?.start || r?.date, 10);
    if (!FECHA_RE.test(start)) continue;
    let end = texto(r?.end, 10);
    if (!FECHA_RE.test(end) || end < start) end = start;
    if (diasEntre(start, end) > MAX_RANGO_DIAS) continue;
    // Horario especial: válido solo si las dos horas existen y fin > inicio.
    let openStart = texto(r?.openStart, 5);
    let openEnd = texto(r?.openEnd, 5);
    if (!HORA_RE.test(openStart) || !HORA_RE.test(openEnd) || openEnd <= openStart) {
      openStart = '';
      openEnd = '';
    }
    out.push({
      id: texto(r?.id, 40) || nuevoId(),
      start,
      end,
      reason: texto(r?.reason, 60),
      branch: texto(r?.branch, 120),
      branchId: texto(r?.branchId, 80),
      openStart,
      openEnd,
    });
  }
  out.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  return out.slice(-MAX_DIAS_CERRADOS);
}

/** ¿El cierre aplica a esta sucursal? Sin sucursal en el cierre = todo el negocio. */
function aplicaASucursal(cierre, branch) {
  if (!cierre.branch && !cierre.branchId) return true;
  if (!branch) return false;
  return cierre.branch === branch || (!!cierre.branchId && cierre.branchId === branch);
}

/** ¿La entrada es un horario especial (atiende solo unas horas) y no un cierre total? */
export function isSpecialHours(c) {
  return !!(c && c.openStart && c.openEnd);
}

function entradasDelDia(closedDays, fecha, branch) {
  if (!Array.isArray(closedDays) || !closedDays.length || !FECHA_RE.test(String(fecha || ''))) return [];
  return closedDays.filter((c) => c && c.start <= fecha && fecha <= (c.end || c.start) && aplicaASucursal(c, branch));
}

/**
 * Cierre de DÍA COMPLETO que afecta a `fecha` ('YYYY-MM-DD') para `branch`
 * (nombre o id de la sucursal; null = solo cuentan los de todo el negocio).
 * Devuelve el cierre o null. Un horario especial no cuenta como cerrado.
 */
export function findClosure(closedDays, fecha, branch = null) {
  return entradasDelDia(closedDays, fecha, branch).find((c) => !isSpecialHours(c)) || null;
}

/**
 * Horario especial de `fecha` (solo se atiende de openStart a openEnd), o null.
 * Si el día además tiene un cierre completo, manda el cierre (devuelve null).
 */
export function findSpecialHours(closedDays, fecha, branch = null) {
  const del = entradasDelDia(closedDays, fecha, branch);
  if (del.some((c) => !isSpecialHours(c))) return null;
  const esp = del.filter(isSpecialHours);
  if (!esp.length) return null;
  // Varios en el mismo día: se toma el más restrictivo (intersección).
  const openStart = esp.reduce((m, c) => (c.openStart > m ? c.openStart : m), '00:00');
  const openEnd = esp.reduce((m, c) => (c.openEnd < m ? c.openEnd : m), '23:59');
  return { ...esp[0], openStart, openEnd };
}

export function isClosedOn(closedDays, fecha, branch = null) {
  return findClosure(closedDays, fecha, branch) !== null;
}

/** Texto corto: "Feriado" / "Cerrado" / "Horario especial". */
export function closureLabel(cierre) {
  return cierre?.reason || (isSpecialHours(cierre) ? 'Horario especial' : 'Cerrado');
}

/** "20 oct" o "24 – 26 dic" para listas. */
export function closureRangeLabel(cierre) {
  if (!cierre) return '';
  const fmt = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
  return cierre.end && cierre.end !== cierre.start ? `${fmt(cierre.start)} – ${fmt(cierre.end)}` : fmt(cierre.start);
}

export { nuevoId as newClosureId };
