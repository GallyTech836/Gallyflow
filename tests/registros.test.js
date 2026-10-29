// Pruebas de las ayudas de pantalla del registro de servicios (Nexus Control).
// Ejecutar (desde la raíz):  npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRegistro, newRequestId, defaultPaymentMethod, periodRange, shiftDay, needsPin, summarize, describeChange, dayLabel,
  PERIODS, shiftPeriod, canGoNext, clampRef, periodLabel, dayTitle, monthName, groupByDay, countByDay,
} from '../src/shared/registros/registroModel.js';

describe('registroModel', () => {
  test('solo las citas con origin "registro" son registros', () => {
    assert.equal(isRegistro({ origin: 'registro' }), true);
    assert.equal(isRegistro({ status: 'completed' }), false);
    assert.equal(isRegistro(null), false);
  });

  test('requestId con formato UUID y distinto cada vez', () => {
    const a = newRequestId();
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.notEqual(a, newRequestId());
  });

  test('pago por defecto: Efectivo si existe; si no, el primero del negocio', () => {
    assert.equal(defaultPaymentMethod(['QR', 'efectivo']), 'efectivo');
    assert.equal(defaultPaymentMethod(['QR', 'Tarjeta']), 'QR');
    assert.equal(defaultPaymentMethod([]), 'Efectivo');
  });

  test('periodos de calendario: Día, Semana (lun–dom), Mes y Año', () => {
    assert.deepEqual(PERIODS.map((p) => p.label), ['Día', 'Semana', 'Mes', 'Año']);
    assert.deepEqual(periodRange('dia', '2026-10-27'), { from: '2026-10-27', to: '2026-10-27' });
    // 27 oct 2026 es martes: semana del lunes 26 al domingo 1 nov.
    assert.deepEqual(periodRange('semana', '2026-10-27'), { from: '2026-10-26', to: '2026-11-01' });
    assert.deepEqual(periodRange('semana', '2026-10-26'), { from: '2026-10-26', to: '2026-11-01' }); // lunes
    assert.deepEqual(periodRange('semana', '2026-11-01'), { from: '2026-10-26', to: '2026-11-01' }); // domingo
    assert.deepEqual(periodRange('mes', '2026-10-27'), { from: '2026-10-01', to: '2026-10-31' });
    assert.deepEqual(periodRange('mes', '2028-02-10'), { from: '2028-02-01', to: '2028-02-29' }); // bisiesto
    assert.deepEqual(periodRange('año', '2026-10-27'), { from: '2026-01-01', to: '2026-12-31' });
    assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
    assert.equal(dayLabel('2026-10-25'), '25/10');
  });

  test('anterior / siguiente en cada periodo', () => {
    assert.equal(shiftPeriod('dia', '2026-03-01', -1), '2026-02-28');
    assert.equal(shiftPeriod('semana', '2026-10-29', -1), '2026-10-19');
    assert.equal(shiftPeriod('semana', '2026-10-29', 1), '2026-11-02');
    assert.equal(shiftPeriod('mes', '2026-03-31', -1), '2026-02-01'); // el 31 no salta de mes
    assert.equal(shiftPeriod('mes', '2026-12-15', 1), '2027-01-01');
    assert.equal(shiftPeriod('mes', '2026-01-15', -1), '2025-12-01');
    assert.equal(shiftPeriod('año', '2026-10-27', -1), '2025-01-01');
  });

  test('nunca al futuro', () => {
    const hoy = '2026-10-29'; // jueves
    assert.equal(canGoNext('dia', hoy, hoy), false);
    assert.equal(canGoNext('dia', '2026-10-28', hoy), true);
    assert.equal(canGoNext('semana', '2026-10-26', hoy), false); // semana actual
    assert.equal(canGoNext('semana', '2026-10-25', hoy), true); // semana pasada
    assert.equal(canGoNext('mes', '2026-10-01', hoy), false);
    assert.equal(canGoNext('mes', '2026-09-30', hoy), true);
    assert.equal(canGoNext('año', '2026-01-01', hoy), false);
    assert.equal(canGoNext('año', '2025-06-01', hoy), true);
    // Al avanzar a la semana actual desde la pasada, la referencia no queda en el futuro.
    assert.equal(clampRef(shiftPeriod('semana', '2026-10-21', 1), hoy), '2026-10-26');
    assert.equal(clampRef('2026-11-02', hoy), hoy);
  });

  test('textos del periodo', () => {
    const hoy = '2026-10-29';
    assert.equal(periodLabel('dia', hoy, hoy), 'Hoy · 29 oct');
    assert.equal(periodLabel('dia', '2026-10-28', hoy), 'Ayer · 28 oct');
    assert.equal(periodLabel('dia', '2026-10-27', hoy), 'Martes 27 oct');
    assert.equal(periodLabel('dia', '2025-12-31', hoy), 'Miércoles 31 dic 2025');
    assert.equal(periodLabel('semana', hoy, hoy), '26 oct – 1 nov 2026');
    assert.equal(periodLabel('semana', '2026-10-14', hoy), '12 – 18 oct 2026');
    assert.equal(periodLabel('semana', '2026-12-30', hoy), '28 dic 2026 – 3 ene 2027');
    assert.equal(periodLabel('semana', '2025-12-31', hoy), '29 dic 2025 – 4 ene 2026');
    assert.equal(periodLabel('mes', hoy, hoy), 'Octubre 2026');
    assert.equal(periodLabel('año', hoy, hoy), '2026');
    assert.equal(dayTitle('2026-10-27', hoy), 'Martes 27 oct');
    assert.equal(dayTitle('2026-11-01', hoy), 'Domingo 1 nov');
    assert.equal(monthName('2026-09'), 'Septiembre');
  });

  test('agrupado por día: más reciente primero, con cantidad y total; los anulados no suman', () => {
    const g = groupByDay([
      { id: 'a', date: '2026-10-27', price: 50, status: 'completed' },
      { id: 'b', date: '2026-10-29', price: 30, status: 'completed' },
      { id: 'c', date: '2026-10-27', price: 20, status: 'cancelled' },
      { id: 'd', date: '2026-10-27', price: 40, status: 'completed' },
    ]);
    assert.deepEqual(g.map((x) => x.date), ['2026-10-29', '2026-10-27']); // el 28 no tiene: no aparece
    assert.deepEqual(g[1].items.map((r) => r.id), ['a', 'c', 'd']); // orden recibido
    assert.equal(g[1].count, 2);
    assert.equal(g[1].total, 90);
    assert.equal(g[0].total, 30);
    assert.deepEqual(groupByDay([]), []);
  });

  test('cantidad por día para el calendario del Mes (sin anulados)', () => {
    const c = countByDay([
      { date: '2026-10-27', status: 'completed' },
      { date: '2026-10-27', status: 'cancelled' },
      { date: '2026-10-27', status: 'completed' },
      { date: '2026-10-29', status: 'completed' },
      { date: '2026-10-30', status: 'cancelled' },
    ]);
    assert.deepEqual(c, { '2026-10-27': 2, '2026-10-29': 1 });
    assert.deepEqual(countByDay([]), {});
  });

  test('PIN: caja cerrada, comisión pagada o fuera de caja', () => {
    assert.equal(needsPin({}), false);
    assert.equal(needsPin({ cashSessionId: 'c1' }), true);
    assert.equal(needsPin({ commissionPaid: true }), true);
    assert.equal(needsPin({ cashPlacement: 'fuera-de-caja' }), true);
    assert.equal(needsPin({ cashPlacement: 'caja-abierta' }), false);
  });

  test('totales: los anulados no cuentan; comisión calculada, pendiente y pagada', () => {
    const t = summarize([
      { price: 50, commissionSnapshot: { amount: 20 }, commissionPaid: false },
      { price: 30, commissionSnapshot: { amount: 10 }, commissionPaid: true },
      { price: 99, commissionSnapshot: { amount: 40 }, status: 'cancelled' },
    ]);
    assert.deepEqual(t, { count: 2, voided: 1, total: 80, commission: 30, commissionPaid: 10, commissionPending: 20 });
  });

  test('texto del historial', () => {
    const pros = [{ id: 'p1', name: 'Matías' }, { id: 'p2', name: 'Sofía' }];
    assert.equal(describeChange({ field: 'professionalId', before: 'p1', after: 'p2' }, { professionals: pros }), 'Profesional: Matías → Sofía');
    assert.equal(describeChange({ field: 'price', before: 50, after: 80 }), 'Importe: Bs 50 → Bs 80');
    assert.equal(describeChange({ field: 'services', before: [{ serviceName: 'Corte' }], after: [{ serviceName: 'Corte' }, { serviceName: 'Barba' }] }), 'Servicios: Corte → Corte + Barba');
  });
});
