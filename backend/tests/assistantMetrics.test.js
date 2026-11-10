// Métricas del Asistente de WhatsApp: entrantes sin duplicados, sesiones
// (conversaciones), categorías y el webhook completo (salientes solo si se
// enviaron, evento de reserva una sola vez).

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';
import { createFakeRouter } from './helpers/fakeExpress.js';

const db = createFakeDb();
const router = createFakeRouter();

// Configuración de seguimiento por negocio (lo que devolvería getNegocioAccess).
const accesos = new Map();
const capabilityMock = {
  getNegocioAccess: async (id) => accesos.get(id) || { assistantMetrics: null },
  invalidateNegocioAccess: () => {},
  checkCapability: async () => ({ allowed: true, limit: null }),
  incrementUsage: async (negocioId, key, n) => {
    await db.collection('negocios').doc(negocioId).collection('uso').doc('2026-11').set({ [key]: FieldValue.increment(n) }, { merge: true });
  },
  incrementRejected: async () => {},
  resolveUsageBranch: async () => ({ id: 'sin-sucursal', name: '' }),
  checkBranchLimit: async () => ({ allowed: true }),
  incrementBranchUsage: async () => {},
  incrementClientUsage: async () => {},
};

// Respuesta del motor y comportamiento del proveedor, configurables por prueba.
let respuestaMotor = null;
let falloEnvio = false;
let enviados = 0;
const providerMock = {
  resolveAccount: async (id) => (id === 'pnA' ? { negocioId: 'negA', phoneNumberId: 'pnA', token: 't', provider: 'meta', phone: null } : null),
  markAsRead: () => {},
  send: async () => { if (falloEnvio) throw new Error('Meta API error'); enviados += 1; return {}; },
  sendInteractive: async () => { if (falloEnvio) throw new Error('Meta API error'); enviados += 1; return {}; },
  clearAccountCache: () => {},
};

mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('express', { namedExports: { Router: () => router } });
mock.module('../services/capabilities/capabilityService.js', { namedExports: capabilityMock });
mock.module('../services/providers/whatsappProvider.js', { namedExports: providerMock });
mock.module('../services/assistantEngine/router.js', { namedExports: { runAssistant: async () => respuestaMotor } });
mock.module('../services/appointments/conversationState.js', { namedExports: { updateConversation: async () => ({}) } });

const M = await import('../services/assistantMetrics/assistantMetrics.js');
await import('../routes/whatsappWebhook.routes.js');

const uso = (negocio = 'negA', mes = '2026-11') => db._get(`negocios/${negocio}/uso/${mes}`) || {};
const T0 = new Date('2026-11-05T14:00:00Z'); // 10:00 en La Paz
const masMin = (min) => new Date(T0.getTime() + min * 60000);

beforeEach(() => {
  db._clear();
  accesos.clear();
  respuestaMotor = null;
  falloEnvio = false;
  enviados = 0;
});

