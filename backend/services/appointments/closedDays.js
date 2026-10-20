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
//   }]

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
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
    out.push({
      id: texto(r?.id, 40) || nuevoId(),
      start,
      end,
      reason: texto(r?.reason, 60),
      branch: texto(r?.branch, 120),
      branchId: texto(r?.branchId, 80),
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

/**
 * Cierre que afecta a `fecha` ('YYYY-MM-DD') para `branch` (nombre o id de la
 * sucursal; null = solo cuentan los cierres de todo el negocio).
 * Devuelve el cierre o null.
 */
export function findClosure(closedDays, fecha, branch = null) {
  if (!Array.isArray(closedDays) || !closedDays.length || !FECHA_RE.test(String(fecha || ''))) return null;
  return closedDays.find((c) => c && c.start <= fecha && fecha <= (c.end || c.start) && aplicaASucursal(c, branch)) || null;
}

export function isClosedOn(closedDays, fecha, branch = null) {
  return findClosure(closedDays, fecha, branch) !== null;
}

/** Texto corto del cierre: "Feriado" / "Cerrado". */
export function closureLabel(cierre) {
  return cierre?.reason || 'Cerrado';
}

/** "20 oct" o "24 – 26 dic" para listas. */
export function closureRangeLabel(cierre) {
  if (!cierre) return '';
  const fmt = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
  return cierre.end && cierre.end !== cierre.start ? `${fmt(cierre.start)} – ${fmt(cierre.end)}` : fmt(cierre.start);
}

export { nuevoId as newClosureId };
