// Pruebas de precio por profesional en los flujos del backend (transacciones):
// crear cita, crear Pendiente, asignación automática, reprogramar y comisiones.
// Firestore se reemplaza por uno en memoria (helpers/fakeFirestore.js).
//
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';

const db = createFakeDb();
const sent = [];

mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('../services/notificationService.js', {
  namedExports: {
    sendNotification: async (n) => { sent.push(n); return { ok: true }; },
    sendDirectNotification: async () => ({ ok: true }),
    getRecipients: async () => [],
  },
});

const { createAppointment, createPendingAppointment } = await import('../services/appointments/createAppointment.js');
const { processPendingCita } = await import('../services/appointments/pendingService.js');
const { rescheduleAppointment } = await import('../services/appointments/manageAppointment.js');
const { calculateCommissionForCita } = await import('../services/finance/commissionModel.js');

const NEG = 'negocio-test';
const N = `negocios/${NEG}`;
const DATE = '2030-01-15';
const DATE2 = '2030-01-16';
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const allWeek = () => DIAS.map((day) => ({ day, status: 'Disponible', start: '08:00', end: '20:00' }));
const PHONE = '59170000001';

function seed() {
  db._clear();
  db._set(N, { slug: NEG, businessSettings: { schedule: allWeek() } });
  db._set(`${N}/servicios/s1`, { name: 'Corte', price: 100, duration: 30 });
  db._set(`${N}/servicios/s2`, { name: 'Barba', price: 50, duration: 30 });
  db._set(`${N}/servicios/s3`, { name: 'Color', price: 200, priceVariable: true, duration: 60 });
  db._set(`${N}/profesionales/ana`, {
    name: 'Ana', active: true, branch: 'Centro', availability: allWeek(),
    services: [
      { serviceId: 's1', commissionEnabled: true, type: '%', value: 40, customPrice: 150 },
      { serviceId: 's2', commissionEnabled: true, type: 'Bs', value: 10 },
      { serviceId: 's3', commissionEnabled: true, type: '%', value: 50, customPrice: 250 },
    ],
  });
  db._set(`${N}/profesionales/beto`, {
    name: 'Beto', active: true, branch: 'Centro', availability: allWeek(),
    services: [
      { serviceId: 's1', commissionEnabled: true, type: '%', value: 40 },
      { serviceId: 's2', commissionEnabled: true, type: 'Bs', value: 10 },
    ],
  });
}

function citasGuardadas() {
  return db._list(`${N}/citas`);
}

const svc = (id, name, extra = {}) => ({ serviceId: id, serviceName: name, duration: 30, ...extra });

describe('createAppointment (con profesional)', () => {
  beforeEach(() => { seed(); sent.length = 0; });

  test('usa el precio personalizado del profesional e ignora el precio enviado', async () => {
    const cita = await createAppointment({
      negocioId: NEG, professionalId: 'ana', date: DATE, time: '10:00', serviceDuration: 60,
      services: [svc('s1', 'Corte', { price: 0 }), svc('s2', 'Barba', { price: 1 })],
      clientName: 'Cliente', clientPhone: PHONE,
    });
    assert.equal(cita.price, 200); // 150 (Ana) + 50 (base)
    assert.equal(cita.services[0].price, 150);
    assert.equal(cita.services[0].priceSource, 'professional');
    assert.equal(cita.services[0].basePrice, 100);
    assert.equal(cita.services[1].price, 50);
    assert.equal(cita.services[1].priceSource, 'base');
    assert.equal(cita.priceProvisional, undefined);
    const guardada = citasGuardadas()[0];
    assert.equal(guardada.price, 200);
  });

  test('sin precio personalizado usa el precio base', async () => {
    const cita = await createAppointment({
      negocioId: NEG, professionalId: 'beto', date: DATE, time: '10:00', serviceDuration: 30,
      services: [svc('s1', 'Corte')], clientName: 'Cliente', clientPhone: PHONE,
    });
    assert.equal(cita.price, 100);
  });

  test('servicio inexistente: no crea la cita', async () => {
    await assert.rejects(() => createAppointment({
      negocioId: NEG, professionalId: 'ana', date: DATE, time: '10:00', serviceDuration: 30,
      services: [svc('zzz', 'Falso', { price: 0 })], clientName: 'X', clientPhone: PHONE,
    }), /Servicio no encontrado/);
    assert.equal(citasGuardadas().length, 0);
  });

  test('precio variable: guarda el "Desde" del profesional como listPrice', async () => {
    const cita = await createAppointment({
      negocioId: NEG, professionalId: 'ana', date: DATE, time: '12:00', serviceDuration: 60,
      services: [svc('s3', 'Color', { duration: 60 })], clientName: 'X', clientPhone: PHONE,
    });
    assert.equal(cita.services[0].price, 250);
    assert.equal(cita.services[0].listPrice, 250);
    assert.equal(cita.services[0].priceVariable, true);
  });
});

