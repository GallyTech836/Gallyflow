// Pruebas de las ayudas de pantalla del registro de servicios (Nexus Control).
// Ejecutar (desde la raíz):  npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRegistro, newRequestId, defaultPaymentMethod, periodRange, shiftDay, needsPin, barberCanEdit, summarize, describeChange, dayLabel, todayKey,
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

  test('periodos de la lista', () => {
    assert.deepEqual(periodRange('hoy', '2026-10-27'), { from: '2026-10-27', to: '2026-10-27' });
    assert.deepEqual(periodRange('semana', '2026-10-27'), { from: '2026-10-21', to: '2026-10-27' });
    assert.deepEqual(periodRange('mes', '2026-10-27'), { from: '2026-10-01', to: '2026-10-27' });
    assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
    assert.equal(dayLabel('2026-10-25'), '25/10');
  });

  test('PIN: caja cerrada, comisión pagada o fuera de caja', () => {
    assert.equal(needsPin({}), false);
    assert.equal(needsPin({ cashSessionId: 'c1' }), true);
    assert.equal(needsPin({ commissionPaid: true }), true);
    assert.equal(needsPin({ cashPlacement: 'fuera-de-caja' }), true);
    assert.equal(needsPin({ cashPlacement: 'caja-abierta' }), false);
  });

  test('el barbero solo cambia los suyos, de hoy, sin caja cerrada ni comisión pagada', () => {
    const base = { professionalId: 'p1', date: todayKey(), status: 'completed' };
    assert.equal(barberCanEdit(base, 'p1'), true);
    assert.equal(barberCanEdit(base, 'p2'), false);
    assert.equal(barberCanEdit({ ...base, date: '2020-01-01' }, 'p1'), false);
    assert.equal(barberCanEdit({ ...base, commissionPaid: true }, 'p1'), false);
    assert.equal(barberCanEdit({ ...base, cashSessionId: 'c' }, 'p1'), false);
    assert.equal(barberCanEdit({ ...base, status: 'cancelled' }, 'p1'), false);
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
