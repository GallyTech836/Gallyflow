// Anticipación para reservar (minAdvanceMinutes): puede ser de minutos, horas
// o días, y cuenta desde ahora aunque la hora sea de otro día.
// Ejecutar:  cd backend && npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableSlots } from '../services/appointments/availability.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const profesional = { id: 'ana', availability: DIAS.map((day) => ({ day, status: 'Disponible', start: '09:00', end: '12:00' })) };
const ahora = new Date(2026, 10, 16, 10, 0); // lunes 16 nov, 10:00
const slots = (fecha, minAdvanceMinutes) => getAvailableSlots({ fecha, serviceDuration: 30, profesional, aplicarAnticipacion: true, minAdvanceMinutes, ahora });

test('minutos: hoy desde ahora + 30 min (como antes)', () => {
  assert.deepEqual(slots('2026-11-16', 30), ['10:30', '11:00', '11:30']);
  assert.equal(slots('2026-11-17', 30).length, 6);
});

test('horas: 24 h bloquea hoy y mañana hasta la misma hora', () => {
  assert.deepEqual(slots('2026-11-16', 24 * 60), []);
  assert.deepEqual(slots('2026-11-17', 24 * 60), ['10:00', '10:30', '11:00', '11:30']);
  assert.equal(slots('2026-11-18', 24 * 60).length, 6);
});

test('días: 2 días deja libre recién desde pasado mañana a la misma hora', () => {
  assert.deepEqual(slots('2026-11-17', 2 * 1440), []);
  assert.deepEqual(slots('2026-11-18', 2 * 1440), ['10:00', '10:30', '11:00', '11:30']);
});

test('sin anticipación (0): solo se quitan las horas que ya pasaron', () => {
  assert.deepEqual(slots('2026-11-16', 0), ['10:00', '10:30', '11:00', '11:30']);
});
