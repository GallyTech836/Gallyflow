// Texto libre a mitad de la reserva: pedir una persona, preguntar algo sin
// perder la reserva, volver atrás ("otro barbero") y el límite de "no entendí".
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

let seq = 0;
let neg;
let phone;
function seed() {
  neg = `res${++seq}`;
  phone = `59176000${String(seq).padStart(3, '0')}`;
  db._clear();
  db._set(`negocios/${neg}`, {
    heroConfig: { businessName: 'Nexus Test' },
    assistantConfig: { personalidad: { tono: 'formal' } },
    businessSettings: { schedule: allDay },
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
const ids = (r) => (r.interactive?.action?.buttons || []).map((b) => b.reply.id);
const conv = () => db._get(`negocios/${neg}/assistantConversations/${phone}`);

// Hasta la lista de profesionales con "Corte" (escrito, no con número).
async function hastaProfesionales() {
  await say('hola');
  await say('agendar');
  await say('corte');
  assert.equal(conv().currentFlow, 'choosing_staff');
}
async function hastaHorarios() {
  await hastaProfesionales();
  await say('con martin');
  assert.equal(conv().currentFlow, 'choosing_time');
  assert.equal(conv().selectedStaff.id, 'm');
}

describe('Texto libre a mitad de la reserva', () => {
  beforeEach(() => seed());

  test('escribir el nombre del servicio y del profesional los elige', async () => {
    await hastaHorarios();
    assert.deepEqual(conv().selectedServices.map((s) => s.serviceId), ['s1']);
  });

  test('"Quiero hablar con alguien" pasa a una persona desde cualquier paso', async () => {
    await hastaHorarios();
    const r = await say('Quiero hablar con alguien');
    assert.match(body(r), /una persona le atenderá/);
    assert.equal(conv().currentFlow, 'human');
  });

  test('"Ya no quiero que responda el boot" también pasa a una persona', async () => {
    await hastaProfesionales();
    await say('Ya no quiero que responda el boot');
    assert.equal(conv().currentFlow, 'human');
  });

  test('"Hacen barba?" eligiendo profesional: responde y sigue en el mismo paso', async () => {
    await hastaProfesionales();
    const r = await say('Hacen barba?');
    assert.match(body(r), /^Sí, tenemos \*Barba\*/);
    assert.match(body(r), /escriba "agregar"/);
    assert.match(body(r), /Seguimos con su cita:/);
    assert.equal(conv().currentFlow, 'choosing_staff');
    assert.ok(!/no comprendí/.test(body(r)));
  });

  test('"Ubicacion" y "precios" eligiendo hora: responde y vuelve a los horarios', async () => {
    await hastaHorarios();
    const r1 = await say('Ubicacion');
    assert.match(body(r1), /ubicación/i);
    assert.match(body(r1), /Seguimos con su cita:\n\nHorarios para/);
    const r2 = await say('información de sus precios');
    assert.match(body(r2), /• Corte/);
    assert.match(body(r2), /• Barba/);
    assert.equal(conv().currentFlow, 'choosing_time');
  });

  test('"Otro barbero" eligiendo hora: vuelve a elegir sin el actual', async () => {
    await hastaHorarios();
    await say('Otro barbero');
    const c = conv();
    assert.notEqual(c.selectedStaff?.id, 'm');
    if (c.currentFlow === 'choosing_staff') assert.deepEqual(c.staffOptionsIds, ['g']);
    else assert.equal(c.selectedStaff.id, 'g');
  });

  test('"otro servicio" vuelve a la lista de servicios', async () => {
    await hastaHorarios();
    await say('quiero otro servicio');
    assert.equal(conv().currentFlow, 'choosing_service');
  });

  test('hora escrita: "a las HH:MM" elige esa hora, no la opción número HH', async () => {
    await hastaHorarios();
    const slots = conv().availableSlotsCache;
    const objetivo = slots[slots.length - 1];
    await say(`a las ${objetivo}`);
    assert.equal(conv().selectedTime, objetivo);
    assert.equal(conv().currentFlow, 'confirming');
  });

  test('hora escrita que no está libre: avisa y muestra los horarios', async () => {
    await hastaHorarios();
    const slots = conv().availableSlotsCache;
    const libre = (h) => slots.includes(h);
    const ocupada = ['03:17', '05:13', '07:11'].find((h) => !libre(h));
    const r = await say(ocupada);
    assert.match(body(r), /^Esa hora no está libre/);
    assert.equal(conv().currentFlow, 'choosing_time');
  });

  test('al 2.º mensaje sin entender ofrece opciones y una persona (sin bucle)', async () => {
    await hastaHorarios();
    const r1 = await say('asdf qwer');
    assert.match(body(r1), /^Disculpe, no comprendí su respuesta\./);
    const r2 = await say('zzzz');
    assert.deepEqual(titulos(r2), ['Ver opciones', 'Hablar con alguien', 'Empezar de nuevo']);
    assert.match(body(r2), /Puede ver las opciones otra vez/);
    // Los botones llevan el paso; "Ver opciones" vuelve a mostrar los horarios.
    const r3 = await say(ids(r2)[0]);
    assert.match(body(r3), /^Horarios para/);
    const r4 = await say(ids(r2)[1]);
    assert.match(body(r4), /una persona le atenderá/);
    assert.equal(conv().currentFlow, 'human');
  });

  test('"cualquiera" y números siguen funcionando en profesionales', async () => {
    await hastaProfesionales();
    await say('1');
    assert.equal(conv().currentFlow, 'choosing_time');
  });
});
