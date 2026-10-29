// Regresión del modelo de capacidades al agregar `registroServicios` y el
// plan Nexus Control: los planes actuales (Esencial, Profesional, Premium,
// sin plan, planes viejos sin vertical) deben resolver EXACTAMENTE igual que
// antes en todas las capacidades que ya existían.
//
// `fixtures/capabilityModel.before.js` es una copia congelada del modelo tal
// como estaba en main antes de este cambio. No editarla.
//
// Cambios intencionales posteriores al modelo congelado (se excluyen de la
// comparación y se prueban aparte):
//   - El Asistente de WhatsApp lo puede incluir el plan (buildPlanFeatures ya
//     no lo fuerza a false en planes con vertical).
//   - Si el plan ya incluye el asistente, el complemento antiguo no cambia nada.
//   - ADDONS = profesionalExtra + sucursalExtra; el asistente pasó a LEGACY_ADDONS.
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
const NEW_KEYS = ['registroServicios', 'vistaAgenda', 'promociones'];
// Promociones (nueva, activa por defecto en todos los planes) se promociona
// como incluida: se quita al comparar lo que se vendía antes.
const sinPromociones = (keys) => keys.filter((k) => k !== 'promociones');

// Plan guardado como lo guarda Super Admin HOY (con el modelo anterior):
// no tiene la clave registroServicios.
const storedFeatures = (id) => before.buildPlanFeatures(OLD_PRESETS[id].features, { vertical: OLD_PRESETS[id].vertical });

// ¿El plan (sin complementos) ya incluye el asistente?
const planIncludesWa = (planFeatures) => now.resolveCapabilities({ planFeatures }).asistenteWhatsapp.plan?.enabled === true;

/** Compara las capacidades viejas entre el modelo anterior y el nuevo. */
function assertSameResolution(args, label) {
  // Si el plan ya incluye el asistente, el complemento antiguo no cambia nada:
  // se espera lo mismo que el modelo anterior resolvía sin el complemento.
  const expectedArgs = args.addons?.asistenteWhatsapp === true && planIncludesWa(args.planFeatures)
    ? { ...args, addons: { ...args.addons, asistenteWhatsapp: false } }
    : args;
  const a = before.resolveCapabilities(expectedArgs);
  const b = now.resolveCapabilities(args);
  for (const key of OLD_KEYS) assert.deepEqual(b[key], a[key], `${label} -> ${key}`);
  assert.equal(b.registroServicios.enabled, false, `${label} -> registroServicios debe quedar apagada`);
  assert.deepEqual(
    sinPromociones(now.sellableCapabilities(b).map((c) => c.key)),
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
// Lo que guarda el modelo nuevo = lo del anterior, salvo el asistente en planes
// con vertical (antes se forzaba a false; ahora se guarda lo que diga el plan).
function expectedBuild(draft, opts) {
  const out = before.buildPlanFeatures(draft, opts);
  if (opts?.vertical) out.asistenteWhatsapp = { ...out.asistenteWhatsapp, enabled: before.buildPlanFeatures(draft).asistenteWhatsapp.enabled };
  return out;
}
const withoutAddons = ({ addons: _omit, ...p }) => p;

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
    // Solo cambió el texto de la descripción del asistente.
    const sinDescWa = (c) => (c.key === 'asistenteWhatsapp' ? { ...c, description: undefined } : c);
    const nuevas = now.CAPABILITIES.filter((c) => !NEW_KEYS.includes(c.key));
    assert.deepEqual(nuevas.map(sinDescWa), before.CAPABILITIES.map(sinDescWa));
    assert.deepEqual(now.CAPABILITY_MODULES, before.CAPABILITY_MODULES);
  });

  test('los presets de Esencial, Profesional y Premium no cambiaron', () => {
    // Funciones, límites y precio iguales; solo cambian los complementos ofrecidos.
    for (const id of EXISTING_PLANS) assert.deepEqual(withoutAddons(NEW_PRESETS[id]), withoutAddons(OLD_PRESETS[id]), id);
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
      // Lo único nuevo al guardar: registroServicios apagada, vistaAgenda y promociones activas.
      assert.deepEqual(nuevo, { ...storedFeatures(id), registroServicios: false, vistaAgenda: true, promociones: true }, id);
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
        const nuevas = { registroServicios: false, vistaAgenda: true, promociones: true };
        assert.deepEqual(now.buildPlanFeatures(planFeatures), { ...expectedBuild(planFeatures), ...nuevas }, `buildPlanFeatures caso ${i}`);
        assert.deepEqual(now.buildPlanFeatures(planFeatures, { vertical: 'citas' }), { ...expectedBuild(planFeatures, { vertical: 'citas' }), ...nuevas }, `buildPlanFeatures citas caso ${i}`);
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

  test('ofrece profesional y sucursal adicional; el plan no incluye el asistente', () => {
    assert.deepEqual(Object.keys(p.addons), ['profesionalExtra', 'sucursalExtra']);
    assert.equal(now.getAddonOffer(p, 'profesionalExtra').available, true);
    assert.equal(now.getAddonOffer(p, 'sucursalExtra').available, true);
    assert.equal(r.asistenteWhatsapp.enabled, false);
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
      assert.deepEqual(sinPromociones(now.sellableCapabilities(b).map((c) => c.key)), before.sellableCapabilities(a).map((c) => c.key), id);
    }
  });
});

