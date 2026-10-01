// Configuración general del negocio (horario de apertura + tiempo de
// anticipación para reservar) — vive en negocios/{id}.businessSettings.
// Por defecto no restringe nada (abierto 24h, sin anticipación mínima),
// así que un negocio que nunca toque esta pantalla sigue funcionando
// exactamente igual que antes de que existiera esta función.

export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DEFAULT_PAYMENT_METHODS = ['Efectivo', 'Tarjeta', 'Transferencia'];

export const DEFAULT_BUSINESS_SETTINGS = {
  schedule: DAY_NAMES.map((day) => ({ day, status: 'Disponible', start: '00:00', end: '23:59' })),
  minAdvanceMinutes: 0,
  paymentMethods: [...DEFAULT_PAYMENT_METHODS],
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeDay(raw, day) {
  const status = raw?.status === 'Cerrado' ? 'Cerrado' : 'Disponible';
  const start = TIME_RE.test(raw?.start) ? raw.start : '00:00';
  const end = TIME_RE.test(raw?.end) ? raw.end : '23:59';
  return { day, status, start, end };
}

export function normalizeBusinessSettings(raw) {
  const rawSchedule = Array.isArray(raw?.schedule) ? raw.schedule : [];
  const schedule = DAY_NAMES.map((day) => {
    const found = rawSchedule.find((d) => d?.day === day);
    return normalizeDay(found, day);
  });
  const minAdvanceMinutes = Number.isFinite(raw?.minAdvanceMinutes) && raw.minAdvanceMinutes >= 0
    ? Math.round(raw.minAdvanceMinutes)
    : 0;
  const rawMethods = Array.isArray(raw?.paymentMethods)
    ? raw.paymentMethods.map((m) => (typeof m === 'string' ? m.trim() : '')).filter(Boolean)
    : [];
  const paymentMethods = rawMethods.length > 0 ? [...new Set(rawMethods)] : [...DEFAULT_PAYMENT_METHODS];
  return { schedule, minAdvanceMinutes, paymentMethods };
}
