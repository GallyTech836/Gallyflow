// Personalidad del asistente de punta a punta: lo que el bot envía cambia de
// tono, pero los botones, ids y el flujo de reserva siguen iguales.
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
const EMOJI = /\p{Extended_Pictographic}/u;
let seq = 0;
let neg;
let phone;

function seed(personalidad) {
  neg = `neg${++seq}`; // negocio nuevo en cada prueba (el contexto se cachea 60 s por negocio)
  phone = `59173000${String(seq).padStart(3, '0')}`;
  db._clear();
  db._set(`negocios/${neg}`, { heroConfig: { businessName: 'Royal Barber' }, assistantConfig: personalidad ? { personalidad } : {}, businessSettings: { schedule: allDay } });
  db._set(`negocios/${neg}/servicios/s1`, { name: 'Corte', price: 100, duration: 30 });
  db._set(`negocios/${neg}/profesionales/a`, { name: 'Ana', active: true, availability: allDay, services: [{ serviceId: 's1' }], avatar: 'https://res.cloudinary.com/x/upload/a.jpg' });
  db._set(`negocios/${neg}/profesionales/b`, { name: 'Beto', active: true, availability: allDay, services: [{ serviceId: 's1' }] });
  db._set(`negocios/${neg}/clientes/${phone}`, { name: 'Juan Perez', phone });
}
const say = (m) => assistantEngine({ negocioId: neg, phone, message: m });
const ids = (r) => [...(r.interactive?.action?.buttons || []).map((b) => b.reply.id), ...(r.interactive?.action?.sections?.[0]?.rows || []).map((x) => x.id)];

describe('Personalidad en el asistente', () => {
  beforeEach(() => seed(null));

  test('sin configurar: mensajes como siempre', async () => {
    const r = await say('hola');
    assert.equal(r.interactive.body.text, 'Hola Juan 👋 Soy el asistente de Royal Barber. ¿En qué te ayudo?');
  });

  test('formal: usted y sin emojis en todo, mismos botones e ids', async () => {
    const normal = await say('hola');
    seed({ tono: 'formal' });
    const r = await say('hola');
    assert.match(r.interactive.body.text, /^Buen(os|as) (días|tardes|noches), Juan\. Le saluda el asistente virtual de Royal Barber\. ¿En qué puedo ayudarle\?$/);
    assert.deepEqual(ids(r), ids(normal));
    await say('1');
    const pros = await say('1');
    assert.match(pros.interactive.body.text, /¿Con quién desea atenderse\?/);
    for (const row of pros.interactive.action.sections[0].rows) assert.doesNotMatch(row.title, EMOJI, row.title);
    const err = await say('zzz');
    assert.match(err.interactive.body.text, /^Disculpe, no comprendí su respuesta\./);
    await say('1'); // Ana
    const confirm = await say('1'); // primera hora (el nombre ya se conoce)
    assert.match(confirm.interactive.body.text, /^Confirme su cita:/);
    const fin = await say('1');
    assert.match(fin.replyText, /^Cita confirmada .* Muchas gracias por su preferencia\.$/);
    assert.doesNotMatch(fin.replyText, EMOJI);
  });

  test('cercano + sin emojis (combinado)', async () => {
    seed({ tono: 'cercano', emojis: false });
    const r = await say('hola');
    assert.match(r.interactive.body.text, /^¡Hola Juan! Aquí el asistente de Royal Barber ¿Qué hacemos hoy\?$/);
    assert.doesNotMatch(r.interactive.body.text, EMOJI);
  });

  test('saludo propio y mensaje al confirmar', async () => {
    seed({ tono: 'amigable', saludo: '¡Bienvenido a {negocio}, {nombre}! ✂️', despedida: 'Llega 5 minutos antes, por favor.' });
    const r = await say('hola');
    assert.equal(r.interactive.body.text, '¡Bienvenido a Royal Barber, Juan! ✂️ ¿En qué te ayudo?');
    await say('1'); await say('1'); await say('1'); await say('1');
    const fin = await say('1');
    assert.match(fin.replyText, /¡Gracias!\n\nLlega 5 minutos antes, por favor\.$/);
  });

  test('anuncio y "hablar con alguien" usan la personalidad', async () => {
    seed({ tono: 'breve' });
    const ad = await say('Quiero más información');
    assert.equal(ad.interactive.body.text, 'Hola Juan. Reservas de Royal Barber.\n¿Qué quieres saber?');
    const h = await say('2');
    assert.match(h.replyText || h.interactive.body.text, /^Listo, avisé al equipo\. Te responderán por aquí\./);
  });
});
