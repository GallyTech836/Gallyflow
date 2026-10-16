// Pruebas de la reserva pública por backend (punto 11, aislamiento):
// horarios ocupados sin datos privados, reserva validada en el servidor,
// precio/duración del catálogo y cliente guardado por el backend.
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';

const db = createFakeDb();
mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });

const {
  createPublicBooking, listBusyAppointments, validarReserva, minutosHasta, promoDeMartes, BookingError,
} = await import('../services/appointments/publicBooking.js');

const NEG = 'negA';
const N = `negocios/${NEG}`;
const DATE = '2030-01-15'; // martes
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const semana = () => DIAS.map((day) => ({ day, status: 'Disponible', start: '08:00', end: '20:00' }));

function seed() {
  db._clear();
  db._set(N, { adminUid: 'uidA' });
  db._set(`${N}/servicios/s1`, { name: 'Corte', price: 100, duration: 30 });
  db._set(`${N}/servicios/s2`, { name: 'Barba', price: 50, duration: 30 });
  db._set(`${N}/servicios/sr`, { name: 'Promo', price: 80, promoPrice: 60, duration: 30 });
  db._set(`${N}/profesionales/ana`, {
    name: 'Ana', active: true, branch: 'Centro', availability: semana(),
    services: [{ serviceId: 's1', customPrice: 150 }, { serviceId: 's2' }, { serviceId: 'sr' }],
  });
  db._set(`${N}/profesionales/beto`, {
    name: 'Beto', active: true, branch: 'Centro', availability: semana(), services: [{ serviceId: 's1' }],
  });
  db._set(`${N}/citas/c1`, {
    date: DATE, time: '10:00', duration: 30, status: 'confirmed', professionalId: 'ana', barberId: 'ana',
    clientName: 'María Secreta', clientPhone: '+59170000009', serviceId: 's1', services: [{ serviceId: 's1', price: 150 }],
  });
  db._set(`${N}/citas/c2`, { date: DATE, time: '11:00', duration: 30, status: 'cancelled', professionalId: 'ana', clientName: 'X' });
  db._set(`${N}/horariosBloqueados/b1`, { date: DATE, startTime: '12:00', endTime: '13:00', professionalId: 'ana', reason: 'Dentista' });
}

const base = (extra = {}) => ({
  negocioId: NEG, professionalId: 'ana', serviceIds: ['s1'], date: DATE, time: '09:00',
  clientName: 'Juan Pérez', clientPhone: '71234567', branch: 'Centro', ...extra,
});
const AHORA = new Date('2030-01-10T12:00:00Z');

describe('horarios ocupados', () => {
  beforeEach(seed);

  test('no expone nombres, teléfonos ni motivos; omite canceladas', async () => {
    const r = await listBusyAppointments(NEG, DATE);
    const json = JSON.stringify(r);
    assert.ok(!json.includes('María'));
    assert.ok(!json.includes('70000009'));
    assert.ok(!json.includes('Dentista'));
    assert.equal(r.citas.length, 1);
    assert.deepEqual(r.citas[0], {
      date: DATE, time: '10:00', duration: 30, status: 'confirmed', professionalId: 'ana', barberId: 'ana',
      serviceId: 's1', services: [{ serviceId: 's1' }], branch: '',
    });
    assert.deepEqual(r.bloqueos, [{ date: DATE, startTime: '12:00', endTime: '13:00', professionalId: 'ana', barberId: 'ana' }]);
  });

  test('datos inválidos', async () => {
    await assert.rejects(listBusyAppointments('../x', DATE), BookingError);
    await assert.rejects(listBusyAppointments(NEG, '15/01/2030'), BookingError);
  });
});

