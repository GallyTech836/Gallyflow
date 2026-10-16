// Login de profesionales: al entrar, la contraseña antigua en texto plano se
// convierte en hash y se BORRA de usuarios/{uid} (punto 11).
// Ejecutar:  cd backend && npm test

import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';

const db = createFakeDb();
mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('firebase-admin/auth', { namedExports: { getAuth: () => ({}) } });
mock.module('bcryptjs', {
  defaultExport: { hash: async (p) => `h:${p}`, compare: async (p, h) => h === `h:${p}` },
});

const { verifyStaffLogin } = await import('../services/staff/staffCredentials.js');

beforeEach(() => db._clear());

test('primer login con contraseña antigua: crea hash y borra el texto plano', async () => {
  db._set('usuarios/p1', { rol: 'barber', username: 'ana', negocioId: 'negA', password: 'clave1' });
  const r = await verifyStaffLogin('ana', 'clave1');
  assert.equal(r.uid, 'p1');
  assert.equal(r.data.password, undefined);
  assert.equal(db._get('staffCredentials/p1').passwordHash, 'h:clave1');
  assert.equal(db._get('usuarios/p1').password, undefined);
  // Sigue entrando con la misma contraseña (ahora por hash)
  assert.equal((await verifyStaffLogin('ana', 'clave1')).uid, 'p1');
  assert.equal(await verifyStaffLogin('ana', 'otra'), null);
});

test('ya tenía hash y quedaba el texto plano: se borra al entrar', async () => {
  db._set('usuarios/p2', { rol: 'barber', username: 'beto', negocioId: 'negA', password: 'vieja' });
  db._set('staffCredentials/p2', { passwordHash: 'h:nueva' });
  assert.equal(await verifyStaffLogin('beto', 'vieja'), null); // la vieja ya no sirve
  assert.equal((await verifyStaffLogin('beto', 'nueva')).uid, 'p2');
  assert.equal(db._get('usuarios/p2').password, undefined);
});
