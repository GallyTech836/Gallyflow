// Días cerrados / feriados en el asistente y en la creación de citas.
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
const { createAppointment } = await import('../services/appointments/createAppointment.js');

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const allDay = DIAS.map((day) => ({ day, status: 'Disponible', start: '00:00', end: '23:59' }));

// Fecha de hoy / mañana en la zona del negocio (igual que el motor).
function fechaNegocio(offset = 0) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m, d] = p.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + offset));
  return f.toISOString().slice(0, 10);
}
const HOY = fechaNegocio(0);
const MANANA = fechaNegocio(1);

let seq = 0;
let neg;
let phone;
function seed({ closedDays = [], personalidad = null } = {}) {
  neg = `cerr${++seq}`;
  phone = `59174000${String(seq).padStart(3, '0')}`;
  db._clear();
  db._set(`negocios/${neg}`, {
    heroConfig: { businessName: 'Royal Barber' },
    assistantConfig: personalidad ? { personalidad } : {},
    businessSettings: { schedule: allDay, closedDays },
  });
  db._set(`negocios/${neg}/servicios/s1`, { name: 'Corte', price: 100, duration: 30 });
  db._set(`negocios/${neg}/profesionales/a`, { name: 'Ana', active: true, branch: 'Centro', availability: allDay, services: [{ serviceId: 's1' }] });
  db._set(`negocios/${neg}/clientes/${phone}`, { name: 'Juan Perez', phone });
}
const say = (m, branch = null) => assistantEngine({ negocioId: neg, phone, message: m, branch });
const titulos = (r) => [
  ...(r.interactive?.action?.buttons || []).map((b) => b.reply.title),
  ...(r.interactive?.action?.sections?.[0]?.rows || []).map((x) => x.title),
];

describe('Días cerrados en el asistente', () => {
  beforeEach(() => seed());

  test('día normal: saludo de siempre con «Hablar con alguien»', async () => {
    const r = await say('hola');
    assert.ok(titulos(r).includes('Hablar con alguien'));
  });

  test('feriado hoy: saluda, avisa con el motivo y no ofrece hablar con alguien', async () => {
    seed({ closedDays: [{ id: 'x', start: HOY, reason: 'Feriado' }] });
    const r = await say('hola');
    const body = r.interactive.body.text;
    assert.match(body, /^Hola Juan 👋 Soy el asistente de Royal Barber\./);
    assert.match(body, /Hoy no estamos atendiendo \(Feriado\) 🙏 Volvemos mañana\./);
    assert.ok(!titulos(r).some((t) => /hablar/i.test(t)), titulos(r).join(','));
    assert.ok(titulos(r).includes('Agendar otro día'));
  });

  test('la respuesta sigue la personalidad (formal)', async () => {
    seed({ closedDays: [{ id: 'x', start: HOY, reason: 'Feriado' }], personalidad: { tono: 'formal' } });
    const r = await say('hola');
    assert.match(r.interactive.body.text, /Le informamos que hoy no estamos atendiendo \(Feriado\)\. Retomamos la atención mañana\./);
    assert.match(r.interactive.body.text, /¿Desea agendar para otro día\?/);
  });

  test('pedir hablar con alguien en día cerrado: avisa que no hay equipo', async () => {
    seed({ closedDays: [{ id: 'x', start: HOY }] });
    await say('hola');
    const r = await say('hablar con alguien');
    assert.match(r.interactive.body.text, /Hoy no hay nadie del equipo/);
    const conv = db._get(`negocios/${neg}/assistantConversations/${phone}`);
    assert.notEqual(conv?.currentFlow, 'human');
  });

  test('agendar en día cerrado: los horarios empiezan otro día', async () => {
    seed({ closedDays: [{ id: 'x', start: HOY, end: MANANA }] });
    await say('hola');
    await say('1');
    const r = await say('1'); // servicio Corte → Ana (única) → horarios
    const conv = db._get(`negocios/${neg}/assistantConversations/${phone}`);
    assert.equal(conv.currentFlow, 'choosing_time');
    assert.ok(conv.selectedDate > MANANA, `${conv.selectedDate} debe ser después de ${MANANA}`);
    assert.ok(r.interactive);
  });

  test('cierre de otra sucursal no afecta a este número', async () => {
    seed({ closedDays: [{ id: 'x', start: HOY, branch: 'Norte' }] });
    const r = await say('hola', 'Centro');
    assert.ok(titulos(r).includes('Hablar con alguien'));
  });
});

describe('Días cerrados al crear la cita', () => {
  test('no deja reservar un día cerrado', async () => {
    seed({ closedDays: [{ id: 'x', start: '2030-05-01', reason: 'Feriado' }] });
    const base = {
      negocioId: neg, professionalId: 'a', time: '10:00', serviceDuration: 30,
      services: [{ serviceId: 's1', serviceName: 'Corte', duration: 30 }], clientName: 'Juan',
    };
    await assert.rejects(createAppointment({ ...base, date: '2030-05-01' }), /no está disponible/);
    const ok = await createAppointment({ ...base, date: '2030-05-02' });
    assert.equal(ok.date, '2030-05-02');
  });
});
