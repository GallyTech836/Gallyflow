// Cola de mensajes entrantes de WhatsApp: deduplicación, procesamiento de a
// una ejecución por conversación, lotes de fotos, reacciones y recuperación.
// Firestore en memoria, sin red.
//
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';
import { createFakeRouter } from './helpers/fakeExpress.js';

process.env.ASSISTANT_MEDIA_WINDOW_MS = '80'; // ventana corta para las pruebas
process.env.WHATSAPP_APP_SECRET = 'secreto-prueba';
process.env.YCLOUD_WEBHOOK_SECRET = 'whsec_prueba';

const db = createFakeDb();
const router = createFakeRouter();

const capabilityMock = {
  getNegocioAccess: async () => ({ assistantMetrics: null }),
  invalidateNegocioAccess: () => {},
  checkCapability: async () => ({ allowed: true, limit: null }),
  incrementUsage: async () => {},
  incrementRejected: async () => {},
  resolveUsageBranch: async () => ({ id: 'sin-sucursal', name: '' }),
  checkBranchLimit: async () => ({ allowed: true }),
  incrementBranchUsage: async () => {},
  incrementClientUsage: async () => {},
};

let enviados = [];
let resolveFalla = false;
const providerMock = {
  resolveAccount: async (id) => {
    if (resolveFalla) throw new Error('Firestore caído');
    if (id === 'pnA') return { negocioId: 'negA', phoneNumberId: 'pnA', token: 't', provider: 'meta', phone: null };
    if (id === 'pnB') return { negocioId: 'negA', phoneNumberId: 'pnB', token: 't', provider: 'meta', phone: null };
    if (id === 'ycloud_59133333333') return { negocioId: 'negY', phoneNumberId: id, provider: 'ycloud', phone: '+59133333333' };
    return null;
  },
  markAsRead: () => { throw new Error('no se debe marcar como leído'); },
  send: async (to, text) => { enviados.push({ to, text }); return {}; },
  sendInteractive: async (to, interactive) => { enviados.push({ to, interactive }); return {}; },
  clearAccountCache: () => {},
};

// Motor simulado: registra cada llamado y cuántos corren a la vez.
let llamados = [];
let enCurso = 0;
let maxEnCurso = 0;
let demoraMotor = 0;
async function runAssistant(args) {
  enCurso += 1;
  maxEnCurso = Math.max(maxEnCurso, enCurso);
  llamados.push(args);
  if (demoraMotor) await new Promise((r) => setTimeout(r, demoraMotor));
  enCurso -= 1;
  return { replyText: `ok ${llamados.length}`, interactive: null, conversation: { currentFlow: 'welcome' } };
}

mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('express', { namedExports: { Router: () => router } });
mock.module('../services/capabilities/capabilityService.js', { namedExports: capabilityMock });
mock.module('../services/providers/whatsappProvider.js', { namedExports: providerMock });
mock.module('../services/assistantEngine/router.js', { namedExports: { runAssistant } });
mock.module('../services/appointments/conversationState.js', { namedExports: { updateConversation: async () => ({}) } });

const Q = await import('../services/whatsapp/inboundQueue.js');
const W = await import('../routes/whatsappWebhook.routes.js');

const rutaMeta = router.routes.find((r) => r.method === 'POST' && r.path === '/whatsapp/webhook');
const rutaYCloud = router.routes.find((r) => r.method === 'POST' && r.path === '/whatsapp/ycloud/webhook');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function correr(ruta, req) {
  const out = { status: null };
  const res = { status(c) { out.status = c; return res; }, json() { return res; }, sendStatus(c) { out.status = c; return res; } };
  for (const h of ruta.handlers) await h(req, res, () => {});
  return out;
}

function webhook(mensajes, phoneNumberId = 'pnA') {
  const body = { entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId, display_phone_number: '591' }, messages: mensajes } }] }] };
  const rawBody = Buffer.from(JSON.stringify(body));
  const firma = `sha256=${crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex')}`;
  return correr(rutaMeta, { body, rawBody, get: (h) => (String(h).toLowerCase() === 'x-hub-signature-256' ? firma : undefined) });
}

