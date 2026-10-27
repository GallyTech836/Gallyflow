// Regresión del modelo de capacidades al agregar `registroServicios` y el
// plan Nexus Control: los planes actuales (Esencial, Profesional, Premium,
// sin plan, planes viejos sin vertical) deben resolver EXACTAMENTE igual que
// antes en todas las capacidades que ya existían.
//
// `fixtures/capabilityModel.before.js` es una copia congelada del modelo tal
// como estaba en main antes de este cambio. No editarla.
//
// Ejecutar:  cd backend && npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as before from './fixtures/capabilityModel.before.js';
import * as now from '../services/capabilities/capabilityModel.js';
import { BUSINESS_PROFILES } from '../services/businessProfiles/businessProfileModel.js';

const OLD_KEYS = before.CAPABILITIES.map((c) => c.key);
const OLD_PRESETS = Object.fromEntries(before.LAUNCH_PLAN_PRESETS.map((p) => [p.id, p]));
const NEW_PRESETS = Object.fromEntries(now.LAUNCH_PLAN_PRESETS.map((p) => [p.id, p]));
const EXISTING_PLANS = ['esencial', 'profesional', 'premium'];
// Capacidades agregadas después del modelo congelado.
const NEW_KEYS = ['registroServicios', 'vistaAgenda'];

// Plan guardado como lo guarda Super Admin HOY (con el modelo anterior):
// no tiene la clave registroServicios.
const storedFeatures = (id) => before.buildPlanFeatures(OLD_PRESETS[id].features, { vertical: OLD_PRESETS[id].vertical });

/** Compara las capacidades viejas entre el modelo anterior y el nuevo. */
function assertSameResolution(args, label) {
  const a = before.resolveCapabilities(args);
  const b = now.resolveCapabilities(args);
  for (const key of OLD_KEYS) assert.deepEqual(b[key], a[key], `${label} -> ${key}`);
  assert.equal(b.registroServicios.enabled, false, `${label} -> registroServicios debe quedar apagada`);
  assert.deepEqual(
    now.sellableCapabilities(b).map((c) => c.key),
    before.sellableCapabilities(a).map((c) => c.key),
    `${label} -> lo que se promociona como incluido`,
  );
}

// Generador determinista (mismos casos en cada corrida).
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const VALUES = [true, false, { enabled: true }, { enabled: false }, { limit: 3 }, { enabled: true, limit: null }, { enabled: false, limit: 7 }, null];
function randomMap(rand, keys, density = 0.5) {
  const out = {};
  for (const k of keys) if (rand() < density) out[k] = VALUES[Math.floor(rand() * VALUES.length)];
  return out;
}
const LEGACY_KEYS = ['staff', 'automatizaciones'];

const PROFILES = Object.entries(BUSINESS_PROFILES).map(([type, p]) => ({
  type, profileDefaults: p.capabilityDefaults || null, relevantModules: p.modules || null,
}));

describe('registroServicios: los planes actuales resuelven igual que antes', () => {
  test('la capacidad nueva existe con la definición acordada', () => {
    const cap = now.getCapability('registroServicios');
    assert.equal(cap.kind, 'toggle');
    assert.equal(cap.default, false);
    assert.equal(cap.module, 'agenda');
    assert.equal(cap.status, 'implemented');
    assert.deepEqual(cap.enforcedIn, ['ui', 'backend']);
    assert.equal(cap.core, undefined);
    assert.equal(cap.requires, undefined);
    assert.equal(before.getCapability('registroServicios'), null);
  });

  test('el catálogo anterior no cambió: mismas capacidades, en el mismo orden, con la misma definición', () => {
    const nuevas = now.CAPABILITIES.filter((c) => !NEW_KEYS.includes(c.key));
    assert.deepEqual(nuevas, before.CAPABILITIES);
    assert.deepEqual(now.CAPABILITY_MODULES, before.CAPABILITY_MODULES);
    assert.deepEqual(now.ADDONS, before.ADDONS);
  });

  test('los presets de Esencial, Profesional y Premium no cambiaron', () => {
    for (const id of EXISTING_PLANS) assert.deepEqual(NEW_PRESETS[id], OLD_PRESETS[id], id);
  });

  test('planes ya guardados (sin la clave nueva) y negocios sin plan', () => {
    for (const id of EXISTING_PLANS) {
      assertSameResolution({ planFeatures: storedFeatures(id) }, `guardado ${id}`);
      const r = now.resolveCapabilities({ planFeatures: storedFeatures(id) });
      assert.equal(r.registroServicios.source, 'default');
    }
    assertSameResolution({}, 'sin plan');
    assertSameResolution({ planFeatures: null }, 'plan borrado');
  });

  test('mismos planes, re-guardados con el modelo nuevo', () => {
    for (const id of EXISTING_PLANS) {
      const p = NEW_PRESETS[id];
      const nuevo = now.buildPlanFeatures(p.features, { vertical: p.vertical });
      // Lo único nuevo al guardar: registroServicios apagada y vistaAgenda activa.
      assert.deepEqual(nuevo, { ...storedFeatures(id), registroServicios: false, vistaAgenda: true }, id);
      assertSameResolution({ planFeatures: nuevo }, `re-guardado ${id}`);
    }
  });

  test('con complementos, excepciones y cada tipo de negocio', () => {
    const extras = [
      {},
      { addons: { asistenteWhatsapp: true } },
      { addons: { profesionalesExtra: 3 } },
      { overrides: { comisiones: true, fichaCliente: false } },
      { overrides: { reservaPublica: false } },
      { overrides: { profesionales: { limit: 8 } } },
    ];
    for (const id of EXISTING_PLANS) {
      for (const extra of extras) {
        for (const prof of PROFILES) {
          assertSameResolution(
            { planFeatures: storedFeatures(id), profileDefaults: prof.profileDefaults, relevantModules: prof.relevantModules, ...extra },
            `${id} + ${prof.type} + ${JSON.stringify(extra)}`,
          );
        }
      }
    }
  });

  test('1000 combinaciones al azar de plan, excepciones y complementos (planes viejos sin vertical incluidos)', () => {
    const rand = rng(20261027);
    for (let i = 0; i < 1000; i++) {
      const planFeatures = rand() < 0.1 ? null : randomMap(rand, [...OLD_KEYS, ...LEGACY_KEYS]);
      const overrides = rand() < 0.5 ? null : randomMap(rand, OLD_KEYS, 0.2);
      const addons = rand() < 0.7 ? null : { asistenteWhatsapp: rand() < 0.5, profesionalesExtra: Math.floor(rand() * 4) };
      const prof = PROFILES[Math.floor(rand() * PROFILES.length)];
      assertSameResolution(
        { planFeatures, overrides, addons, profileDefaults: prof.profileDefaults, relevantModules: prof.relevantModules },
        `caso ${i}`,
      );
      // Guardar un plan viejo (sin vertical) da lo mismo + las claves nuevas con su default.
      if (planFeatures) {
        const nuevas = { registroServicios: false, vistaAgenda: true };
        assert.deepEqual(now.buildPlanFeatures(planFeatures), { ...before.buildPlanFeatures(planFeatures), ...nuevas }, `buildPlanFeatures caso ${i}`);
        assert.deepEqual(now.buildPlanFeatures(planFeatures, { vertical: 'citas' }), { ...before.buildPlanFeatures(planFeatures, { vertical: 'citas' }), ...nuevas });
      }
      if (overrides) assert.deepEqual(now.cleanOverrides(overrides), before.cleanOverrides(overrides));
    }
  });

  test('solo se enciende si el plan o una excepción la activan', () => {
    const base = storedFeatures('profesional');
    assert.equal(now.resolveCapabilities({ planFeatures: { ...base, registroServicios: true } }).registroServicios.enabled, true);
    assert.equal(now.resolveCapabilities({ planFeatures: base, overrides: { registroServicios: true } }).registroServicios.enabled, true);
    // El tipo de negocio puede restringirla (nunca habilitarla).
    assert.equal(now.resolveCapabilities({ planFeatures: { ...base, registroServicios: true }, relevantModules: ['services'] }).registroServicios.enabled, false);
    assert.equal(now.resolveCapabilities({ planFeatures: base, profileDefaults: { registroServicios: { enabled: true } } }).registroServicios.enabled, false);
  });
});

