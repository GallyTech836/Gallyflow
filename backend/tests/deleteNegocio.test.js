// Pruebas de «Eliminar negocio» desde Super Admin: ahora o programado a N días.
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';
import { createFakeRouter, runRoute } from './helpers/fakeExpress.js';

const db = createFakeDb();
// Como Firestore real: borra el documento y todo lo que cuelga de él.
db.recursiveDelete = async (ref) => {
  for (const [path] of db._dump()) {
    if (path === ref.path || path.startsWith(`${ref.path}/`)) await db.doc(path).delete();
  }
};
const router = createFakeRouter();
const pasa = (req, res, next) => next();

const authUsers = new Map();
const fakeAuth = {
  deleteUser: async (uid) => { if (!authUsers.has(uid)) { const e = new Error('no'); e.code = 'auth/user-not-found'; throw e; } authUsers.delete(uid); },
  getUserByEmail: async (email) => ({ uid: [...authUsers].find(([, e]) => e === email)?.[0] }),
  createUser: async () => ({ uid: 'n' }),
  updateUser: async () => {},
};

mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('firebase-admin/auth', { namedExports: { getAuth: () => fakeAuth } });
mock.module('express', { namedExports: { Router: () => router } });
mock.module('../middlewares/auth.middleware.js', { namedExports: { identifyRequester: pasa } });
mock.module('../middlewares/session.middleware.js', { namedExports: { requireSession: pasa } });

await import('../routes/superadmin.routes.js');
const { runDueDeletions, deletionDate } = await import('../services/negocios/deleteNegocio.js');

const ahora = () => Math.floor(Date.now() / 1000);
const SUPER = { verified: true, email: 'torricogali@gmail.com', authTime: ahora() };
const llamar = (method, path, body = {}, actor = SUPER) => runRoute(router, method, path, { body, actor });

function seed() {
  db._clear();
  authUsers.clear();
  authUsers.set('uidAdmin', 'dueno@pinos.com');
  authUsers.set('uidOtro', 'otro@x.com');
  db._set('negocios/pinos', { slug: 'pinos', adminUid: 'uidAdmin', email: 'dueno@pinos.com', status: 'trial' });
  db._set('negocios/pinos/servicios/s1', { name: 'Corte' });
  db._set('negocios/pinos/profesionales/p1', { name: 'Ana' });
  db._set('negocios/pinos/citas/c1', { clientName: 'X' });
  db._set('negocios/pinos/clientes/k1', { name: 'X' });
  db._set('negocios/pinos/uso/2026-11', { n: 1 });
  db._set('usuarios/p1', { username: 'ana', rol: 'barber', negocioId: 'pinos' });
  db._set('usuarios/p9', { username: 'suelto', rol: 'barber', negocioId: 'pinos' });
  db._set('staffCredentials/p1', { passwordHash: 'h' });
  db._set('authSessions/a1', { uid: 'uidAdmin', negocioId: null, status: 'active' });
  db._set('authSessions/a2', { uid: 'p1', negocioId: 'pinos', status: 'active' });
  db._set('whatsappAccounts/w1', { negocioId: 'pinos' });
  db._set('negocioSecrets/pinos', { pinHash: 'x' });
  db._set('assistantInbox/pinos__591', { negocioId: 'pinos' });
  db._set('assistantInbox/pinos__591/messages/m1', { negocioId: 'pinos' });
  db._set('solicitudesRegistro/r1', { status: 'creada', negocioId: 'pinos' });
  // Otro negocio: no se toca nada.
  db._set('negocios/otro', { adminUid: 'uidOtro', email: 'otro@x.com', status: 'active' });
  db._set('negocios/otro/servicios/s1', { name: 'Corte' });
  db._set('usuarios/q1', { username: 'q', rol: 'barber', negocioId: 'otro' });
  db._set('authSessions/b1', { uid: 'uidOtro', negocioId: null });
  db._set('whatsappAccounts/w2', { negocioId: 'otro' });
}

function quedaAlgoDePinos() {
  return db._dump().filter(([path, data]) => path.includes('pinos') || data?.negocioId === 'pinos' || data?.uid === 'uidAdmin');
}

function otroIntacto() {
  assert.ok(db._get('negocios/otro'));
  assert.ok(db._get('negocios/otro/servicios/s1'));
  assert.ok(db._get('usuarios/q1'));
  assert.ok(db._get('authSessions/b1'));
  assert.ok(db._get('whatsappAccounts/w2'));
  assert.ok(authUsers.has('uidOtro'));
}