function webhookYCloud(m) {
  const body = { type: 'whatsapp.inbound_message.received', whatsappInboundMessage: m };
  const rawBody = Buffer.from(JSON.stringify(body));
  const t = '1700000000';
  const s = crypto.createHmac('sha256', process.env.YCLOUD_WEBHOOK_SECRET).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
  return correr(rutaYCloud, { body, rawBody, get: (h) => (String(h).toLowerCase() === 'ycloud-signature' ? `t=${t},s=${s}` : undefined) });
}

const CLIENTE = '59170000001';
const texto = (id, body = 'hola', from = CLIENTE) => ({ id, from, type: 'text', text: { body } });
const foto = (id, caption = null, from = CLIENTE) => ({ id, from, type: 'image', image: { id: `img-${id}`, link: `https://api.ycloud.com/m/${id}`, mime_type: 'image/jpeg', ...(caption ? { caption } : {}) } });
const mensajesGuardados = () => db._dump().filter(([p]) => p.startsWith('assistantInbox/') && p.includes('/messages/')).map(([, v]) => v);

beforeEach(() => {
  db._clear();
  enviados = [];
  llamados = [];
  enCurso = 0;
  maxEnCurso = 0;
  demoraMotor = 0;
  resolveFalla = false;
  delete process.env.ASSISTANT_INBOX;
});

describe('Deduplicación y orden', () => {
  test('texto: se procesa al instante y no se marca como leído', async () => {
    const r = await webhook([texto('w1')]);
    assert.equal(r.status, 200);
    assert.equal(llamados.length, 1);
    assert.equal(llamados[0].message, 'hola');
    assert.equal(enviados.length, 1);
  });

  test('el mismo mensaje entregado 2 veces en paralelo: un solo procesamiento', async () => {
    await Promise.all([webhook([texto('dup')]), webhook([texto('dup')])]);
    await esperar(20);
    assert.equal(llamados.length, 1);
    assert.equal(mensajesGuardados().length, 1);
  });

  test('el mismo mensaje entregado después (reintento): se descarta', async () => {
    await webhook([texto('w1')]);
    const r = await webhook([texto('w1')]);
    assert.equal(r.status, 200);
    assert.equal(llamados.length, 1);
  });

  test('3 textos en paralelo: nunca dos ejecuciones a la vez, en orden de llegada', async () => {
    demoraMotor = 15;
    await Promise.all([webhook([texto('a', 'uno')]), webhook([texto('b', 'dos')]), webhook([texto('c', 'tres')])]);
    await esperar(100);
    assert.equal(maxEnCurso, 1);
    assert.deepEqual(llamados.map((x) => x.message), ['uno', 'dos', 'tres']);
  });

  test('un mensaje que llega mientras se procesa otro también se responde', async () => {
    demoraMotor = 40;
    const primero = webhook([texto('p1', 'uno')]);
    await esperar(10);
    await webhook([texto('p2', 'dos')]); // el turno lo tiene el primero
    await primero;
    await esperar(80);
    assert.deepEqual(llamados.map((x) => x.message), ['uno', 'dos']);
    assert.equal(maxEnCurso, 1);
  });

  test('clientes distintos no se bloquean entre sí', async () => {
    demoraMotor = 30;
    await Promise.all([webhook([texto('x1', 'a', '59170000001')]), webhook([texto('x2', 'b', '59170000002')])]);
    assert.equal(llamados.length, 2);
    assert.equal(maxEnCurso, 2);
  });
});

