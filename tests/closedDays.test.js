// Días cerrados / feriados (businessSettings.closedDays). Ejecutar: npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as m from '../src/shared/businessSettings/closedDaysModel.js';
import * as back from '../backend/services/appointments/closedDays.js';

const cierres = m.normalizeClosedDays([
  { id: 'a', start: '2026-11-02', reason: 'Feriado' },
  { id: 'b', start: '2026-12-24', end: '2026-12-26', reason: 'Vacaciones' },
  { id: 'c', start: '2026-11-10', branch: 'Centro', branchId: 'suc1' },
  { start: 'mal' },
  { start: '2026-01-01', end: '2026-06-01' }, // rango demasiado largo
]);

describe('closedDays', () => {
  test('normaliza: descarta inválidos, ordena y completa end', () => {
    assert.deepEqual(cierres.map((c) => c.id), ['a', 'c', 'b']);
    assert.equal(cierres[0].end, '2026-11-02');
  });

  test('día suelto y rango', () => {
    assert.equal(m.findClosure(cierres, '2026-11-02')?.reason, 'Feriado');
    assert.ok(m.isClosedOn(cierres, '2026-12-25'));
    assert.ok(!m.isClosedOn(cierres, '2026-12-27'));
    assert.ok(!m.isClosedOn(cierres, '2026-11-03'));
  });

  test('cierre por sucursal: solo esa sucursal (por nombre o id)', () => {
    assert.ok(!m.isClosedOn(cierres, '2026-11-10'));
    assert.ok(!m.isClosedOn(cierres, '2026-11-10', 'Norte'));
    assert.ok(m.isClosedOn(cierres, '2026-11-10', 'Centro'));
    assert.ok(m.isClosedOn(cierres, '2026-11-10', 'suc1'));
    assert.ok(m.isClosedOn(cierres, '2026-11-02', 'Norte'), 'cierre de todo el negocio aplica a toda sucursal');
  });

  test('la copia del backend es igual', async () => {
    const cuerpo = (t) => t.slice(t.indexOf('const FECHA_RE'));
    const a = await readFile(new URL('../src/shared/businessSettings/closedDaysModel.js', import.meta.url), 'utf8');
    const b = await readFile(new URL('../backend/services/appointments/closedDays.js', import.meta.url), 'utf8');
    assert.equal(cuerpo(a), cuerpo(b));
    assert.deepEqual(Object.keys(m).sort(), Object.keys(back).sort());
  });
});
