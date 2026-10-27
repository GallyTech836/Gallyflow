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

/** Rango del periodo de la lista: 'hoy' | 'semana' (últimos 7 días) | 'mes' (mes actual). */
export function periodRange(period, today = todayKey()) {
  if (period === 'semana') return { from: shiftDay(today, -6), to: today };
  if (period === 'mes') return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: today, to: today };
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

/** ¿Puede este profesional cambiarlo? (mismo criterio que el backend). */
export function barberCanEdit(registro, uid) {
  return !!registro && registro.status !== 'cancelled' && registro.professionalId === uid
    && registro.date === todayKey() && !registro.commissionPaid && !registro.cashSessionId;
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
