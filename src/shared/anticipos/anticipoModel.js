// anticipoModel.js — Anticipos por QR (lógica pura, sin Firestore).
// Copia idéntica en src/shared/anticipos/anticipoModel.js: si cambia uno, cambiar el otro.
//
// Configuración: negocios/{id}.businessSettings.anticipos
//   { enabled, mode: 'percent'|'fixed', value, minutes, method, qrImage, instructions, phone, excludedServiceIds[] }
//   phone: WhatsApp para mandar el comprobante (si está vacío, el de la sucursal)
//
// En la cita (lo escribe solo el backend):
//   deposit: { amount, method, status, expiresAt, createdAt, paidAt?, verifiedBy?, resolvedAt?, resolvedBy? }
//   status del anticipo:
//     awaiting  la reserva espera el anticipo (cita 'pending', ocupa el horario hasta expiresAt)
//     paid      el dueño confirmó que llegó (cita 'confirmed')
//     expired   no se pagó a tiempo: la cita se canceló sola y el horario quedó libre
//     rejected  el dueño la rechazó (no llegó el pago)
//     refunded  la cita se canceló y el dueño devolvió el anticipo
//     retained  la cita se canceló (o no vino) y el dueño se quedó con el anticipo: es ingreso del negocio

export const DEPOSIT_STATUS = {
  AWAITING: 'awaiting', PAID: 'paid', EXPIRED: 'expired', REJECTED: 'rejected', REFUNDED: 'refunded', RETAINED: 'retained',
};

export const DEPOSIT_LABELS = {
  awaiting: 'Espera anticipo',
  paid: 'Anticipo pagado',
  expired: 'Anticipo vencido',
  rejected: 'Anticipo rechazado',
  refunded: 'Anticipo devuelto',
  retained: 'Anticipo retenido',
};

export const MIN_MINUTES = 10;
export const MAX_MINUTES = 24 * 60;

export const ANTICIPO_DEFAULTS = {
  enabled: false, mode: 'percent', value: 50, minutes: 30, method: '', qrImage: '', instructions: '', phone: '', excludedServiceIds: [],
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function toMs(v) {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return null;
}

/** Configuración limpia. El método del anticipo debe ser uno de los métodos del negocio que no sea efectivo. */
export function normalizeAnticipoConfig(raw, paymentMethods = []) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const mode = c.mode === 'fixed' ? 'fixed' : 'percent';
  let value = Number(c.value);
  if (!Number.isFinite(value) || value <= 0) value = ANTICIPO_DEFAULTS.value;
  if (mode === 'percent') value = Math.min(100, Math.max(1, Math.round(value)));
  else value = r2(value);
  let minutes = Math.round(Number(c.minutes));
  if (!Number.isFinite(minutes)) minutes = ANTICIPO_DEFAULTS.minutes;
  minutes = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, minutes));
  const noCash = (paymentMethods || []).map((m) => String(m || '').trim()).filter((m) => m && !/^efectivo$/i.test(m) && m !== 'Pendiente');
  const method = noCash.includes(c.method) ? c.method : (noCash.find((m) => /qr/i.test(m)) || noCash[0] || '');
  return {
    enabled: c.enabled === true,
    mode, value, minutes, method,
    qrImage: typeof c.qrImage === 'string' && /^https:\/\//.test(c.qrImage.trim()) ? c.qrImage.trim() : '',
    instructions: typeof c.instructions === 'string' ? c.instructions.trim().slice(0, 300) : '',
    phone: typeof c.phone === 'string' && /^[0-9+()\s-]{6,25}$/.test(c.phone.trim()) ? c.phone.trim() : '',
    excludedServiceIds: [...new Set((Array.isArray(c.excludedServiceIds) ? c.excludedServiceIds : []).map(String).filter(Boolean))].slice(0, 200),
  };
}

/** ¿Está lista para pedir anticipos? (activada, con QR y con método) */
export const anticipoReady = (cfg) => !!(cfg?.enabled && cfg.qrImage && cfg.method);

/**
 * Monto del anticipo de una reserva.
 *   services: [{ serviceId, price }] ya con el precio del profesional
 *   total:    precio final de la cita (con promociones)
 * Los servicios marcados como excepción no piden anticipo. Se redondea al Bs de arriba.
 */
export function depositAmountFor(cfg, services = [], total = 0) {
  if (!anticipoReady(cfg)) return 0;
  const excluded = new Set(cfg.excludedServiceIds || []);
  const all = services.reduce((t, s) => t + (Number(s?.price) || 0), 0);
  const incl = services.filter((s) => !excluded.has(String(s?.serviceId))).reduce((t, s) => t + (Number(s?.price) || 0), 0);
  if (!(incl > 0) || !(total > 0)) return 0;
  const base = all > 0 ? (incl / all) * total : total; // la promo se reparte en proporción
  const amount = cfg.mode === 'fixed' ? Math.min(cfg.value, base) : (base * cfg.value) / 100;
  return Math.min(Math.ceil(r2(amount)), Math.floor(total)) || 0;
}

/** Reserva que esperaba el anticipo y ya venció: no ocupa el horario. */
export function holdExpired(cita, nowMs = Date.now()) {
  const d = cita?.deposit;
  if (!d || d.status !== DEPOSIT_STATUS.AWAITING || cita.status !== 'pending') return false;
  const exp = toMs(d.expiresAt);
  return exp !== null && exp <= nowMs;
}

/** ¿Esta cita ocupa su horario? (no cancelada y, si espera anticipo, sin vencer) */
export const citaOcupaHorario = (cita, nowMs = Date.now()) => !!cita && cita.status !== 'cancelled' && !holdExpired(cita, nowMs);

/** Anticipo ya cobrado que se descuenta del cobro al completar la cita. */
export function depositPaidAmount(cita) {
  const d = cita?.deposit;
  return d && d.status === DEPOSIT_STATUS.PAID ? r2(d.amount) : 0;
}
