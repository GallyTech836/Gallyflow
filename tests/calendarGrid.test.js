// Celdas del calendario mensual compartido (agenda del AdminApp y
// "Servicios registrados"). Ejecutar (desde la raíz):  npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { monthDays, WEEKDAY_HEADERS, MONTH_CARDS } from '../src/shared/calendar/calendarGrid.js';

// Copia del getMonthDays que tenía AdminApp.jsx (fechas locales), para
// comprobar que el compartido da exactamente lo mismo.
function agendaMonthDays(dateStr) {
  const [y0, m0, d0] = dateStr.split('-').map(Number);
  const date = new Date(y0, m0 - 1, d0);
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < startOffset; i++) days.push({ isCurrentMonth: false });
  for (let i = 1; i <= lastDay; i++) {
    const dd = new Date(year, month, i);
    const f = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
    days.push({ isCurrentMonth: true, dayNum: i, dateStr: f });
  }
  return days;
}

describe('calendario mensual', () => {
  test('lunes a domingo y 12 meses', () => {
    assert.deepEqual(WEEKDAY_HEADERS, ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
    assert.equal(MONTH_CARDS.length, 12);
  });

  test('octubre 2026 empieza jueves: 3 huecos y 31 días', () => {
    const d = monthDays('2026-10-15');
    assert.equal(d.filter((x) => !x.isCurrentMonth).length, 3);
    assert.equal(d.filter((x) => x.isCurrentMonth).length, 31);
    assert.deepEqual(d[3], { isCurrentMonth: true, dayNum: 1, dateStr: '2026-10-01' });
    assert.equal(d.at(-1).dateStr, '2026-10-31');
  });

  test('mes que empieza en domingo (6 huecos) y en lunes (ninguno); febrero bisiesto', () => {
    assert.equal(monthDays('2026-02-01').filter((x) => !x.isCurrentMonth).length, 6); // 1 feb 2026: domingo
    assert.equal(monthDays('2026-06-01').filter((x) => !x.isCurrentMonth).length, 0); // 1 jun 2026: lunes
    assert.equal(monthDays('2028-02-10').filter((x) => x.isCurrentMonth).length, 29);
  });

  test('igual al calendario que tenía la agenda, en todos los meses de 2025 a 2028', () => {
    for (let y = 2025; y <= 2028; y++) {
      for (let m = 1; m <= 12; m++) {
        const key = `${y}-${String(m).padStart(2, '0')}-15`;
        assert.deepEqual(monthDays(key), agendaMonthDays(key), key);
      }
    }
  });

  test('fecha inválida: sin celdas', () => {
    assert.deepEqual(monthDays(''), []);
    assert.deepEqual(monthDays(null), []);
  });
});
