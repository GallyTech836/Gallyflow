// Pruebas de la capacidad vistaAgenda (mostrar u ocultar la agenda en pantalla).
// Ejecutar (desde la raíz):  npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCapabilities, canUse, LAUNCH_PLAN_PRESETS } from '../src/shared/capabilities/capabilityModel.js';

const planFeatures = (id) => LAUNCH_PLAN_PRESETS.find((p) => p.id === id).features;

describe('vistaAgenda', () => {
  for (const id of ['esencial', 'profesional', 'premium']) {
    test(`${id}: la agenda se muestra`, () => {
      const r = resolveCapabilities({ planFeatures: planFeatures(id) });
      assert.equal(canUse(r, 'vistaAgenda'), true);
      assert.equal(canUse(r, 'agenda'), true);
    });
  }

  test('sin plan: la agenda se muestra', () => {
    const r = resolveCapabilities({ planFeatures: null });
    assert.equal(canUse(r, 'vistaAgenda'), true);
    assert.equal(r.vistaAgenda.source, 'default');
  });

  test('plan guardado antes de existir vistaAgenda: se muestra (default)', () => {
    const r = resolveCapabilities({ planFeatures: { reservaPublica: true } });
    assert.equal(canUse(r, 'vistaAgenda'), true);
  });

  test('nexus-control: la agenda se oculta, pero sigue activa (core)', () => {
    const r = resolveCapabilities({ planFeatures: planFeatures('nexus-control') });
    assert.equal(canUse(r, 'vistaAgenda'), false);
    assert.equal(canUse(r, 'agenda'), true);
  });
});
