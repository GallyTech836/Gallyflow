// calendarGrid.js — celdas del calendario mensual (lunes a domingo).
// Funciones puras (sin React), probadas en tests/calendarGrid.test.js.
// Mismo resultado que el getMonthDays que usaba la agenda del AdminApp.

const pad2 = (n) => String(n).padStart(2, '0');

export const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const MONTH_CARDS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * Celdas del mes de `dateStr` ('AAAA-MM-DD'): primero los huecos hasta el
 * lunes ({ isCurrentMonth: false }) y luego cada día
 * ({ isCurrentMonth: true, dayNum, dateStr }).
 */
export function monthDays(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return [];
  const [y, m] = dateStr.split('-').map(Number);
  if (!y || !m) return [];
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = domingo
  const offset = first === 0 ? 6 : first - 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: offset }, () => ({ isCurrentMonth: false }));
  for (let d = 1; d <= last; d++) days.push({ isCurrentMonth: true, dayNum: d, dateStr: `${y}-${pad2(m)}-${pad2(d)}` });
  return days;
}
