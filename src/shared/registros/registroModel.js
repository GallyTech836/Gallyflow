// registroModel.js
//
// Piezas puras (sin React ni Firebase) del registro de servicios del plan
// Nexus Control. Un registro es una cita con origin: 'registro' que crea el
// backend (POST /api/servicios-registrados). Aquí solo hay ayudas de
// pantalla: el precio y la comisión los calcula siempre el servidor.

export const REGISTRO_ORIGIN = 'registro';
export const MAX_BACKDATE_DAYS = 7; // igual que el backend
export const GENERAL_CLIENT = 'Cliente general';
const TZ = 'America/La_Paz';

/** ¿Es un registro de servicio? (las citas normales no tienen `origin`). */
export function isRegistro(cita) {
  return cita?.origin === REGISTRO_ORIGIN;
}

/** Identificador de la solicitud: el backend lo usa como id (reintentos no duplican). */
export function newRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Método de pago por defecto: Efectivo si el negocio lo tiene; si no, el primero. */
export function defaultPaymentMethod(methods = []) {
  const list = (methods || []).filter(Boolean);
  return list.find((m) => String(m).trim().toLowerCase() === 'efectivo') || list[0] || 'Efectivo';
}

/** 'AAAA-MM-DD' de hoy en la hora del negocio. */
export function todayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function shiftDay(key, days) {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** 'DD/MM' de un 'AAAA-MM-DD'. */
export function dayLabel(key) {
  return key ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : '';
}

// ───────────────────────── Periodos de la lista ─────────────────────────
// 'dia' | 'semana' (lunes a domingo) | 'mes' | 'año', siempre de calendario.
// `ref` es cualquier día ('AAAA-MM-DD') dentro del periodo que se mira.

export const PERIODS = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'año', label: 'Año' },
];

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const pad2 = (n) => String(n).padStart(2, '0');
const parts = (key) => ({ y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)), d: Number(key.slice(8, 10)) });
const weekday = (key) => new Date(`${key}T12:00:00Z`).getUTCDay();
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** { from, to } del periodo que contiene `ref`. */
export function periodRange(period, ref = todayKey()) {
  const { y, m } = parts(ref);
  if (period === 'semana') {
    const from = shiftDay(ref, -((weekday(ref) + 6) % 7)); // lunes
    return { from, to: shiftDay(from, 6) };
  }
  if (period === 'mes') return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(lastDay(y, m))}` };
  if (period === 'año') return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: ref, to: ref };
}

/** Día de referencia del periodo anterior (dir -1) o siguiente (dir 1). */
export function shiftPeriod(period, ref, dir) {
  const { y, m } = parts(ref);
  if (period === 'semana') return shiftDay(periodRange('semana', ref).from, 7 * dir);
  if (period === 'mes') {
    const t = new Date(Date.UTC(y, m - 1 + dir, 1));
    return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-01`;
  }
  if (period === 'año') return `${y + dir}-01-01`;
  return shiftDay(ref, dir);
}

/** ¿Hay periodo siguiente? (nunca se va al futuro). */
export function canGoNext(period, ref, today = todayKey()) {
  return periodRange(period, shiftPeriod(period, ref, 1)).from <= today;
}

/** Al pasar a otro periodo: se queda en el día que se miraba (nunca futuro). */
export function clampRef(ref, today = todayKey()) {
  return ref > today ? today : ref;
}

/** "Martes 27 oct" (con año si no es el de `today`). */
export function dayTitle(key, today = todayKey()) {
  const { y, m, d } = parts(key);
  return `${cap(WEEKDAYS_LONG[weekday(key)])} ${d} ${MONTHS_SHORT[m - 1]}${String(y) !== today.slice(0, 4) ? ` ${y}` : ''}`;
}

/** "Octubre" de 'AAAA-MM'. */
export function monthName(month) {
  return cap(MONTHS[Number(month.slice(5, 7)) - 1] || '');
}

