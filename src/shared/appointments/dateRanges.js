// Rangos de fechas para acotar las consultas de Firestore (citas y horariosBloqueados).
// Las fechas se guardan como 'YYYY-MM-DD', así que se comparan como texto.
// Vistas: 'dia' | 'semana' | 'mes' | 'año'  (la semana va de lunes a domingo).

const pad = (n) => String(n).padStart(2, '0');

export const formatYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseYMD = (s) => {
  if (!s || typeof s !== 'string') return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
};

// Mismo criterio que usan el calendario, Dashboard y Analítica del AdminApp.
export function getPeriodRange(dateStr, view) {
  const ref = parseYMD(dateStr);

  if (view === 'semana') {
    const day = ref.getDay();
    const start = new Date(ref);
    start.setDate(ref.getDate() - day + (day === 0 ? -6 : 1));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: formatYMD(start), end: formatYMD(end) };
  }
  if (view === 'mes') {
    return {
      start: formatYMD(new Date(ref.getFullYear(), ref.getMonth(), 1)),
      end: formatYMD(new Date(ref.getFullYear(), ref.getMonth() + 1, 0))
    };
  }
  if (view === 'año') {
    return { start: `${ref.getFullYear()}-01-01`, end: `${ref.getFullYear()}-12-31` };
  }
  // 'dia'
  const d = formatYMD(ref);
  return { start: d, end: d };
}

// Fecha de referencia del período inmediatamente anterior (para "vs período anterior").
export function getPreviousPeriodRefDate(dateStr, view) {
  const date = parseYMD(dateStr);
  if (view === 'dia') date.setDate(date.getDate() - 1);
  else if (view === 'semana') date.setDate(date.getDate() - 7);
  else if (view === 'mes') { date.setDate(1); date.setMonth(date.getMonth() - 1); } // día 1 primero: evita que el 31 salte de mes
  else if (view === 'año') date.setFullYear(date.getFullYear() - 1);
  return formatYMD(date);
}

// Rango del período inmediatamente anterior.
export function getPreviousPeriodRange(dateStr, view) {
  return getPeriodRange(getPreviousPeriodRefDate(dateStr, view), view);
}

// Rango de las 42 celdas visibles de la grilla mensual (lunes a domingo, incluye días de meses vecinos).
export function getMonthGridRange(dateStr) {
  const ref = parseYMD(dateStr);
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  let offset = first.getDay() - 1;
  if (offset < 0) offset = 6;
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1 - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 41);
  return { start: formatYMD(start), end: formatYMD(end) };
}
