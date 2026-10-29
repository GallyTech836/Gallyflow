// Bloqueo con PIN por módulo (lo que guarda Super Admin).
// Ejecutar (desde backend/):  npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LOCKABLE_MODULES, buildLockPatch, getLockedModules } from '../services/finance/pinLockModules.js';
import { LOCKABLE_MODULES as FRONT } from '../../src/shared/pinLock/pinLockModel.js';

describe('buildLockPatch', () => {
  test('lista completa: guarda la lista y sincroniza analyticsPinEnabled', () => {
    assert.deepEqual(buildLockPatch({}, { lockedModules: ['barbers', 'reports'] }),
      { pinLockedModules: ['barbers', 'reports'], analyticsPinEnabled: true });
    assert.deepEqual(buildLockPatch({ analyticsPinEnabled: true }, { lockedModules: ['services'] }),
      { pinLockedModules: ['services'], analyticsPinEnabled: false });
  });

  test('lista vacía: desbloquea todo', () => {
    assert.deepEqual(buildLockPatch({ pinLockedModules: ['barbers'] }, { lockedModules: [] }),
      { pinLockedModules: [], analyticsPinEnabled: false });
  });

  test('descarta módulos desconocidos y la Agenda', () => {
    assert.deepEqual(buildLockPatch({}, { lockedModules: ['agenda', 'nada', 'clients', 'clients'] }).pinLockedModules, ['clients']);
  });

  test('interruptor viejo (enabled) solo toca Analítica', () => {
    assert.deepEqual(buildLockPatch({ pinLockedModules: ['barbers'] }, { enabled: true }),
      { pinLockedModules: ['barbers', 'reports'], analyticsPinEnabled: true });
    assert.deepEqual(buildLockPatch({ pinLockedModules: ['barbers', 'reports'], analyticsPinEnabled: true }, { enabled: false }),
      { pinLockedModules: ['barbers'], analyticsPinEnabled: false });
  });

  test('sin cambios: null', () => {
    assert.equal(buildLockPatch({}, {}), null);
  });

  test('negocio viejo con analyticsPinEnabled cuenta como Analítica bloqueada', () => {
    assert.deepEqual(getLockedModules({ analyticsPinEnabled: true }), ['reports']);
  });

  test('la lista del backend y la del frontend son iguales', () => {
    assert.deepEqual(LOCKABLE_MODULES, FRONT);
  });
});
