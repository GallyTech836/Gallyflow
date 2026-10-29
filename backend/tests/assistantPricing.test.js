// Pruebas de punta a punta del asistente de WhatsApp con precio por profesional:
// lo que se MUESTRA (lista de servicios, de profesionales, resumen) coincide
// con lo que se GUARDA en la cita. Firestore en memoria, sin red.
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
    sendNotification: async (n) => { sent.push(n); return {}; },
    sendDirectNotification: async () => ({}),
    getRecipients: async () => [],
  },
});
mock.module('../services/capabilities/capabilityService.js', {
  namedExports: {
    getNegocioAccess: async () => ({ capabilities: { asistenteWhatsapp: { enabled: true } } }),
    checkCapability: async () => ({ allowed: true }),
    DENY_MESSAGES: {},
    invalidateNegocioAccess: () => {},
    incrementUsage: async () => {},
    incrementRejected: async () => {},
    currentPeriod: () => 'test',
    getUsage: async () => ({}),
    requireCapability: () => (req, res, next) => next(),
  },
});

const { assistantEngine } = await import('../services/assistantEngine/engine.js');
const { invalidateBusinessContext } = await import('../services/appointments/businessContext.js');

const N = 'negocios/neg';
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const allDay = () => DIAS.map((day) => ({ day, status: 'Disponible', start: '00:00', end: '23:59' }));

let phoneSeq = 0;
let phone;
function seed() {
  db._clear();
  sent.length = 0;
  phone = `5917100${String(++phoneSeq).padStart(4, '0')}`;
  db._set(N, { slug: 'neg', heroConfig: { businessName: 'Barbería Test' }, businessSettings: { schedule: allDay() } });
  db._set(`${N}/servicios/s1`, { name: 'Corte', price: 100, duration: 30, order: 1 });
  db._set(`${N}/servicios/s3`, { name: 'Color', price: 200, priceVariable: true, duration: 60, order: 2 });
  db._set(`${N}/profesionales/ana`, { name: 'Ana', active: true, branch: 'Centro', availability: allDay(), services: [{ serviceId: 's1', customPrice: 150 }, { serviceId: 's3', customPrice: 250 }] });
  db._set(`${N}/profesionales/beto`, { name: 'Beto', active: true, branch: 'Centro', availability: allDay(), services: [{ serviceId: 's1' }] });
}

async function say(message) {
  return assistantEngine({ negocioId: 'neg', phone, message });
}

const rows = (r) => r.interactive?.action?.sections?.[0]?.rows || [];

describe('Asistente WhatsApp: precio por profesional', () => {
  beforeEach(seed);

  test('muestra rango por servicio y precio exacto por profesional; guarda ese precio', async () => {
    await say('hola');
    const servicios = await say('1');
    assert.match(servicios.replyText, /Corte - Bs 100 – 150/);
    assert.match(servicios.replyText, /Color - Desde Bs 250/);

    const pros = await say('1'); // Corte
    const [ana, beto, cualquiera] = rows(pros);
    assert.equal(ana.title, 'Ana');
    assert.equal(ana.description, 'Bs 150');
    assert.equal(beto.description, 'Bs 100');
    assert.match(cualquiera.description, /Bs 100 – 150/);

    await say('1'); // Ana
    await say('1'); // primera hora
    const resumen = await say('Juan Perez');
    assert.match(resumen.replyText, /Precio: Bs 150/);

    await say('1'); // confirmar
    const [cita] = db._list(`${N}/citas`);
    assert.equal(cita.professionalId, 'ana');
    assert.equal(cita.price, 150);
    assert.equal(cita.services[0].priceSource, 'professional');
  });

  test('"Cualquier profesional": muestra rango y guarda precio provisional', async () => {
    await say('hola');
    await say('1');
    await say('1'); // Corte
    await say('3'); // Cualquier profesional
    await say('1');
    const resumen = await say('Juan Perez');
    assert.match(resumen.replyText, /Precio: Bs 100 – 150 \(según quién te atienda\)/);
    await say('1');
    const [cita] = db._list(`${N}/citas`);
    assert.equal(cita.professionalId, 'pending'); // 2 candidatos => decide el admin
    assert.equal(cita.priceProvisional, true);
    assert.equal(cita.price, 100);
    assert.deepEqual(cita.services[0].priceRange, { min: 100, max: 150 });
  });

  test('reprogramar a otro profesional avisa y aplica el nuevo precio', async () => {
    db._set(`${N}/clientes/${phone}`, { name: 'Juan Perez', phone });
    db._set(`${N}/citas/c1`, {
      date: '2030-01-15', time: '10:00', duration: 30, professionalId: 'beto', barberId: 'beto', status: 'confirmed',
      clientName: 'Juan', clientPhone: phone, price: 100, serviceName: 'Corte',
      services: [{ serviceId: 's1', serviceName: 'Corte', price: 100, duration: 30 }],
    });
    await say('hola');
    await say('reprogramar');
    await say('1'); // Ana
    const resumen = await say('1'); // primera hora
    assert.match(resumen.replyText, /Precio: Bs 150 \(antes Bs 100\)/);
    await say('1');
    const cita = db._get(`${N}/citas/c1`);
    assert.equal(cita.professionalId, 'ana');
    assert.equal(cita.price, 150);
    const aviso = sent.find((n) => n.tipo === 'RESERVA_MODIFICADA');
    assert.ok(aviso.data.changes.some((c) => c === 'Precio: Bs 100 → Bs 150'));
  });
});

describe('Asistente WhatsApp: promociones y destacados', () => {
  beforeEach(() => { seed(); invalidateBusinessContext('neg'); });
  const promo = (id, data) => db._set(`${N}/promociones/${id}`, {
    active: true, startDate: '2020-01-01', endDate: null, weekdays: [], branchIds: [], commissionBase: 'final', ...data,
  });

  test('la lista avisa la promo, el resumen muestra el precio con promo y se guarda igual', async () => {
    promo('p20', { name: '20% corte', type: 'descuento', serviceIds: ['s1'], discountKind: 'percent', discountValue: 20 });
    invalidateBusinessContext('neg');
    await say('hola');
    const servicios = await say('1');
    assert.match(servicios.replyText, /Corte - Bs 100 – 150 · 20% menos/);
    await say('1'); // Corte
    await say('1'); // Ana
    await say('1'); // primera hora
    const resumen = await say('Juan Perez');
    assert.match(resumen.replyText, /Precio: Bs 120 \(antes Bs 150, promo «20% corte»\)/);
    await say('1'); // confirmar
    const [cita] = db._list(`${N}/citas`);
    assert.equal(cita.price, 120);
    assert.equal(cita.promo.id, 'p20');
  });

  test('un servicio destacado aparece primero', async () => {
    db._set(`${N}/servicios/s3`, { ...db._get(`${N}/servicios/s3`), featured: true });
    invalidateBusinessContext('neg');
    await say('hola');
    const servicios = await say('1');
    assert.ok(servicios.replyText.indexOf('Color') < servicios.replyText.indexOf('Corte'), servicios.replyText);
  });
});