beforeEach(seed);

describe('eliminar ahora', () => {
  test('borra todo lo del negocio y nada de otros', async () => {
    const r = await llamar('POST', '/negocios/pinos/eliminar', { days: 0, confirm: 'pinos' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.deleted, true);
    assert.equal(r.body.summary.cuentaAdmin, true);
    assert.deepEqual(quedaAlgoDePinos().filter(([p]) => !p.startsWith('solicitudesRegistro/')), []);
    assert.equal(authUsers.has('uidAdmin'), false);
    const sol = db._get('solicitudesRegistro/r1');
    assert.equal(sol.negocioId, null);
    assert.equal(sol.status, 'descartada');
    otroIntacto();
  });

  test('exige escribir el ID exacto', async () => {
    const r = await llamar('POST', '/negocios/pinos/eliminar', { days: 0, confirm: 'Pinos ' });
    assert.equal(r.status, 400);
    assert.ok(db._get('negocios/pinos'));
  });

  test('exige haber ingresado la contraseña hace poco', async () => {
    const viejo = { ...SUPER, authTime: ahora() - 60 * 60 };
    let r = await llamar('POST', '/negocios/pinos/eliminar', { days: 0, confirm: 'pinos' }, viejo);
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'REAUTH_REQUIRED');
    r = await llamar('POST', '/negocios/pinos/eliminar', { days: 0, confirm: 'pinos' }, { ...SUPER, authTime: null });
    assert.equal(r.status, 401);
    assert.ok(db._get('negocios/pinos'));
  });

  test('solo el Super Admin', async () => {
    const r = await llamar('POST', '/negocios/pinos/eliminar', { days: 0, confirm: 'pinos' }, { verified: true, email: 'x@x.com', authTime: ahora() });
    assert.equal(r.status, 403);
  });

  test('negocio inexistente: 404', async () => {
    const r = await llamar('POST', '/negocios/nada/eliminar', { days: 0, confirm: 'nada' });
    assert.equal(r.status, 404);
  });
});

describe('eliminar en N días', () => {
  test('suspende ya, programa la fecha y se puede cancelar', async () => {
    let r = await llamar('POST', '/negocios/pinos/eliminar', { days: 3, confirm: 'pinos' });
    assert.equal(r.status, 200);
    assert.equal(r.body.deleted, false);
    const neg = db._get('negocios/pinos');
    assert.equal(neg.status, 'suspended');
    assert.equal(neg.deletion.prevStatus, 'trial');
    assert.equal(neg.deletion.days, 3);
    const diff = Date.parse(neg.deletion.scheduledFor) - Date.now();
    assert.ok(diff > 2.9 * 864e5 && diff <= 3 * 864e5);
    assert.ok(db._get('negocios/pinos/citas/c1'), 'todavía no borra nada');

    // Reprogramar no pierde el estado original.
    await llamar('POST', '/negocios/pinos/eliminar', { days: 7, confirm: 'pinos' });
    assert.equal(db._get('negocios/pinos').deletion.prevStatus, 'trial');

    r = await llamar('DELETE', '/negocios/pinos/eliminar');
    assert.equal(r.status, 200);
    assert.equal(db._get('negocios/pinos').status, 'trial');
    assert.equal(db._get('negocios/pinos').deletion, null);

    r = await llamar('DELETE', '/negocios/pinos/eliminar');
    assert.equal(r.status, 409);
  });

  test('días fuera de rango', async () => {
    for (const days of [-1, 91, 2.5, 'x']) {
      const r = await llamar('POST', '/negocios/pinos/eliminar', { days, confirm: 'pinos' });
      assert.equal(r.status, 400, `days=${days}`);
    }
  });

  test('el barrido borra solo los vencidos', async () => {
    await llamar('POST', '/negocios/pinos/eliminar', { days: 3, confirm: 'pinos' });
    db._set('negocios/otro', { ...db._get('negocios/otro'), deletion: { scheduledFor: deletionDate(5) } });

    assert.deepEqual(await runDueDeletions(new Date(Date.now() + 2 * 864e5)), []);
    assert.ok(db._get('negocios/pinos'));

    assert.deepEqual(await runDueDeletions(new Date(Date.now() + 3 * 864e5 + 1000)), ['pinos']);
    assert.equal(db._get('negocios/pinos'), undefined);
    assert.equal(db._get('negocios/pinos/citas/c1'), undefined);
    assert.ok(db._get('negocios/otro'), 'el de 5 días sigue');
  });
});
