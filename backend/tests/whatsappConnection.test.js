// Pruebas del panel "Número de WhatsApp" (punto 9): conectar, cambiar
// sucursal, quitar, aislamiento entre negocios y aviso de 14 días.
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';
import { createFakeRouter, runRoute } from './helpers/fakeExpress.js';

const db = createFakeDb();
const router = createFakeRouter();
const pasa = (req, res, next) => next();

mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('express', { namedExports: { Router: () => router } });
mock.module('../middlewares/auth.middleware.js', { namedExports: { identifyRequester: pasa } });
mock.module('../middlewares/session.middleware.js', { namedExports: { requireSession: pasa } });
mock.module('../middlewares/rateLimit.middleware.js', { namedExports: { staffAdminRateLimit: pasa } });

// YCloud de mentira: números habilitados en "tu" cuenta.
let enYCloud = [];
let ycloudFalla = false;
process.env.YCLOUD_API_KEY = 'test-key';
globalThis.fetch = async (url, opts) => {
  assert.equal(opts.headers['X-API-Key'], 'test-key');
  if (ycloudFalla) return { ok: false, status: 500, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ items: enYCloud }) };
};

await import('../routes/whatsappConnection.routes.js');
const { estadoCoexistencia, normalizarNumero, vistaPublica, buscarEnYCloud } = await import('../services/whatsapp/connectionModel.js');

const ADMIN_A = { verified: true, rol: 'admin', uid: 'uidA' };
const ADMIN_B = { verified: true, rol: 'admin', uid: 'uidB' };
const llamar = (method, path, actor, body) => runRoute(router, method, path, { actor, body });

function seed() {
  db._clear();
  db._set('negocios/negA', { adminUid: 'uidA' });
  db._set('negocios/negB', { adminUid: 'uidB' });
  db._set('negocios/negA/sucursales/s1', { name: 'Centro' });
  db._set('negocios/negA/sucursales/s2', { name: 'Norte' });
  enYCloud = [{ phoneNumber: '+59171234567', wabaId: 'W1', verifiedName: 'Barbería A' }];
  ycloudFalla = false;
}

describe('modelo', () => {
  test('normaliza números bolivianos y con código', () => {
    assert.equal(normalizarNumero('71234567'), '59171234567');
    assert.equal(normalizarNumero('+591 712-34567'), '59171234567');
    assert.equal(normalizarNumero('0059171234567'), '59171234567');
    assert.equal(normalizarNumero('123'), null);
    assert.equal(normalizarNumero(''), null);
  });

  test('aviso de 14 días', () => {
    const dia = 24 * 60 * 60 * 1000;
    const ahora = Date.parse('2030-01-20T12:00:00Z');
    const hace = (d) => new Date(ahora - d * dia).toISOString();
    assert.equal(estadoCoexistencia(hace(3), ahora).estado, 'ok');
    assert.deepEqual(estadoCoexistencia(hace(11), ahora), { estado: 'aviso', dias: 11, quedan: 3 });
    assert.equal(estadoCoexistencia(hace(14), ahora).estado, 'vencido');
    assert.equal(estadoCoexistencia(null, ahora).estado, 'sin_datos');
  });

  test('la vista del admin nunca incluye tokens ni secretos', () => {
    const v = vistaPublica('123', { negocioId: 'negA', token: 'SECRETO', appSecret: 'X', provider: 'meta' });
    assert.ok(!JSON.stringify(v).includes('SECRETO'));
    assert.equal(v.removable, false);
  });

  test('busca en YCloud con camelCase o snake_case', () => {
    assert.ok(buscarEnYCloud([{ phone_number: '+59171234567', waba_id: 'W' }], '59171234567'));
    assert.equal(buscarEnYCloud([{ phoneNumber: '+59170000000' }], '59171234567'), null);
  });
});