describe('Fotos, archivos, reacciones', () => {
  test('3 fotos seguidas: un solo llamado al motor con las 3 y una sola respuesta', async () => {
    await webhook([foto('f1')]);
    await webhook([foto('f2')]);
    await webhook([foto('f3')]);
    assert.equal(llamados.length, 0, 'espera la ventana');
    await esperar(250);
    assert.equal(llamados.length, 1);
    assert.equal(llamados[0].media.length, 3);
    assert.equal(llamados[0].message, '');
    assert.equal(enviados.length, 1);
  });

  test('fotos y luego texto dentro de la ventana: van juntos, sin esperar', async () => {
    await webhook([foto('f1')]);
    await webhook([foto('f2')]);
    await webhook([texto('t1', 'quiero este corte')]);
    assert.equal(llamados.length, 1);
    assert.equal(llamados[0].message, 'quiero este corte');
    assert.equal(llamados[0].media.length, 2);
    await esperar(200);
    assert.equal(llamados.length, 1, 'el timer de la ventana no vuelve a responder');
  });

  test('la descripción de la foto se usa como texto', async () => {
    await webhook([foto('f1', '¿tienen este corte?')]);
    await esperar(200);
    assert.equal(llamados[0].message, '¿tienen este corte?');
  });

  test('álbum con un mensaje de tipo desconocido: cuenta solo las fotos', async () => {
    await webhook([foto('f1')]);
    await webhook([{ id: 'u1', from: CLIENTE, type: 'unsupported', unsupported: {} }]);
    await webhook([foto('f2')]);
    await esperar(250);
    assert.equal(llamados.length, 1);
    assert.equal(llamados[0].media.length, 2);
    assert.equal(llamados[0].unsupportedCount, 0);
  });

  test('reacción y sticker: no llaman al motor ni responden', async () => {
    await webhook([{ id: 'r1', from: CLIENTE, type: 'reaction', reaction: { emoji: '👍', message_id: 'x' } }]);
    await webhook([{ id: 's1', from: CLIENTE, type: 'sticker', sticker: { id: 'st' } }]);
    await esperar(200);
    assert.equal(llamados.length, 0);
    assert.equal(enviados.length, 0);
  });

  test('2 audios seguidos: un solo aviso (un llamado con unsupportedCount 2)', async () => {
    await webhook([{ id: 'a1', from: CLIENTE, type: 'audio', audio: { id: 'x' } }]);
    await webhook([{ id: 'a2', from: CLIENTE, type: 'audio', audio: { id: 'y' } }]);
    await esperar(200);
    assert.equal(llamados.length, 1);
    assert.equal(llamados[0].unsupportedCount, 2);
    assert.equal(llamados[0].media, null);
  });

  test('YCloud: foto con descripción por el webhook de coexistencia', async () => {
    const r = await webhookYCloud({ wamid: 'wamid.Y1/+=', from: '+59170000009', to: '+59133333333', type: 'image', image: { link: 'https://api.ycloud.com/m/1', caption: 'hola' } });
    assert.equal(r.status, 200);
    await esperar(200);
    assert.equal(llamados.length, 1);
    assert.equal(llamados[0].negocioId, 'negY');
    assert.equal(llamados[0].phone, '59170000009');
    assert.equal(llamados[0].message, 'hola');
  });
});

describe('Fallas y recuperación', () => {
  test('si no se puede guardar, responde 500 (el proveedor reintenta) y no procesa', async () => {
    resolveFalla = true;
    const r = await webhook([texto('w1')]);
    assert.equal(r.status, 500);
    assert.equal(llamados.length, 0);
    resolveFalla = false;
    const reintento = await webhook([texto('w1')]);
    assert.equal(reintento.status, 200);
    assert.equal(llamados.length, 1);
  });

  test('pendiente que quedó de un reinicio: lo procesa el barrido', async () => {
    const norm = W.normalizarMensaje(texto('w1', 'sigo aquí'), { metadata: { phone_number_id: 'pnA' } });
    await Q.enqueue({ negocioId: 'negA', phone: CLIENTE, mensaje: norm, now: Date.now() - 60000 });
    assert.equal(llamados.length, 0);
    const n = await Q.sweepOnce();
    assert.equal(n, 1);
    assert.deepEqual(llamados.map((x) => x.message), ['sigo aquí']);
  });

  test('turno vencido de una instancia caída: se recupera', async () => {
    const norm = W.normalizarMensaje(texto('w1', 'hola'), { metadata: { phone_number_id: 'pnA' } });
    await Q.enqueue({ negocioId: 'negA', phone: CLIENTE, mensaje: norm, now: Date.now() - 60000 });
    db._set(`assistantInbox/negA__${CLIENTE}`, { ...db._get(`assistantInbox/negA__${CLIENTE}`), lockOwner: 'otra', lockUntil: Date.now() - 1 });
    await Q.sweepOnce();
    assert.equal(llamados.length, 1);
  });

  test('turno vigente de otra instancia: no se procesa en paralelo', async () => {
    const norm = W.normalizarMensaje(texto('w1', 'hola'), { metadata: { phone_number_id: 'pnA' } });
    await Q.enqueue({ negocioId: 'negA', phone: CLIENTE, mensaje: norm, now: Date.now() - 60000 });
    db._set(`assistantInbox/negA__${CLIENTE}`, { ...db._get(`assistantInbox/negA__${CLIENTE}`), lockOwner: 'otra', lockUntil: Date.now() + 60000 });
    await Q.sweepOnce();
    assert.equal(llamados.length, 0);
  });

  test('tras 2 intentos interrumpidos el mensaje queda como fallido y no se reintenta', async () => {
    const norm = W.normalizarMensaje(texto('w1', 'hola'), { metadata: { phone_number_id: 'pnA' } });
    await Q.enqueue({ negocioId: 'negA', phone: CLIENTE, mensaje: norm, now: Date.now() - 60000 });
    const [[path]] = db._dump().filter(([p]) => p.includes('/messages/'));
    db._set(path, { ...db._get(path), status: 'processing', attempts: 2 });
    await Q.sweepOnce();
    assert.equal(llamados.length, 0);
    assert.equal(db._get(path).status, 'failed');
  });

  test('ASSISTANT_INBOX=off: procesamiento directo como antes', async () => {
    process.env.ASSISTANT_INBOX = 'off';
    await webhook([texto('w1')]);
    assert.equal(llamados.length, 1);
    assert.equal(mensajesGuardados().length, 0);
  });
});

