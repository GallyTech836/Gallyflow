// Profesional nombrado que ya no tiene horarios hoy: el bot lo avisa antes de
// pedir el servicio, con su próximo espacio y opciones. Y cuando los horarios
// mostrados ya no son de hoy, lo dice.
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
const TZ = process.env.APP_TIMEZONE || 'America/La_Paz';
const isoEn = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const hoy = () => isoEn(new Date());
const manana = () => isoEn(new Date(Date.now() + 86400000));

let seq = 0;
let neg;
let phone;
function seed({ bloqueados = [] } = {}) {
  neg = `slh${++seq}`;
  phone = `59176000${String(seq).padStart(3, '0')}`;
  db._clear();
  db._set(`negocios/${neg}`, {
    heroConfig: { businessName: 'Nexus Test' },
    assistantConfig: {},
    businessSettings: { schedule: allDay },
  });
  db._set(`negocios/${neg}/servicios/s1`, { name: 'Corte', price: 100, duration: 30 });
  db._set(`negocios/${neg}/servicios/s2`, { name: 'Barba', price: 50, duration: 30 });
  db._set(`negocios/${neg}/profesionales/m`, { name: 'Martín Pérez', active: true, availability: allDay, services: [{ serviceId: 's1' }] });
  db._set(`negocios/${neg}/profesionales/g`, { name: 'Gally Torrico', active: true, availability: allDay, services: [{ serviceId: 's1' }, { serviceId: 's2' }] });
  db._set(`negocios/${neg}/clientes/${phone}`, { name: 'Juan Perez', phone });
  // Bloqueado todo el día de hoy.
  bloqueados.forEach((id, i) => db._set(`negocios/${neg}/horariosBloqueados/b${i}`, { date: hoy(), barberId: id, startTime: '00:00', endTime: '23:59' }));
}
const say = (m) => assistantEngine({ negocioId: neg, phone, message: m });
const body = (r) => r.interactive?.body?.text || r.replyText;
const titulos = (r) => [
  ...(r.interactive?.action?.buttons || []).map((b) => b.reply.title),
  ...(r.interactive?.action?.sections?.[0]?.rows || []).map((x) => x.title),
];
const conv = () => db._get(`negocios/${neg}/assistantConversations/${phone}`);

describe('Profesional nombrado sin horarios hoy', () => {
  beforeEach(() => seed({ bloqueados: ['g'] }));

  test('avisa antes del servicio, con su próximo espacio y opciones', async () => {
    await say('hola');
    const r = await say('quisiera una cita con gally');
    assert.equal(body(r), 'Gally Torrico ya no tiene horarios libres hoy. Su próximo espacio es mañana desde las 00:00.');
    assert.deepEqual(titulos(r), ['Agendar con Gally', 'Otro profesional hoy', '📅 Otro día']);
    assert.equal(conv().currentFlow, 'pro_unavailable_today');
  });

  test('"Agendar con Gally": servicio y horarios de mañana sin repetir el aviso', async () => {
    await say('hola');
    await say('quisiera una cita con gally');
    await say('conpro');
    assert.equal(conv().currentFlow, 'choosing_service');
    const r = await say('2'); // Barba
    const c = conv();
    assert.equal(c.selectedStaff.id, 'g');
    assert.equal(c.currentFlow, 'choosing_time');
    assert.equal(c.selectedDate, manana());
    assert.doesNotMatch(body(r), /Hoy ya no hay/);
  });

  test('"Otro profesional hoy": no ofrece a Gally y muestra horarios de hoy', async () => {
    await say('hola');
    await say('quisiera una cita con gally');
    await say('otrohoy');
    await say('1'); // Corte
    assert.deepEqual(conv().staffOptionsIds, ['m']);
    await say('1'); // Martín
    assert.equal(conv().selectedDate, hoy());
  });

  test('"Otro día" (también escrito como "3"): lista de días sin hoy', async () => {
    await say('hola');
    await say('quisiera una cita con gally');
    await say('3');
    await say('2'); // Barba
    const c = conv();
    assert.equal(c.currentFlow, 'choosing_date');
    assert.ok(c.dateOptionsCache.length > 0);
    assert.ok(!c.dateOptionsCache.some((d) => d.id === hoy()));
  });

  test('flujo normal: horarios de mañana avisan que hoy ya no hay', async () => {
    await say('hola');
    await say('1');
    await say('2'); // Barba
    const r = await say('1'); // Gally
    assert.match(body(r), /^Hoy ya no hay horarios libres con Gally Torrico\./);
    assert.equal(conv().selectedDate, manana());
  });
});

describe('Nadie tiene horarios hoy', () => {
  beforeEach(() => seed({ bloqueados: ['g', 'm'] }));

  test('sin "Otro profesional hoy" en las opciones', async () => {
    await say('hola');
    const r = await say('quisiera una cita con gally');
    assert.deepEqual(titulos(r), ['Agendar con Gally', '📅 Otro día']);
  });

  test('"Cualquier profesional": avisa que hoy ya no hay horarios', async () => {
    await say('hola');
    await say('1');
    await say('1'); // Corte: Martín o Gally
    const r = await say('3'); // Cualquier profesional
    assert.match(body(r), /^Hoy ya no tenemos horarios libres\./);
  });
});

describe('Profesional con lugar hoy', () => {
  beforeEach(() => seed());

  test('sigue igual: pide el servicio', async () => {
    await say('hola');
    const r = await say('quisiera una cita con gally');
    assert.match(body(r), /^Agendemos con Gally Torrico\./);
    assert.equal(conv().currentFlow, 'choosing_service');
  });
});