/** Texto del periodo: "Hoy · 29 oct", "26 oct – 1 nov 2026", "Octubre 2026", "2026". */
export function periodLabel(period, ref, today = todayKey()) {
  const { y, m } = parts(ref);
  if (period === 'año') return String(y);
  if (period === 'mes') return `${monthName(ref.slice(0, 7))} ${y}`;
  if (period === 'semana') {
    const { from, to } = periodRange('semana', ref);
    const a = parts(from);
    const b = parts(to);
    const left = a.y !== b.y ? `${a.d} ${MONTHS_SHORT[a.m - 1]} ${a.y}`
      : a.m !== b.m ? `${a.d} ${MONTHS_SHORT[a.m - 1]}` : `${a.d}`;
    return `${left} – ${b.d} ${MONTHS_SHORT[b.m - 1]} ${b.y}`;
  }
  const short = `${parts(ref).d} ${MONTHS_SHORT[m - 1]}`;
  if (ref === today) return `Hoy · ${short}`;
  if (ref === shiftDay(today, -1)) return `Ayer · ${short}`;
  return dayTitle(ref, today);
}

/**
 * Registros agrupados por día, del más reciente al más antiguo. Cada grupo:
 * { date, items, ...summarize(items) }. Días sin registros no aparecen.
 * Dentro del día se respeta el orden recibido (más nuevo primero).
 */
export function groupByDay(registros = []) {
  const map = new Map();
  for (const r of registros) {
    if (!r?.date) continue;
    if (!map.has(r.date)) map.set(r.date, []);
    map.get(r.date).push(r);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items, ...summarize(items) }));
}

// Dónde quedó un registro con otra fecha respecto de la caja (lo decide el backend).
export const CASH_PLACEMENT_TEXT = {
  'caja-abierta': 'Entró en la caja abierta.',
  'proxima-caja': 'Entrará en la próxima caja que se abra.',
  'fuera-de-caja': 'La caja de ese día ya estaba cerrada: no se sumó a ninguna caja.',
  'sin-caja': 'El negocio no tenía caja abierta ese día.',
};

/**
 * ¿Hace falta PIN para corregir/anular? (el backend lo valida igual; esto
 * solo decide si se muestra el campo). Caja cerrada, comisión pagada o
 * registro con otra fecha que quedó fuera de caja.
 */
export function needsPin(registro) {
  return !!registro?.cashSessionId || registro?.commissionPaid === true || registro?.cashPlacement === 'fuera-de-caja';
}

/** Totales de una lista de registros (los anulados no cuentan). */
export function summarize(registros = []) {
  const vivos = registros.filter((r) => r?.status !== 'cancelled');
  const sum = (fn) => Math.round(vivos.reduce((a, r) => a + (Number(fn(r)) || 0), 0) * 100) / 100;
  const commission = (r) => r?.commissionSnapshot?.amount;
  return {
    count: vivos.length,
    voided: registros.length - vivos.length,
    total: sum((r) => r.price),
    commission: sum(commission),
    commissionPaid: sum((r) => (r.commissionPaid ? commission(r) : 0)),
    commissionPending: sum((r) => (r.commissionPaid ? 0 : commission(r))),
  };
}

const FIELD_LABELS = {
  professionalId: 'Profesional', clientId: 'Cliente', clientName: 'Cliente', services: 'Servicios', price: 'Importe',
  paymentMethod: 'Método de pago', branch: 'Sucursal', commissionAmount: 'Comisión', status: 'Estado',
};

/** Texto de un cambio del historial ({ field, before, after }). */
export function describeChange(change, { professionals = [] } = {}) {
  const name = (id) => professionals.find((p) => p.id === id)?.name || id || '—';
  const fmt = (v) => {
    if (change.field === 'professionalId') return name(v);
    if (change.field === 'services') return (v || []).map((s) => s.serviceName).join(' + ') || '—';
    if (change.field === 'price' || change.field === 'commissionAmount') return `Bs ${Number(v) || 0}`;
    if (change.field === 'status') return v === 'cancelled' ? 'Anulado' : 'Registrado';
    if (change.field === 'clientId') return v ? 'cliente elegido' : GENERAL_CLIENT;
    return v === null || v === undefined || v === '' ? '—' : String(v);
  };
  return `${FIELD_LABELS[change.field] || change.field}: ${fmt(change.before)} → ${fmt(change.after)}`;
}
