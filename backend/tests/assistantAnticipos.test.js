// Asistente de WhatsApp con anticipos por QR: el resumen ya llega con el QR
// (sin paso "Confirmar"), el cliente manda el comprobante (foto o PDF), y el
// asistente le escribe recién cuando el dueño confirma o rechaza. Firestore en memoria, sin red.
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
  return say('Juan Perez'); // sin paso "Confirmar": llega el resumen con el QR
}
const comprobante = (mimeType = 'image/jpeg') => assistantEngine({ negocioId: 'neg', phone, message: '', media: [{ id: 'm1', mimeType }] });

describe('Asistente: anticipo sin paso de confirmar', () => {
  beforeEach(seed);

  test('después del nombre manda el resumen con el QR y queda por confirmar', async () => {
    const r = await reservar();
    assert.equal(r.interactive.header.image.link, QR);
    assert.match(r.interactive.body.text, /Corte con Ana/);
    assert.match(r.interactive.body.text, /paga el anticipo de \*Bs 50\*/);
    assert.match(r.interactive.body.text, /Tienes 5 minutos/);
    assert.match(r.interactive.body.text, /comprobante/);
    const botones = r.interactive.action.buttons.map((b) => b.reply.id);
    assert.equal(botones.length, 1);
    assert.match(botones[0], /anticipo_cancelar\|/);
    const [cita] = db._list(`${N}/citas`);
    assert.equal(cita.status, 'pending');
    assert.equal(cita.deposit.status, 'awaiting');
    assert.equal(cita.bookedBy, 'assistant');
    assert.equal(sent.find((n) => n.tipo === 'RESERVA_POR_CONFIRMAR')?.data.amount, 50);
  });

  test('la foto o el PDF del comprobante avisa al dueño y alarga el tiempo; no confirma solo', async () => {
    await reservar();
    sent.length = 0;
    const resp = await comprobante('application/pdf');
    assert.match(body(resp), /Recibí tu comprobante/);
    const [cita] = db._list(`${N}/citas`);
    assert.ok(cita.deposit.reportedAt);
    assert.ok(cita.deposit.receiptAt);
    assert.equal(cita.deposit.receiptType, 'pdf');
    assert.equal(cita.deposit.status, 'awaiting');
    assert.equal(sent[0].tipo, 'ANTICIPO_REPORTADO');
    assert.equal(sent[0].data.comprobante, true);
    assert.equal(whatsapp.length, 0); // el "confirmado" llega recién cuando el dueño confirma
    // una segunda foto también se registra
    const otra = await comprobante();
    assert.match(body(otra), /Recibí tu comprobante/);
  });

  test('"ya pagué" escrito avisa y pide el comprobante', async () => {
    await reservar();
    const r = await say('ya pagué');
    assert.match(body(r), /foto o el PDF del comprobante/);
    assert.ok(db._list(`${N}/citas`)[0].deposit.reportedAt);
  });

  test('cuando el dueño confirma, el asistente le escribe al cliente', async () => {
    await reservar();
    await comprobante();
    const [cita] = db._list(`${N}/citas`);
    await S.confirmDeposit('neg', cita.id, { actor: { uid: 'admin' } });
    assert.equal(whatsapp.length, 1);
    assert.equal(whatsapp[0].to, phone);
    assert.match(whatsapp[0].text, /Recibimos tu anticipo de Bs 50/);
    assert.equal(whatsapp[0].envio.phoneNumberId, 'pn1');
  });

  test('si vence sin comprobante, el asistente le avisa que se liberó', async () => {
    await reservar();
    const [cita] = db._list(`${N}/citas`);
    await S.sweepHolds(Date.now() + 6 * 60000);
    assert.match(whatsapp[0].text, /Se acabó el tiempo para pagar el anticipo/);
    assert.equal(db._get(`${N}/citas/${cita.id}`).status, 'cancelled');
  });

  test('"Cancelar reserva" la cancela y libera el horario', async () => {
    const r = await reservar();
    const resp = await say(r.interactive.action.buttons[0].reply.id);
    assert.match(body(resp), /cancelé tu reserva/);
    const [cita] = db._list(`${N}/citas`);
    assert.equal(cita.status, 'cancelled');
    assert.equal(sent.at(-1).tipo, 'RESERVA_CANCELADA');
  });

  test('una foto sin reserva esperando anticipo no se toma como comprobante', async () => {
    await say('hola');
    const r = await comprobante();
    assert.doesNotMatch(body(r) || '', /Recibí tu comprobante/);
  });

  test('las frases del anticipo siguen la personalidad (formal)', async () => {
    db._set(N, { ...db._get(N), assistantConfig: { personalidad: { tono: 'formal' } } });
    invalidateBusinessContext?.('neg');
    const r = await reservar();
    assert.match(r.interactive.body.text, /le pedimos pagar el anticipo de \*Bs 50\* mediante este QR\. Dispone de 5 minutos/);
    const resp = await comprobante();
    assert.match(body(resp), /Hemos recibido su comprobante/);
    const [cita] = db._list(`${N}/citas`);
    await S.confirmDeposit('neg', cita.id, { actor: { uid: 'admin' } });
    assert.match(whatsapp[0].text, /^Hemos recibido su anticipo de Bs 50\. Su reserva del .+ quedó confirmada\. Le esperamos\.$/);
  });
});
