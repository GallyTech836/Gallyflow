// Eventos de cuenta de YCloud: registro del payload completo, asociación al
// negocio, marca de desconexión y aviso a soporte. Firestore en memoria.
//
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';
import { createFakeRouter } from './helpers/fakeExpress.js';

process.env.YCLOUD_WEBHOOK_SECRET = 'whsec_prueba';

const db = createFakeDb();
const router = createFakeRouter();

let avisos = [];
mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('express', { namedExports: { Router: () => router } });
mock.module('../services/notificationService.js', {
  namedExports: { sendSupportAlert: async (a) => { avisos.push(a); return { sent: 1 }; } },
});
mock.module('../services/capabilities/capabilityService.js', {
  namedExports: {
    checkCapability: async () => ({ allowed: true }), incrementUsage: async () => {}, incrementRejected: async () => {},
    resolveUsageBranch: async () => ({ id: 'x', name: '' }), checkBranchLimit: async () => ({ allowed: true }),
    incrementBranchUsage: async () => {}, incrementClientUsage: async () => {}, getNegocioAccess: async () => ({}),
    invalidateNegocioAccess: () => {},
  },
});
mock.module('../services/providers/whatsappProvider.js', {
  namedExports: { resolveAccount: async () => null, send: async () => ({}), sendInteractive: async () => ({}), clearAccountCache: () => {} },
});
mock.module('../services/assistantEngine/router.js', { namedExports: { runAssistant: async () => ({}) } });
mock.module('../services/appointments/conversationState.js', { namedExports: { updateConversation: async () => ({}) } });

const E = await import('../services/whatsapp/accountEvents.js');
await import('../routes/whatsappWebhook.routes.js');
const rutaYCloud = router.routes.find((r) => r.method === 'POST' && r.path === '/whatsapp/ycloud/webhook');

function webhook(body) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const t = String(Math.floor(Date.now() / 1000));
  const s = crypto.createHmac('sha256', process.env.YCLOUD_WEBHOOK_SECRET).update(`${t}.${rawBody}`).digest('hex');
  return new Promise((resolve) => {
    const res = { statusCode: 200, sendStatus(c) { this.statusCode = c; resolve(c); return this; }, status(c) { this.statusCode = c; return this; }, json() { resolve(this.statusCode); return this; } };
    const req = { body, rawBody, get: (h) => (String(h).toLowerCase() === 'ycloud-signature' ? `t=${t},s=${s}` : undefined) };
    const handlers = rutaYCloud.handlers;
    handlers[handlers.length - 1](req, res, () => {});
  });
}

const DELETED = {
  id: 'evt_waba_deleted_1',
  type: 'whatsapp.business_account.deleted',
  createTime: '2026-11-12T12:52:00.000Z',
  whatsappBusinessAccount: { id: 'WABA_SUPRA', removedReason: 'ACCOUNT_DISCONNECTED', removedInitiatedBy: 'USER', removedTime: '2026-11-12T12:52:00Z' },
};

beforeEach(() => {
  avisos = [];
  E._resetRevisadas();
  db.collection('whatsappAccounts').doc('ycloud_59167831660').set({
    provider: 'ycloud', negocioId: 'suprahairstudio', phone: '+59167831660', wabaId: 'WABA_SUPRA',
  });
});

describe('clasificación', () => {
  test('desconexión, restricción, calidad e info', () => {
    assert.equal(E.clasificarEvento(DELETED), 'desconectado');
    assert.equal(E.clasificarEvento({ type: 'whatsapp.phone_number.deleted' }), 'desconectado');
    assert.equal(E.clasificarEvento({ type: 'whatsapp.business_account.updated', whatsappBusinessAccount: { updateEvent: 'ACCOUNT_RESTRICTION' } }), 'restriccion');
    assert.equal(E.clasificarEvento({ type: 'whatsapp.business_account.updated', whatsappBusinessAccount: { updateEvent: 'BUSINESS_CAPABILITY_UPDATE' } }), 'info');
    assert.equal(E.clasificarEvento({ type: 'whatsapp.phone_number.quality_updated', whatsappPhoneNumber: { qualityRating: 'RED' } }), 'calidad');
    assert.equal(E.clasificarEvento({ type: 'whatsapp.phone_number.quality_updated', whatsappPhoneNumber: { qualityRating: 'GREEN' } }), 'info');
  });
});

describe('webhook de YCloud', () => {
  test('desconexión: guarda el payload completo, marca la cuenta y avisa una sola vez', async () => {
    assert.equal(await webhook(DELETED), 200);

    const ev = db._get('whatsappEvents/evt_waba_deleted_1');
    assert.equal(ev.type, 'whatsapp.business_account.deleted');
    assert.equal(ev.severidad, 'desconectado');
    assert.deepEqual(ev.negocioIds, ['suprahairstudio']);
    assert.equal(ev.payload.whatsappBusinessAccount.removedReason, 'ACCOUNT_DISCONNECTED');
    assert.match(ev.motivo, /ACCOUNT_DISCONNECTED/);

    const cuenta = db._get('whatsappAccounts/ycloud_59167831660');
    assert.equal(cuenta.status, 'disconnected');
    assert.match(cuenta.statusReason, /USER/);

    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].tipo, 'WHATSAPP_CUENTA_ALERTA');
    assert.equal(avisos[0].data.negocios, 'suprahairstudio');

    // YCloud reintenta el mismo evento: no se duplica ni se vuelve a avisar.
    assert.equal(await webhook(DELETED), 200);
    assert.equal(avisos.length, 1);
  });

  test('número eliminado: se asocia por el teléfono aunque no haya wabaId', async () => {
    await db.collection('whatsappAccounts').doc('ycloud_59167831660').update({ wabaId: null });
    await webhook({ id: 'evt_num_1', type: 'whatsapp.phone_number.deleted', whatsappPhoneNumber: { id: '123', phoneNumber: '+59167831660', wabaId: 'OTRA' } });
    assert.equal(db._get('whatsappAccounts/ycloud_59167831660').status, 'disconnected');
    assert.equal(avisos.length, 1);
  });

  test('evento sin negocio conocido: se guarda y avisa igual', async () => {
    await webhook({ id: 'evt_x', type: 'whatsapp.business_account.deleted', whatsappBusinessAccount: { id: 'DESCONOCIDA' } });
    assert.deepEqual(db._get('whatsappEvents/evt_x').negocioIds, []);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].data.negocios, null);
  });

  test('evento informativo: se guarda sin avisar ni marcar la cuenta', async () => {
    await webhook({ id: 'evt_info', type: 'whatsapp.phone_number.name_updated', whatsappPhoneNumber: { phoneNumber: '+59167831660', decision: 'APPROVED' } });
    assert.ok(db._get('whatsappEvents/evt_info'));
    assert.equal(db._get('whatsappAccounts/ycloud_59167831660').status, undefined);
    assert.equal(avisos.length, 0);
  });

  test('si vuelve a llegar actividad del número, se quita la marca y se guarda el wabaId', async () => {
    await db.collection('whatsappAccounts').doc('ycloud_59167831660').update({ status: 'disconnected', wabaId: null });
    await E.notarActividadCuenta('ycloud_59167831660', { wabaId: 'WABA_NUEVA' });
    const c = db._get('whatsappAccounts/ycloud_59167831660');
    assert.equal(c.status, null);
    assert.equal(c.wabaId, 'WABA_NUEVA');
  });
});