describe('promociones: activa en todos los planes, se puede apagar por plan', () => {
  test('planes guardados sin la clave y negocios sin plan la tienen activa', () => {
    for (const id of EXISTING_PLANS) {
      assert.equal(now.resolveCapabilities({ planFeatures: storedFeatures(id) }).promociones.enabled, true, id);
    }
    assert.equal(now.resolveCapabilities({}).promociones.enabled, true);
  });
  test('un plan la puede apagar y una excepción la puede volver a encender', () => {
    const planFeatures = { ...storedFeatures('esencial'), promociones: false };
    assert.equal(now.resolveCapabilities({ planFeatures }).promociones.enabled, false);
    assert.equal(now.resolveCapabilities({ planFeatures, overrides: { promociones: true } }).promociones.enabled, true);
  });
});

describe('Asistente de WhatsApp en el plan y sucursal adicional', () => {
  const conAsistente = (id, wa = { enabled: true, limit: 500 }) => {
    const p = NEW_PRESETS[id];
    return now.buildPlanFeatures({ ...p.features, asistenteWhatsapp: wa }, { vertical: p.vertical });
  };

  test('complementos: se ofrecen profesional y sucursal adicional; el asistente es antiguo', () => {
    assert.deepEqual(now.ADDONS.map((a) => a.key), ['profesionalExtra', 'sucursalExtra']);
    assert.deepEqual(now.ADDONS[0], before.ADDONS.find((a) => a.key === 'profesionalExtra'));
    const suc = now.ADDONS[1];
    assert.equal(suc.kind, 'quantity');
    assert.equal(suc.capability, 'sucursales');
    assert.equal(suc.businessField, 'sucursalesExtra');
    assert.deepEqual(now.LEGACY_ADDONS.map((a) => a.key), ['asistenteWhatsapp']);
    const viejo = before.ADDONS.find((a) => a.key === 'asistenteWhatsapp');
    const legacy = now.LEGACY_ADDONS[0];
    for (const k of ['kind', 'capability', 'businessField', 'defaultPrice']) assert.equal(legacy[k], viejo[k], k);
    assert.equal(now.getAddonForCapability('asistenteWhatsapp').key, 'asistenteWhatsapp');
    assert.equal(now.getAddonForCapability('sucursales').key, 'sucursalExtra');
  });

  test('un plan con asistente lo activa (con su límite por sucursal) y se promociona', () => {
    for (const id of [...EXISTING_PLANS, 'nexus-control']) {
      const features = conAsistente(id);
      assert.deepEqual(features.asistenteWhatsapp, { enabled: true, limit: 500 }, id);
      const r = now.resolveCapabilities({ planFeatures: features });
      assert.equal(r.asistenteWhatsapp.enabled, true, id);
      assert.equal(r.asistenteWhatsapp.source, 'plan', id);
      assert.equal(now.getLimit(r, 'asistenteWhatsapp'), 500, id);
      assert.ok(now.sellableCapabilities(r).some((c) => c.key === 'asistenteWhatsapp'), id);
    }
    // El tipo de negocio y las excepciones siguen mandando.
    assert.equal(now.resolveCapabilities({ planFeatures: conAsistente('premium'), relevantModules: ['agenda', 'services'] }).asistenteWhatsapp.enabled, false);
    assert.equal(now.resolveCapabilities({ planFeatures: conAsistente('premium'), overrides: { asistenteWhatsapp: false } }).asistenteWhatsapp.enabled, false);
  });

  test('si el plan ya incluye el asistente, el complemento antiguo no cambia nada', () => {
    const planFeatures = conAsistente('profesional');
    const sin = now.resolveCapabilities({ planFeatures });
    const con = now.resolveCapabilities({ planFeatures, addons: { asistenteWhatsapp: true } });
    assert.deepEqual(con.asistenteWhatsapp, sin.asistenteWhatsapp);
    assert.equal(con.asistenteWhatsapp.plan.viaAddon, undefined);
  });

  test('el complemento antiguo sigue activo en negocios que lo tienen', () => {
    for (const id of [...EXISTING_PLANS, 'nexus-control']) {
      const p = NEW_PRESETS[id];
      const r = now.resolveCapabilities({ planFeatures: now.buildPlanFeatures(p.features, { vertical: p.vertical }), addons: { asistenteWhatsapp: true } });
      assert.equal(r.asistenteWhatsapp.enabled, true, id);
      assert.equal(r.asistenteWhatsapp.source, 'addon', id);
      assert.equal(now.getLimit(r, 'asistenteWhatsapp'), 1000, id);
      // Como complemento no cuenta como "incluido en el plan".
      assert.ok(!now.sellableCapabilities(r).some((c) => c.key === 'asistenteWhatsapp'), id);
    }
    // Planes ya guardados con el modelo anterior: igual que antes.
    for (const id of EXISTING_PLANS) {
      const args = { planFeatures: storedFeatures(id), addons: { asistenteWhatsapp: true } };
      assert.deepEqual(now.resolveCapabilities(args).asistenteWhatsapp, before.resolveCapabilities(args).asistenteWhatsapp, id);
    }
    assert.equal(now.normalizeAddons({ asistenteWhatsapp: true }).asistenteWhatsapp, true);
  });

  test('sucursalesExtra suma al límite de sucursales; una excepción con límite propio manda', () => {
    const lim = (id, extra) => now.getLimit(now.resolveCapabilities({ planFeatures: storedFeatures(id), ...extra }), 'sucursales');
    assert.equal(lim('esencial', {}), 1);
    assert.equal(lim('esencial', { addons: { sucursalesExtra: 2 } }), 3);
    assert.equal(lim('premium', { addons: { sucursalesExtra: 1 } }), 3);
    assert.equal(lim('esencial', { addons: { sucursalesExtra: 2 }, overrides: { sucursales: { limit: 5 } } }), 5);
    assert.equal(lim('esencial', { addons: { sucursalesExtra: -1 } }), 1);
    assert.equal(lim('esencial', { addons: { sucursalesExtra: 'x' } }), 1);
    assert.equal(lim('esencial', { addons: { sucursalesExtra: 999 } }), 1 + now.ADDONS[1].max);
    // Sin plan también suma (límite mínimo 1).
    assert.equal(now.getLimit(now.resolveCapabilities({ addons: { sucursalesExtra: 1 } }), 'sucursales'), 2);
    // No toca profesionales.
    assert.equal(now.getLimit(now.resolveCapabilities({ planFeatures: storedFeatures('esencial'), addons: { sucursalesExtra: 2 } }), 'profesionales'), 2);
  });

  test('los planes actuales sin asistente resuelven igual que antes', () => {
    for (const id of EXISTING_PLANS) {
      const p = NEW_PRESETS[id];
      const r = now.resolveCapabilities({ planFeatures: now.buildPlanFeatures(p.features, { vertical: p.vertical }) });
      const a = before.resolveCapabilities({ planFeatures: storedFeatures(id) });
      assert.equal(r.asistenteWhatsapp.enabled, false, id);
      for (const key of OLD_KEYS) assert.deepEqual(r[key], a[key], `${id} -> ${key}`);
    }
  });

  test('total mensual: plan + profesionales + sucursales + asistente antiguo', () => {
    const plan = { ...withoutAddons(NEW_PRESETS.esencial), addons: NEW_PRESETS.esencial.addons };
    const t = now.computeMonthlyTotal(plan, { profesionalesExtra: 2, sucursalesExtra: 1, asistenteWhatsapp: true });
    assert.deepEqual(t.lines.map((l) => [l.key, l.amount]), [['plan', 150], ['profesionalExtra', 90], ['sucursalExtra', 100], ['asistenteWhatsapp', 350]]);
    assert.equal(t.total, 690);
    // Precio del complemento antiguo definido por el plan (si lo tiene guardado).
    assert.equal(now.computeMonthlyTotal({ price: 0, addons: { asistenteWhatsapp: { price: 200 } } }, { asistenteWhatsapp: true }).total, 200);
  });
});