describe('rutas', () => {
  beforeEach(seed);

  test('conectar: guarda el número en ESTE negocio con su sucursal', async () => {
    const r = await llamar('POST', '/whatsapp/connections', ADMIN_A, { phone: '71234567', branch: 'Norte', negocioId: 'negB' });
    assert.equal(r.status, 201);
    const doc = db._get('whatsappAccounts/ycloud_59171234567');
    assert.equal(doc.negocioId, 'negA'); // nunca el negocioId del body
    assert.equal(doc.provider, 'ycloud');
    assert.equal(doc.phone, '+59171234567');
    assert.equal(doc.branch, 'Norte');
    assert.equal(doc.wabaId, 'W1');
    assert.equal(r.body.numbers.length, 1);
    assert.equal(r.body.numbers[0].phone, '+591 71234567');
  });

  test('no se puede conectar un número que no está habilitado en YCloud', async () => {
    const r = await llamar('POST', '/whatsapp/connections', ADMIN_A, { phone: '+591 70000000' });
    assert.equal(r.status, 404);
    assert.equal(r.body.code, 'NOT_IN_YCLOUD');
    assert.equal(db._get('whatsappAccounts/ycloud_59170000000'), undefined);
  });

  test('no se puede quitar ni tomar el número de otro negocio', async () => {
    await llamar('POST', '/whatsapp/connections', ADMIN_A, { phone: '71234567' });
    const robar = await llamar('POST', '/whatsapp/connections', ADMIN_B, { phone: '71234567' });
    assert.equal(robar.status, 409);
    assert.equal(db._get('whatsappAccounts/ycloud_59171234567').negocioId, 'negA');
    const quitar = await llamar('DELETE', '/whatsapp/connections/ycloud_59171234567', ADMIN_B);
    assert.equal(quitar.status, 404);
    assert.ok(db._get('whatsappAccounts/ycloud_59171234567'));
    const lista = await llamar('GET', '/whatsapp/connections', ADMIN_B);
    assert.equal(lista.body.numbers.length, 0);
  });

  test('sucursal inexistente se rechaza; cambiar y quitar funcionan', async () => {
    const mala = await llamar('POST', '/whatsapp/connections', ADMIN_A, { phone: '71234567', branch: 'Sur' });
    assert.equal(mala.status, 400);
    await llamar('POST', '/whatsapp/connections', ADMIN_A, { phone: '71234567', branch: 'Centro' });
    const cambio = await llamar('POST', '/whatsapp/connections/ycloud_59171234567/branch', ADMIN_A, { branch: '' });
    assert.equal(cambio.status, 200);
    assert.equal(db._get('whatsappAccounts/ycloud_59171234567').branch, null);
    const quitar = await llamar('DELETE', '/whatsapp/connections/ycloud_59171234567', ADMIN_A);
    assert.equal(quitar.status, 200);
    assert.equal(db._get('whatsappAccounts/ycloud_59171234567'), undefined);
  });

  test('números de Meta: se muestran pero no se quitan desde el panel', async () => {
    db._set('whatsappAccounts/1351541598045861', { negocioId: 'negA', token: 'SECRETO' });
    const lista = await llamar('GET', '/whatsapp/connections', ADMIN_A);
    assert.equal(lista.body.numbers.length, 1);
    assert.ok(!JSON.stringify(lista.body).includes('SECRETO'));
    const quitar = await llamar('DELETE', '/whatsapp/connections/1351541598045861', ADMIN_A);
    assert.equal(quitar.status, 403);
  });

  test('si YCloud no responde, no se guarda nada', async () => {
    ycloudFalla = true;
    const r = await llamar('POST', '/whatsapp/connections', ADMIN_A, { phone: '71234567' });
    assert.equal(r.status, 502);
    assert.equal(db._get('whatsappAccounts/ycloud_59171234567'), undefined);
  });

  test('un profesional o alguien sin sesión no entra', async () => {
    const barber = await llamar('GET', '/whatsapp/connections', { verified: true, rol: 'barber', uid: 'x' });
    assert.equal(barber.status, 401);
    const nadie = await llamar('GET', '/whatsapp/connections', { verified: false });
    assert.equal(nadie.status, 401);
  });
});