describe('Pendiente → asignación', () => {
  beforeEach(() => { seed(); sent.length = 0; });

  test('crea con precio provisional (mínimo) y rango entre candidatos', async () => {
    const cita = await createPendingAppointment({
      negocioId: NEG, date: DATE, time: '10:00', serviceDuration: 30,
      services: [svc('s1', 'Corte', { price: 999 })], clientName: 'X', clientPhone: PHONE,
    });
    assert.equal(cita.professionalId, 'pending');
    assert.equal(cita.priceProvisional, true);
    assert.equal(cita.price, 100);
    assert.deepEqual(cita.services[0].priceRange, { min: 100, max: 150 });
    assert.equal(cita.services[0].priceSource, 'pending');
  });

  test('con dos candidatos sigue Pendiente; al quedar uno se asigna con SU precio', async () => {
    const cita = await createPendingAppointment({
      negocioId: NEG, date: DATE, time: '10:00', serviceDuration: 30,
      services: [svc('s1', 'Corte')], clientName: 'X', clientPhone: PHONE,
    });
    let r = await processPendingCita({ negocioId: NEG, citaId: cita.id });
    assert.equal(r.action, 'notify');

    // Beto se ocupa a esa hora => solo queda Ana => asignación automática a 150.
    db._set(`${N}/citas/ocupa-beto`, { date: DATE, time: '10:00', duration: 30, professionalId: 'beto', barberId: 'beto', status: 'confirmed', price: 100, services: [svc('s1', 'Corte', { price: 100 })] });
    r = await processPendingCita({ negocioId: NEG, citaId: cita.id });
    assert.equal(r.action, 'assigned');
    assert.equal(r.professionalId, 'ana');

    const guardada = db._get(`${N}/citas/${cita.id}`);
    assert.equal(guardada.professionalId, 'ana');
    assert.equal(guardada.price, 150);
    assert.equal(guardada.priceProvisional, false);
    assert.equal(guardada.services[0].priceSource, 'professional');
    assert.equal(guardada.services[0].priceRange, undefined);
    // La comisión usa el precio aplicado: 40% de 150.
    const ana = db._get(`${N}/profesionales/ana`);
    assert.equal(calculateCommissionForCita(guardada, ana).totalAmount, 60);
  });

  test('si se asigna a quien no tiene precio propio, queda el precio base', async () => {
    db._set(`${N}/citas/ocupa-ana`, { date: DATE, time: '10:00', duration: 30, professionalId: 'ana', barberId: 'ana', status: 'confirmed', price: 150, services: [svc('s1', 'Corte', { price: 150 })] });
    const cita = await createPendingAppointment({
      negocioId: NEG, date: DATE, time: '10:00', serviceDuration: 30,
      services: [svc('s1', 'Corte')], clientName: 'X', clientPhone: PHONE,
    });
    assert.deepEqual(cita.services[0].priceRange, { min: 100, max: 100 }); // solo Beto es candidato
    await processPendingCita({ negocioId: NEG, citaId: cita.id });
    const guardada = db._get(`${N}/citas/${cita.id}`);
    assert.equal(guardada.professionalId, 'beto');
    assert.equal(guardada.price, 100);
  });

  test('cita Pendiente vieja (sin services[], campos planos) se asigna y obtiene precio', async () => {
    db._set(`${N}/citas/legacy`, { date: DATE, time: '15:00', duration: 30, professionalId: 'pending', barberId: 'pending', status: 'confirmed', serviceId: 's3', serviceName: 'Color', price: 200, createdAt: '2029-01-01' });
    // s3 solo lo hace Ana => único candidato.
    const r = await processPendingCita({ negocioId: NEG, citaId: 'legacy' });
    assert.equal(r.action, 'assigned');
    const guardada = db._get(`${N}/citas/legacy`);
    assert.equal(guardada.price, 250);
    assert.equal(guardada.services[0].serviceId, 's3');
    assert.equal(guardada.serviceId, 's3'); // alias legacy intacto
  });
});

