// Formatos de Finanzas: montos en Bs sin decimales, con punto de miles.

export function bs(n) {
  const v = Math.round(Math.abs(Number(n) || 0));
  return `Bs ${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** Con signo − cuando es negativo. */
export const sbs = (n) => `${Number(n) < 0 ? '− ' : ''}${bs(n)}`;

/** Bs con dos decimales (para saldos que hay que cuadrar con el banco). */
export function bs2(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const sign = v < 0 ? '− ' : '';
  const abs = Math.abs(v);
  const ent = Math.floor(abs);
  const dec = Math.round((abs - ent) * 100);
  return `${sign}Bs ${String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(dec).padStart(2, '0')}`;
}

export function parseAmount(v) {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export const TYPE_OPTIONS = [
  { value: 'banco', label: 'Banco' },
  { value: 'billetera', label: 'Billetera digital' },
  { value: 'otra', label: 'Otra' },
];

export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/** Mes anterior de 'AAAA-MM'. */
export function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