describe('armarLote (función pura)', () => {
  const m = (kind, receivedAt, phoneNumberId = 'pnA') => ({ kind, receivedAt, phoneNumberId });
  test('texto primero: solo, sin esperar', () => {
    const r = Q.armarLote([m('text', 1), m('media', 2)], 3, 100);
    assert.equal(r.tipo, 'lote');
    assert.equal(r.mensajes.length, 1);
  });
  test('fotos dentro de la ventana: esperar lo que falta', () => {
    assert.deepEqual(Q.armarLote([m('media', 1000), m('media', 1050)], 1100, 100), { tipo: 'esperar', ms: 50 });
  });
  test('fotos con la ventana cerrada: un lote', () => {
    assert.equal(Q.armarLote([m('media', 1000), m('media', 1050)], 1200, 100).mensajes.length, 2);
  });
  test('fotos + texto: el texto cierra el lote', () => {
    const r = Q.armarLote([m('media', 1000), m('text', 1010), m('media', 1020)], 1030, 100);
    assert.deepEqual(r.mensajes.map((x) => x.kind), ['media', 'text']);
  });
  test('no mezcla números distintos del negocio', () => {
    const r = Q.armarLote([m('media', 1000), m('media', 1010, 'pnB')], 1020, 100);
    assert.equal(r.mensajes.length, 1);
  });
  test('vacío', () => assert.deepEqual(Q.armarLote([], 0), { tipo: 'vacio' }));
});

describe('normalizarMensaje', () => {
  const v = { metadata: { phone_number_id: 'pnA' } };
  test('tipos', () => {
    assert.equal(W.normalizarMensaje(texto('1'), v).kind, 'text');
    assert.equal(W.normalizarMensaje({ id: '2', from: 'x', type: 'interactive', interactive: { list_reply: { id: 'welcome|1' } } }, v).text, 'welcome|1');
    assert.equal(W.normalizarMensaje({ id: '3', from: 'x', type: 'interactive', interactive: { nfm_reply: {} } }, v).kind, 'ignored');
    assert.equal(W.normalizarMensaje({ id: '3b', from: 'x', type: 'algo_nuevo' }, v).kind, 'ignored');
    assert.equal(W.normalizarMensaje({ id: '3c', from: 'x', type: 'location', location: {} }, v).kind, 'ignored');
    assert.equal(W.normalizarMensaje({ id: '3d', from: 'x', type: 'voice', voice: {} }, v).kind, 'unsupported');
    assert.equal(W.normalizarMensaje({ id: '4', from: 'x', type: 'reaction' }, v).kind, 'ignored');
    assert.equal(W.normalizarMensaje({ id: '5', from: 'x', type: 'sticker' }, v).kind, 'ignored');
    const doc = W.normalizarMensaje({ id: '6', from: 'x', type: 'document', document: { caption: 'mi cv' } }, v);
    assert.deepEqual([doc.kind, doc.text], ['unsupported', 'mi cv']);
    const f = W.normalizarMensaje(foto('7', 'este'), v);
    assert.deepEqual([f.kind, f.text, f.media.link], ['media', 'este', 'https://api.ycloud.com/m/7']);
    assert.equal(W.normalizarMensaje({ id: '8', from: 'x', type: 'button', button: { payload: 'SI' } }, v).text, 'SI');
  });
});