describe('plan Nexus Control', () => {
  const p = NEW_PRESETS['nexus-control'];
  const r = now.resolveCapabilities({ planFeatures: now.buildPlanFeatures(p.features, { vertical: p.vertical }) });

  test('es un preset nuevo (no reemplaza a ninguno) y se siembra inactivo', () => {
    assert.ok(!OLD_PRESETS['nexus-control']);
    assert.equal(p.active, false);
    assert.equal(p.vertical, 'citas');
    assert.ok(EXISTING_PLANS.every((id) => NEW_PRESETS[id].order < p.order));
  });

  test('funciones incluidas y apagadas', () => {
    for (const k of ['registroServicios', 'comisiones', 'analiticas', 'agenda', 'servicios', 'clientes', 'appProfesionales', 'dashboard']) {
      assert.equal(r[k].enabled, true, k);
    }
    for (const k of ['reservaPublica', 'linkPersonalProfesional', 'fichaCliente', 'historialCliente', 'preferenciasCliente', 'camposPersonalizados', 'asistenteWhatsapp', 'inventario']) {
      assert.equal(r[k].enabled, false, k);
    }
    assert.equal(now.getLimit(r, 'profesionales'), 5);
    assert.equal(now.getLimit(r, 'sucursales'), 1);
  });

  test('el asistente de WhatsApp no se ofrece como complemento (sin agenda); profesional extra sí', () => {
    assert.equal(now.getAddonOffer(p, 'asistenteWhatsapp').available, false);
    assert.equal(now.getAddonOffer(p, 'profesionalExtra').available, true);
  });

  test('si igual se activa el complemento a mano, el modelo lo respeta (como antes)', () => {
    const con = now.resolveCapabilities({ planFeatures: now.buildPlanFeatures(p.features, { vertical: p.vertical }), addons: { asistenteWhatsapp: true } });
    assert.equal(con.asistenteWhatsapp.enabled, true);
    assert.equal(con.asistenteWhatsapp.source, 'addon');
  });
});

describe('vistaAgenda: ajuste de pantalla, no se vende', () => {
  test('nunca se promociona como incluida, en ningún plan', () => {
    assert.equal(now.getCapability('vistaAgenda').screenSetting, true);
    for (const p of now.LAUNCH_PLAN_PRESETS) {
      const r = now.resolveCapabilities({ planFeatures: now.buildPlanFeatures(p.features, { vertical: p.vertical }) });
      assert.ok(!now.sellableCapabilities(r).some((c) => c.key === 'vistaAgenda'), p.id);
    }
  });

  test('Esencial, Profesional y Premium promocionan exactamente lo mismo que antes de vistaAgenda', () => {
    for (const id of EXISTING_PLANS) {
      const a = before.resolveCapabilities({ planFeatures: storedFeatures(id) });
      const p = NEW_PRESETS[id];
      const b = now.resolveCapabilities({ planFeatures: now.buildPlanFeatures(p.features, { vertical: p.vertical }) });
      assert.deepEqual(now.sellableCapabilities(b).map((c) => c.key), before.sellableCapabilities(a).map((c) => c.key), id);
    }
  });
});