describe('Entrantes y conversaciones', () => {
  test('cuenta un entrante y abre una conversación (consulta)', async () => {
    const r = await M.recordInbound({ negocioId: 'negA', phone: '59170000001', messageId: 'w1', now: T0 });
    assert.equal(r.counted, true);
    assert.equal(r.nuevaSesion, true);
    const u = uso();
    assert.equal(u.asistente.entrantes, 1);
    assert.equal(u.asistente.dias['05'].entrantes, 1);
    assert.equal(u.asistente.conversaciones.consulta, 1);
  });

  test('el mismo messageId (webhook repetido) no se cuenta dos veces', async () => {
    await M.recordInbound({ negocioId: 'negA', phone: '59170000001', messageId: 'w1', now: T0 });
    const r = await M.recordInbound({ negocioId: 'negA', phone: '59170000001', messageId: 'w1', now: masMin(1) });
    assert.equal(r.duplicate, true);
    assert.equal(uso().asistente.entrantes, 1);
  });

  test('mensajes con menos de 30 min son la misma conversación; después, otra', async () => {
    await M.recordInbound({ negocioId: 'negA', phone: '59170000001', messageId: 'w1', now: T0 });
    await M.recordInbound({ negocioId: 'negA', phone: '59170000001', messageId: 'w2', now: masMin(10) });
    await M.recordInbound({ negocioId: 'negA', phone: '59170000001', messageId: 'w3', now: masMin(39) });
    assert.equal(uso().asistente.conversaciones.consulta, 1, 'w1-w3 en la misma sesión');
    await M.recordInbound({ negocioId: 'negA', phone: '59170000001', messageId: 'w4', now: masMin(80) });
    assert.equal(uso().asistente.conversaciones.consulta, 2);
    assert.equal(uso().asistente.entrantes, 4);
  });

  test('no guarda el celular: el id de la sesión es un hash', async () => {
    await M.recordInbound({ negocioId: 'negA', phone: '59170000001', messageId: 'w1', now: T0 });
    const docs = db._list('negocios/negA/asistenteSesiones');
    assert.equal(docs.length, 1);
    assert.doesNotMatch(JSON.stringify(docs[0]), /70000001/);
    assert.equal(docs[0].id, M.sessionDocId('negA', '59170000001'));
  });

  test('intento de reserva sin confirmar = abandonada; luego reserva: se mueve, una sola vez', async () => {
    const tel = '59170000002';
    await M.recordInbound({ negocioId: 'negA', phone: tel, messageId: 'a1', now: T0 });
    await M.recordConversationEvent({ negocioId: 'negA', phone: tel, flow: 'choosing_service', now: T0 });
    let c = uso().asistente.conversaciones;
    assert.equal(c.consulta, 0);
    assert.equal(c.abandonada, 1);

    await M.recordConversationEvent({ negocioId: 'negA', phone: tel, flow: 'welcome', event: 'reserva', now: masMin(3) });
    await M.recordConversationEvent({ negocioId: 'negA', phone: tel, flow: 'welcome', event: 'reserva', now: masMin(4) });
    c = uso().asistente.conversaciones;
    assert.equal(c.abandonada, 0);
    assert.equal(c.reserva, 1);
    assert.equal(uso().asistente.dias['05'].conversaciones.reserva, 1);
  });

  test('pasar con una persona = transferida; una reserva después gana', async () => {
    const tel = '59170000003';
    await M.recordInbound({ negocioId: 'negA', phone: tel, messageId: 'h1', now: T0 });
    await M.recordConversationEvent({ negocioId: 'negA', phone: tel, flow: 'human', event: 'humano', now: T0 });
    assert.equal(uso().asistente.conversaciones.humano, 1);
    await M.recordConversationEvent({ negocioId: 'negA', phone: tel, event: 'reserva', now: masMin(5) });
    const c = uso().asistente.conversaciones;
    assert.equal(c.humano, 0);
    assert.equal(c.reserva, 1);
  });

  test('sin sesión abierta, un evento no crea conversaciones', async () => {
    const r = await M.recordConversationEvent({ negocioId: 'negA', phone: '59170000009', event: 'humano', now: T0 });
    assert.equal(r.changed, false);
    assert.deepEqual(uso(), {});
  });

  test('seguimiento pausado: no registra nada nuevo', async () => {
    accesos.set('negA', { assistantMetrics: { enabled: false, startDate: '2026-11-01' } });
    const r = await M.recordInbound({ negocioId: 'negA', phone: '59170000001', messageId: 'p1', now: T0 });
    assert.equal(r.paused, true);
    await M.recordOutboundDaily({ negocioId: 'negA', now: T0 });
    assert.deepEqual(uso(), {});
  });

  test('categoriaDe respeta la prioridad', () => {
    assert.equal(M.categoriaDe({}), 'consulta');
    assert.equal(M.categoriaDe({ intento: true }), 'abandonada');
    assert.equal(M.categoriaDe({ intento: true, humano: true }), 'humano');
    assert.equal(M.categoriaDe({ humano: true, reprogramacion: true }), 'reprogramacion');
    assert.equal(M.categoriaDe({ reprogramacion: true, reserva: true }), 'reserva');
  });

  test('estado de seguimiento', () => {
    assert.equal(M.trackingState(null, '2026-11-02'), 'pruebas');
    assert.equal(M.trackingState({ startDate: '2026-11-10' }, '2026-11-02'), 'pruebas');
    assert.equal(M.trackingState({ startDate: '2026-11-01' }, '2026-11-02'), 'medicion');
    assert.equal(M.trackingState({ startDate: '2026-11-01', enabled: false }, '2026-11-02'), 'pausado');
    assert.equal(M.isValidDate('2026-02-30'), false);
  });
});

