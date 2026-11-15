// Asistente de WhatsApp con anticipos por QR: pide el anticipo antes de
// confirmar, "Ya pagué" avisa al dueño, y el asistente le escribe al cliente
// cuando el dueño confirma o rechaza. Firestore en memoria, sin red.
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';

const db = createFakeDb();
const sent = [];      // push
const whatsapp = [];  // mensajes al cliente

mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('../services/notificationService.js', {
  namedExports: { sendNotification: async (n) => { sent.push(n); return {}; }, sendDirectNotification: async () => ({}), getRecipients: async () => [] },
});
mock.module('../services/providers/whatsappProvider.js', {
  namedExports: {
    send: async (to, text, envio) => { whatsapp.push({ to, text, envio }); return {}; },
    sendInteractive: async () => ({}), resolveAccount: async () => null, clearAccountCache: () => {}, markAsRead: async () => {},
  },
});
mock.module('../services/capabilities/capabilityService.js', {
  namedExports: {
    getNegocioAccess: async () => ({ capabilities: { asistenteWhatsapp: { enabled: true }, anticipos: { enabled: true } } }),
    checkCapability: async () => ({ allowed: true }), DENY_MESSAGES: {}, invalidateNegocioAccess: () => {},
    incrementUsage: async () => {}, incrementClientUsage: async () => {}, incrementRejected: async () => {},
    currentPeriod: () => 'test', getUsage: async () => ({}), requireCapability: () => (req, res, next) => next(),
  },
});

const { assistantEngine } = await import('../services/assistantEngine/engine.js');
const { invalidateBusinessContext } = await import('../services/appointments/businessContext.js');
const S = await import('../services/anticipos/anticipoService.js');

const N = 'negocios/neg';
const QR = 'https://res.cloudinary.com/demo/qr.png';
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const allDay = () => DIAS.map((day) => ({ day, status: 'Disponible', start: '00:00', end: '23:59' }));

let seq = 0;
let phone;
function seed() {
  db._clear();
  sent.length = 0;
  whatsapp.length = 0;
  invalidateBusinessContext?.('neg');
  phone = `5917300${String(++seq).padStart(4, '0')}`;
  db._set(N, {
    slug: 'neg', heroConfig: { businessName: 'Barbería Test' },
    businessSettings: {
      schedule: allDay(), paymentMethods: ['Efectivo', 'QR'],
      anticipos: { enabled: true, mode: 'percent', value: 50, minutes: 5, verifyMinutes: 120, method: 'QR', qrImage: QR, instructions: 'Pon tu nombre en la glosa' },
    },
  });
  db._set('whatsappAccounts/pn1', { negocioId: 'neg', provider: 'meta' });
  db._set(`${N}/servicios/s1`, { name: 'Corte', price: 100, duration: 30, order: 1 });
  db._set(`${N}/profesionales/ana`, { name: 'Ana', active: true, availability: allDay(), services: [{ serviceId: 's1' }] });
}
const say = (message) => assistantEngine({ negocioId: 'neg', phone, message });
const body = (r) => r.interactive?.body?.text || r.replyText;

async function reservar() {
  await say('hola');
  await say('1');          // agendar / servicios
  await say('1');          // Corte
  await say('1');          // primera hora (con un solo profesional se elige solo)
  return say('Juan Perez');
}

describe('Asistente: anticipo antes de confirmar', () => {
  beforeEach(seed);

  test('el resumen avisa del anticipo; al confirmar manda el QR y queda por confirmar', async () => {
    const resumen = await reservar();
    assert.match(body(resumen), /se pide un anticipo del 50 % del precio por QR/);
    const r = await say('1'); // Confirmar
    assert.equal(r.interactive.header.image.link, QR);
    assert.match(r.interactive.body.text, /paga el anticipo de \*Bs 50\*/);
    assert.match(r.interactive.body.text, /Tienes 5 minutos/);
    assert.ok(r.interactive.action.buttons.some((b) => /anticipo_pague\|/.test(b.reply.id)));
    const [cita] = db._list(`${N}/citas`);
    assert.equal(cita.status, 'pending');
    assert.equal(cita.deposit.status, 'awaiting');
    assert.equal(cita.bookedBy, 'assistant');
    assert.equal(sent.find((n) => n.tipo === 'RESERVA_POR_CONFIRMAR')?.data.amount, 50);
  });

  test('"Ya pagué" (botón o escrito) avisa al dueño y alarga el tiempo', async () => {
    await reservar();
    const r = await say('1');
    const pague = r.interactive.action.buttons.find((b) => /anticipo_pague/.test(b.reply.id)).reply.id;
    sent.length = 0;
    const resp = await say(pague);
    assert.match(body(resp), /Le avisé al negocio/);
    const [cita] = db._list(`${N}/citas`);
    assert.ok(cita.deposit.reportedAt);
    assert.equal(sent[0].tipo, 'ANTICIPO_REPORTADO');
    // escrito, sin botón: también lo encuentra
    const otra = await say('ya pagué');
    assert.match(body(otra), /Le avisé al negocio/);
  });

  test('cuando el dueño confirma, el asistente le escribe al cliente', async () => {
    await reservar();
    await say('1');
    const [cita] = db._list(`${N}/citas`);
    await S.confirmDeposit('neg', cita.id, { actor: { uid: 'admin' } });
    assert.equal(whatsapp.length, 1);
    assert.equal(whatsapp[0].to, phone);
    assert.match(whatsapp[0].text, /Recibimos tu anticipo de Bs 50/);
    assert.equal(whatsapp[0].envio.phoneNumberId, 'pn1');
  });

  test('si vence, el asistente le avisa que se liberó', async () => {
    await reservar();
    await say('1');
    const [cita] = db._list(`${N}/citas`);
    await S.sweepHolds(Date.now() + 6 * 60000);
    assert.match(whatsapp[0].text, /Se acabó el tiempo para pagar el anticipo/);
    assert.equal(db._get(`${N}/citas/${cita.id}`).status, 'cancelled');
  });

  test('"Cancelar reserva" la cancela y libera el horario', async () => {
    await reservar();
    const r = await say('1');
    const cancelar = r.interactive.action.buttons.find((b) => /anticipo_cancelar/.test(b.reply.id)).reply.id;
    const resp = await say(cancelar);
    assert.match(body(resp), /cancelé tu reserva/);
    const [cita] = db._list(`${N}/citas`);
    assert.equal(cita.status, 'cancelled');
    assert.equal(sent.at(-1).tipo, 'RESERVA_CANCELADA');
  });
});