describe('Reprogramar (WhatsApp)', () => {
  beforeEach(() => { seed(); sent.length = 0; });
  const ahora = new Date(2030, 0, 1, 9, 0);

  async function citaDeBeto() {
    return createAppointment({
      negocioId: NEG, professionalId: 'beto', date: DATE, time: '10:00', serviceDuration: 30,
      services: [svc('s1', 'Corte')], clientName: 'X', clientPhone: PHONE,
    });
  }

  test('cambiar a otro profesional recalcula con su precio', async () => {
    const cita = await citaDeBeto();
    assert.equal(cita.price, 100);
    const r = await rescheduleAppointment({ negocioId: NEG, citaId: cita.id, phone: PHONE, ahora, minHours: 2, date: DATE2, time: '11:00', duration: 30, professionalId: 'ana' });
    assert.equal(r.despues.price, 150);
    assert.equal(db._get(`${N}/citas/${cita.id}`).price, 150);
  });

  test('mismo profesional: conserva el precio guardado aunque el catálogo cambie', async () => {
    const cita = await citaDeBeto();
    db._set(`${N}/servicios/s1`, { name: 'Corte', price: 130, duration: 30 }); // sube el precio base
    await rescheduleAppointment({ negocioId: NEG, citaId: cita.id, phone: PHONE, ahora, minHours: 2, date: DATE2, time: '11:00', duration: 30, professionalId: 'beto' });
    assert.equal(db._get(`${N}/citas/${cita.id}`).price, 100);
  });
});

describe('Histórico', () => {
  beforeEach(() => { seed(); sent.length = 0; });

  test('cambiar precios después no altera citas ni comisiones ya guardadas', async () => {
    const cita = await createAppointment({
      negocioId: NEG, professionalId: 'ana', date: DATE, time: '10:00', serviceDuration: 30,
      services: [svc('s1', 'Corte')], clientName: 'X', clientPhone: PHONE,
    });
    // El admin cambia el precio de Ana y el precio base.
    const ana = db._get(`${N}/profesionales/ana`);
    ana.services[0].customPrice = 300;
    db._set(`${N}/profesionales/ana`, ana);
    db._set(`${N}/servicios/s1`, { name: 'Corte', price: 999, duration: 30 });

    const guardada = db._get(`${N}/citas/${cita.id}`);
    assert.equal(guardada.price, 150);
    assert.equal(calculateCommissionForCita(guardada, ana).totalAmount, 60); // 40% de 150, no de 300
  });
});