describe('reserva pública', () => {
  beforeEach(seed);

  test('crea la cita con precio y duración del catálogo (no del navegador)', async () => {
    const r = await createPublicBooking(base({ price: 1, duration: 5, bookedBy: 'admin', clientId: 'otro' }), { ahora: AHORA });
    const cita = db._get(`${N}/citas/${r.id}`);
    assert.equal(cita.price, 150); // precio de Ana para Corte
    assert.equal(cita.duration, 30);
    assert.equal(cita.bookedBy, 'client');
    assert.equal(cita.status, 'confirmed');
    assert.equal(cita.paymentMethod, 'Pendiente');
    assert.equal(cita.serviceName, 'Corte');
    assert.notEqual(cita.clientId, 'otro');
    // Cliente guardado por el backend, con el teléfono como lo escribió.
    const cliente = db._get(`${N}/clientes/${cita.clientId}`);
    assert.equal(cliente.name, 'Juan Pérez');
    assert.equal(cliente.phone, '71234567');
    assert.equal(cliente.visits, 1);
  });

  test('un horario ocupado o bloqueado se rechaza', async () => {
    await assert.rejects(createPublicBooking(base({ time: '10:00' }), { ahora: AHORA }), (e) => e.code === 'UNAVAILABLE');
    await assert.rejects(createPublicBooking(base({ time: '12:00' }), { ahora: AHORA }), (e) => e.code === 'UNAVAILABLE');
    // La cancelada no ocupa
    const r = await createPublicBooking(base({ time: '11:00' }), { ahora: AHORA });
    assert.ok(r.id);
  });

  test('cliente que vuelve: se reutiliza su ficha', async () => {
    db._set(`${N}/clientes/71234567`, { name: 'Juan P.', phone: '71234567', visits: 3 });
    const r = await createPublicBooking(base(), { ahora: AHORA });
    const cita = db._get(`${N}/citas/${r.id}`);
    assert.equal(cita.clientId, '71234567');
    assert.equal(db._get(`${N}/clientes/71234567`).visits, 4);
  });

  test('Pendiente: precio provisional entre candidatos de la sucursal', async () => {
    const r = await createPublicBooking(base({ professionalId: 'pending', candidateIds: ['ana', 'beto'], time: '15:00' }), { ahora: AHORA });
    const cita = db._get(`${N}/citas/${r.id}`);
    assert.equal(cita.professionalId, 'pending');
    assert.equal(cita.priceProvisional, true);
    assert.equal(cita.price, 100); // mínimo entre Ana (150) y Beto (100)
  });

  test('varios servicios: duración total del catálogo', async () => {
    const r = await createPublicBooking(base({ serviceIds: ['s1', 's2'], time: '14:00' }), { ahora: AHORA });
    const cita = db._get(`${N}/citas/${r.id}`);
    assert.equal(cita.duration, 60);
    assert.equal(cita.price, 200);
    assert.equal(cita.serviceName, 'Corte + Barba');
  });

  test('promo heredada de martes (sr/jr)', async () => {
    assert.equal(promoDeMartes(DATE)({ id: 'sr' }), true);
    assert.equal(promoDeMartes('2030-01-16')({ id: 'sr' }), false);
    const r = await createPublicBooking(base({ serviceIds: ['sr'], time: '16:00' }), { ahora: AHORA });
    assert.equal(db._get(`${N}/citas/${r.id}`).price, 60);
  });

  test('menos de 30 minutos de anticipación: se rechaza', async () => {
    const casi = new Date('2030-01-15T12:45:00Z'); // 08:45 en La Paz
    await assert.rejects(createPublicBooking(base({ time: '09:00' }), { ahora: casi }), (e) => e.code === 'TOO_SOON');
    assert.ok(minutosHasta('2030-01-15', '09:00', new Date('2030-01-15T12:00:00Z')) === 60);
  });

  test('validaciones', () => {
    assert.throws(() => validarReserva(base({ negocioId: '../otro' })), BookingError);
    assert.throws(() => validarReserva(base({ clientName: 'J' })), BookingError);
    assert.throws(() => validarReserva(base({ serviceIds: [] })), BookingError);
    assert.throws(() => validarReserva(base({ time: '25:00' })), BookingError);
    assert.throws(() => validarReserva(base({ clientPhone: '<script>' })), BookingError);
    assert.doesNotThrow(() => validarReserva(base({ clientPhone: '' })));
  });

  test('servicio borrado: mensaje claro', async () => {
    await assert.rejects(createPublicBooking(base({ serviceIds: ['nope'] }), { ahora: AHORA }), (e) => e.code === 'SERVICE_GONE');
  });
});
