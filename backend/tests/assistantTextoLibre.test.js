// Texto libre en el inicio: el saludo completo no se repite, "no entendí" sin
// saludo, al 2.º ofrece una persona, profesional nombrado y día cerrado.
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';

const db = createFakeDb();
mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('../services/notificationService.js', { namedExports: { sendNotification: async () => ({}), sendDirectNotification: async () => ({}), getRecipients: async () => [] } });
mock.module('../services/capabilities/capabilityService.js', {
  namedExports: {
    getNegocioAccess: async () => ({ capabilities: { asistenteWhatsapp: { enabled: true } } }),
    checkCapability: async () => ({ allowed: true }), DENY_MESSAGES: {}, invalidateNegocioAccess: () => {},
    incrementUsage: async () => {}, incrementRejected: async () => {}, currentPeriod: () => 't', getUsage: async () => ({}),
    requireCapability: () => (a, b, n) => n(),
  },
});
const { assistantEngine } = await import('../services/assistantEngine/engine.js');

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const allDay = DIAS.map((day) => ({ day, status: 'Disponible', start: '00:00', end: '23:59' }));
function hoyNegocio() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

let seq = 0;
let neg;
let phone;
function seed({ closedDays = [], personalidad = null } = {}) {
  neg = `txt${++seq}`;
  phone = `59175000${String(seq).padStart(3, '0')}`;
  db._clear();
  db._set(`negocios/${neg}`, {
    heroConfig: { businessName: 'Nexus Test' },
    assistantConfig: personalidad ? { personalidad } : {},
    businessSettings: { schedule: allDay, closedDays },
  });
  db._set(`negocios/${neg}/servicios/s1`, { name: 'Corte', price: 100, duration: 30 });
  db._set(`negocios/${neg}/servicios/s2`, { name: 'Barba', price: 50, duration: 30 });
  db._set(`negocios/${neg}/profesionales/m`, { name: 'Martín Pérez', active: true, availability: allDay, services: [{ serviceId: 's1' }] });
  db._set(`negocios/${neg}/profesionales/g`, { name: 'Gally Torrico', active: true, availability: allDay, services: [{ serviceId: 's1' }, { serviceId: 's2' }] });
  db._set(`negocios/${neg}/clientes/${phone}`, { name: 'Juan Perez', phone });
}
const say = (m) => assistantEngine({ negocioId: neg, phone, message: m });
const body = (r) => r.interactive?.body?.text || r.replyText;
const titulos = (r) => [
  ...(r.interactive?.action?.buttons || []).map((b) => b.reply.title),
  ...(r.interactive?.action?.sections?.[0]?.rows || []).map((x) => x.title),
];
const conv = () => db._get(`negocios/${neg}/assistantConversations/${phone}`);

describe('Texto libre en el inicio', () => {
  beforeEach(() => seed({ personalidad: { tono: 'formal' } }));

  test('no repite el saludo: "no logré entender" y al 2.º ofrece una persona', async () => {
    const r0 = await say('Hola');
    assert.match(body(r0), /Le saluda el asistente virtual/);
    const r1 = await say('Se encuentra Pedro?');
    assert.equal(body(r1), 'Disculpe, soy un asistente automático y no logré entender su mensaje. ¿Qué desea hacer?');
    assert.deepEqual(titulos(r1), ['Agendar cita', 'Hablar con alguien']);
    const r2 = await say('y el otro chico?');
    assert.match(body(r2), /^Parece que su consulta es para nuestro equipo\. ¿Desea que le avise a una persona\?$/);
    assert.deepEqual(titulos(r2), ['Sí, avisar al equipo', 'Agendar cita']);
    await say('2');
    assert.equal(conv().currentFlow, 'human');
  });

  test('"hola" repetido: saludo corto; "gracias": de nada; "menu": saludo completo', async () => {
    await say('hola');
    const r = await say('Buenas tardes');
    assert.equal(body(r), 'Hola nuevamente. ¿En qué puedo ayudarle?');
    assert.equal(body(await say('gracias')), 'Con mucho gusto.');
    assert.match(body(await say('menu')), /Le saluda el asistente virtual/);
  });

  test('profesional nombrado: agenda con él (un solo servicio => horarios directos)', async () => {
    await say('hola');
    const r = await say('¿Se encuentra Martin?');
    assert.match(body(r), /^Agendemos con Martín Pérez\./);
    const c = conv();
    assert.equal(c.currentFlow, 'choosing_time');
    assert.equal(c.selectedStaff.id, 'm');
  });

  test('profesional con varios servicios: elige servicio y va directo con él', async () => {
    await say('hola');
    const r = await say('quisiera una cita con gally');
    assert.match(body(r), /^Agendemos con Gally Torrico\./);
    assert.equal(conv().currentFlow, 'choosing_service');
    await say('2'); // Barba
    const c = conv();
    assert.equal(c.selectedStaff.id, 'g');
    assert.equal(c.currentFlow, 'choosing_time');
  });

  test('"soy Martín" no se toma como el profesional', async () => {
    await say('hola');
    const r = await say('soy martin');
    assert.match(body(r), /no logré entender/);
  });
});

describe('Texto libre en día cerrado', () => {
  beforeEach(() => seed({ closedDays: [{ id: 'x', start: hoyNegocio() }] }));

  test('nunca ofrece «Hablar con alguien»', async () => {
    await say('hola');
    const r1 = await say('asdf');
    assert.match(body(r1), /no logré entender/);
    assert.deepEqual(titulos(r1), ['Agendar otro día', 'Servicios y precios']);
    const r2 = await say('qwer');
    assert.match(body(r2), /^Hoy no hay nadie del equipo/);
    assert.ok(!titulos(r2).some((t) => /hablar|equipo/i.test(t)));
    const r3 = await say('hola');
    assert.match(body(r3), /^¡Hola de nuevo! 👋 Hoy no estamos atendiendo/);
    assert.ok(!titulos(r3).some((t) => /hablar/i.test(t)));
  });
});