describe('Promociones al guardar citas', () => {
  // DATE (2030-01-15) es martes; DATE2 es miércoles.
  const promo = (id, data) => db._set(`${N}/promociones/${id}`, {
    active: true, startDate: '2030-01-01', endDate: null, weekdays: [], branchIds: [], commissionBase: 'final', ...data,
  });
  beforeEach(() => { seed(); sent.length = 0; });

  test('descuento sobre el precio del profesional; guarda la promo en la cita', async () => {
    promo('p20', { name: '20% corte', type: 'descuento', serviceIds: ['s1'], discountKind: 'percent', discountValue: 20 });
    const cita = await createAppointment({
      negocioId: NEG, professionalId: 'ana', date: DATE, time: '10:00', serviceDuration: 60,
      services: [svc('s1', 'Corte'), svc('s2', 'Barba')], clientName: 'X', clientPhone: PHONE,
    });
    assert.equal(cita.services[0].price, 120); // 150 de Ana − 20%
    assert.equal(cita.services[0].prePromoPrice, 150);
    assert.equal(cita.price, 170);
    assert.equal(cita.promo.id, 'p20');
    assert.equal(db._get(`${N}/citas/${cita.id}`).promo.discount, 30);
  });

  test('combo con todos sus servicios; sin ellos no aplica', async () => {
    promo('cb', { name: 'Corte + barba', type: 'combo', serviceIds: ['s1', 's2'], comboPrice: 120 });
    const con = await createAppointment({
      negocioId: NEG, professionalId: 'beto', date: DATE, time: '10:00', serviceDuration: 60,
      services: [svc('s1', 'Corte'), svc('s2', 'Barba')], clientName: 'X', clientPhone: PHONE,
    });
    assert.equal(con.price, 120);
    const sin = await createAppointment({
      negocioId: NEG, professionalId: 'beto', date: DATE, time: '12:00', serviceDuration: 30,
      services: [svc('s1', 'Corte')], clientName: 'Y', clientPhone: PHONE,
    });
    assert.equal(sin.price, 100);
    assert.equal(sin.promo, undefined);
  });

  test('solo los días de la promo y en su sucursal', async () => {
    promo('mie', { name: 'Miércoles', type: 'descuento', serviceIds: ['s1'], discountKind: 'amount', discountValue: 10, weekdays: [3] });
    db._set(`${N}/sucursales/c1`, { name: 'Centro' });
    db._set(`${N}/sucursales/n1`, { name: 'Norte' });
    promo('norte', { name: 'Norte', type: 'descuento', serviceIds: ['s1'], discountKind: 'percent', discountValue: 50, branchIds: ['n1'] });
    const martes = await createAppointment({
      negocioId: NEG, professionalId: 'beto', date: DATE, time: '10:00', serviceDuration: 30,
      services: [svc('s1', 'Corte')], clientName: 'X', clientPhone: PHONE, branch: 'Centro',
    });
    assert.equal(martes.price, 100);
    const miercoles = await createAppointment({
      negocioId: NEG, professionalId: 'beto', date: DATE2, time: '10:00', serviceDuration: 30,
      services: [svc('s1', 'Corte')], clientName: 'X', clientPhone: PHONE, branch: 'Centro',
    });
    assert.equal(miercoles.price, 90);
  });

  test('Pendiente: promo sobre el mínimo y se recalcula al asignarse', async () => {
    promo('p20', { name: '20% corte', type: 'descuento', serviceIds: ['s1'], discountKind: 'percent', discountValue: 20 });
    db._set(`${N}/profesionales/beto`, { ...db._get(`${N}/profesionales/beto`), active: false }); // Ana, única candidata
    const cita = await createPendingAppointment({
      negocioId: NEG, date: DATE, time: '10:00', serviceDuration: 30,
      services: [svc('s1', 'Corte')], clientName: 'X', clientPhone: PHONE,
    });
    assert.equal(cita.price, 120); // 150 de Ana (único candidato) − 20%
    await processPendingCita({ negocioId: NEG, citaId: cita.id });
    const guardada = db._get(`${N}/citas/${cita.id}`);
    assert.equal(guardada.professionalId, 'ana');
    assert.equal(guardada.price, 120);
    assert.equal(guardada.promo.id, 'p20');
  });

  test('reprogramar a un día sin promo vuelve al precio normal', async () => {
    promo('mar', { name: 'Martes', type: 'descuento', serviceIds: ['s1'], discountKind: 'percent', discountValue: 50, weekdays: [2] });
    const cita = await createAppointment({
      negocioId: NEG, professionalId: 'beto', date: DATE, time: '10:00', serviceDuration: 30,
      services: [svc('s1', 'Corte')], clientName: 'X', clientPhone: PHONE,
    });
    assert.equal(cita.price, 50);
    const ahora = new Date('2030-01-10T12:00:00Z');
    await rescheduleAppointment({ negocioId: NEG, citaId: cita.id, phone: PHONE, ahora, minHours: 2, date: DATE2, time: '11:00', duration: 30, professionalId: 'beto' });
    const guardada = db._get(`${N}/citas/${cita.id}`);
    assert.equal(guardada.price, 100);
    assert.equal(guardada.promo, null);
  });

  test('comisión sobre el precio normal si la promo lo indica', async () => {
    promo('p20', { name: '20% corte', type: 'descuento', serviceIds: ['s1'], discountKind: 'percent', discountValue: 20, commissionBase: 'normal' });
    const cita = await createAppointment({
      negocioId: NEG, professionalId: 'ana', date: DATE, time: '10:00', serviceDuration: 30,
      services: [svc('s1', 'Corte')], clientName: 'X', clientPhone: PHONE,
    });
    const ana = { id: 'ana', ...db._get(`${N}/profesionales/ana`) };
    assert.equal(cita.price, 120);
    assert.equal(calculateCommissionForCita(db._get(`${N}/citas/${cita.id}`), ana).totalAmount, 60); // 40% de 150
  });
});
