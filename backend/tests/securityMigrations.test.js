// Pruebas de seguridad (punto 11): PIN de Analítica fuera del documento
// público del negocio y borrado de contraseñas antiguas en texto plano.
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';

const db = createFakeDb();
const hashesCreados = [];
mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('../services/staff/staffCredentials.js', {
  namedExports: {
    setStaffPassword: async (uid, password, source) => {
      hashesCreados.push({ uid, source });
      db._set(`staffCredentials/${uid}`, { passwordHash: `hash(${password.length})`, source });
    },
  },
});

const { getPinHash, setPinHash } = await import('../services/finance/pinStore.js');
const { runLegacyPasswordMigration, maybeRunLegacyPasswordMigration } = await import('../services/staff/legacyPasswordMigration.js');

describe('PIN de Analítica', () => {
  beforeEach(() => db._clear());

  test('el hash viejo se mueve a negocioSecrets y se borra del negocio', async () => {
    db._set('negocios/negA', { adminUid: 'u', financePinHash: 'H1', heroConfig: { businessName: 'A' } });
    assert.equal(await getPinHash('negA'), 'H1');
    assert.equal(db._get('negocioSecrets/negA').financePinHash, 'H1');
    assert.equal(db._get('negocios/negA').financePinHash, undefined);
    assert.equal(db._get('negocios/negA').heroConfig.businessName, 'A');
    assert.equal(await getPinHash('negA'), 'H1'); // segunda vez, desde negocioSecrets
  });

  test('guardar y borrar el PIN nunca toca el documento público', async () => {
    db._set('negocios/negA', { adminUid: 'u' });
    await setPinHash('negA', 'H2');
    assert.equal(db._get('negocioSecrets/negA').financePinHash, 'H2');
    assert.equal(db._get('negocios/negA').financePinHash, undefined);
    await setPinHash('negA', null);
    assert.equal(await getPinHash('negA'), null);
  });

  test('sin PIN -> null', async () => {
    db._set('negocios/negA', { adminUid: 'u' });
    assert.equal(await getPinHash('negA'), null);
  });
});

describe('contraseñas antiguas en texto plano', () => {
  beforeEach(() => {
    db._clear();
    hashesCreados.length = 0;
    db._set('usuarios/p1', { rol: 'barber', username: 'ana', negocioId: 'negA', password: 'vieja1' }); // ya tiene hash
    db._set('staffCredentials/p1', { passwordHash: 'H' });
    db._set('usuarios/p2', { rol: 'barber', username: 'beto', negocioId: 'negA', password: 'vieja2' }); // sin hash
    db._set('usuarios/p3', { rol: 'barber', username: 'caro', negocioId: 'negA' }); // ya limpio
    db._set('usuarios/p4', { rol: 'barber', username: 'dani', negocioId: 'negA', password: '' }); // vacía
  });

  test('simulación: no cambia nada', async () => {
    const r = await runLegacyPasswordMigration({ apply: false });
    assert.deepEqual(r, { revisados: 3, soloBorrar: 1, hashYBorrar: 1, vacias: 1, errores: 0, aplicado: false });
    assert.equal(db._get('usuarios/p1').password, 'vieja1');
    assert.equal(hashesCreados.length, 0);
  });

  test('aplicar: crea el hash que falta y borra todo el texto plano', async () => {
    const r = await runLegacyPasswordMigration({ apply: true });
    assert.equal(r.errores, 0);
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      assert.equal(db._get(`usuarios/${id}`).password, undefined, id);
      assert.equal(db._get(`usuarios/${id}`).username !== undefined, true);
    }
    assert.deepEqual(hashesCreados, [{ uid: 'p2', source: 'legacy-migration' }]);
    assert.equal(db._get('staffCredentials/p1').passwordHash, 'H'); // el hash existente no se toca
  });

  test('solo corre con la variable de entorno', async () => {
    assert.equal(await maybeRunLegacyPasswordMigration({}), null);
    assert.equal(await maybeRunLegacyPasswordMigration({ MIGRATE_LEGACY_PASSWORDS: 'si' }), null);
    const r = await maybeRunLegacyPasswordMigration({ MIGRATE_LEGACY_PASSWORDS: 'dry' });
    assert.equal(r.aplicado, false);
    assert.equal(db._get('usuarios/p2').password, 'vieja2');
  });
});
