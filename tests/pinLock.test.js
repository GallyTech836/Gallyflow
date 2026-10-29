// Bloqueo con PIN por módulo. Funciones puras.
// Ejecutar (desde la raíz):  npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LOCKABLE_MODULES, getLockedModules, isModuleLocked } from '../src/shared/pinLock/pinLockModel.js';

describe('getLockedModules', () => {
  test('negocio sin nada: ninguno', () => {
    assert.deepEqual(getLockedModules({}), []);
  });

  test('negocio viejo con analyticsPinEnabled: solo Analítica', () => {
    assert.deepEqual(getLockedModules({ analyticsPinEnabled: true }), ['reports']);
  });

  test('lista nueva: ignora módulos desconocidos y la Agenda', () => {
    assert.deepEqual(getLockedModules({ pinLockedModules: ['barbers', 'agenda', 'xx', 'services'] }), ['barbers', 'services']);
  });

  test('analyticsPinEnabled siempre suma Analítica', () => {
    assert.deepEqual(getLockedModules({ pinLockedModules: ['barbers'], analyticsPinEnabled: true }), ['barbers', 'reports']);
  });

  test('la Agenda no se puede bloquear', () => {
    assert.equal(LOCKABLE_MODULES.includes('agenda'), false);
  });
});

describe('isModuleLocked', () => {
  test('pide PIN solo en módulos bloqueados', () => {
    assert.equal(isModuleLocked(['barbers'], 'barbers', false), true);
    assert.equal(isModuleLocked(['barbers'], 'services', false), false);
  });

  test('un desbloqueo abre todos los módulos', () => {
    assert.equal(isModuleLocked(['barbers', 'reports'], 'barbers', true), false);
    assert.equal(isModuleLocked(['barbers', 'reports'], 'reports', true), false);
  });
});