// ───────────────────────── Webhook completo ─────────────────────────

const ruta = router.routes.find((r) => r.method === 'POST' && r.path === '/whatsapp/webhook');
process.env.WHATSAPP_APP_SECRET = 'secreto-prueba';
process.env.ASSISTANT_TEXT_WINDOW_MS = '0'; // textos al instante en estas pruebas

async function webhook(mensajes) {
  const body = { entry: [{ changes: [{ value: { metadata: { phone_number_id: 'pnA', display_phone_number: '591' }, messages: mensajes } }] }] };
  const rawBody = Buffer.from(JSON.stringify(body));
  const firma = `sha256=${crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex')}`;
  const req = { body, rawBody, get: (h) => (String(h).toLowerCase() === 'x-hub-signature-256' ? firma : undefined) };
  const res = { status() { return res; }, json() { return res; }, sendStatus() { return res; } };
  for (const h of ruta.handlers) await h(req, res, () => {});
}

const texto = (id, body = 'hola', from = '59170000001') => ({ id, from, type: 'text', text: { body } });

describe('Webhook', () => {
  test('un mensaje: 1 entrante, 1 saliente contado (mensual y diario)', async () => {
    respuestaMotor = { replyText: 'Hola', interactive: null, conversation: { currentFlow: 'welcome' } };
    await webhook([texto('m1')]);
    const u = uso();
    assert.equal(enviados, 1);
    assert.equal(u.whatsappMensajes, 1);
    assert.equal(u.asistente.entrantes, 1);
    assert.equal(Object.values(u.asistente.dias)[0].enviados, 1);
  });

  test('webhook repetido: el entrante no se cuenta dos veces', async () => {
    respuestaMotor = { replyText: 'Hola', conversation: { currentFlow: 'welcome' } };
    await webhook([texto('m1')]);
    respuestaMotor = { replyText: null, conversation: { currentFlow: 'welcome' } }; // el motor ignora el repetido
    await webhook([texto('m1')]);
    const u = uso();
    assert.equal(u.asistente.entrantes, 1);
    assert.equal(u.whatsappMensajes, 1);
  });

  test('envío rechazado por Meta: no cuenta como saliente', async () => {
    falloEnvio = true;
    respuestaMotor = { replyText: 'Hola', interactive: { type: 'button' }, conversation: { currentFlow: 'welcome' } };
    await webhook([texto('m2')]).catch(() => {});
    const u = uso();
    assert.equal(u.whatsappMensajes, undefined);
    assert.equal(Object.values(u.asistente?.dias || {})[0]?.enviados, undefined);
    assert.equal(u.asistente.entrantes, 1, 'el entrante sí llegó');
  });

  test('reserva confirmada: la conversación queda como reserva una sola vez', async () => {
    respuestaMotor = { replyText: 'Servicios', conversation: { currentFlow: 'choosing_service' } };
    await webhook([texto('r1', '1')]);
    respuestaMotor = { replyText: '✅ Cita confirmada', conversation: { currentFlow: 'welcome' }, metricEvent: 'reserva' };
    await webhook([texto('r2', '1')]);
    await webhook([texto('r2', '1')]); // repetido
    const c = uso().asistente.conversaciones;
    assert.equal(c.reserva, 1);
    assert.equal(c.abandonada, 0);
    assert.equal(c.consulta, 0);
  });
});
