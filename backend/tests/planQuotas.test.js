// Pruebas de los planes comerciales de lanzamiento (Esencial, Profesional,
// Premium), complementos y límites de profesionales/sucursales validados en
// el backend.
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

await import('../routes/negocioResources.routes.js');
const M = await import('../services/capabilities/capabilityModel.js');
const { getNegocioAccess } = await import('../services/capabilities/capabilityService.js');

const {
  LAUNCH_PLAN_PRESETS, CAPABILITIES, buildPlanFeatures, resolveCapabilities, sellableCapabilities,
  computeMonthlyTotal, computeEffectiveStatus, isPlanCompatible, getLimit, canUse,
} = M;

const ADMIN = { verified: true, rol: 'admin', uid: 'uidA' };
const ADMIN_B = { verified: true, rol: 'admin', uid: 'uidB' };
const PRESET = Object.fromEntries(LAUNCH_PLAN_PRESETS.map((p) => [p.id, p]));
// Igual que lo guarda Super Admin (usePlans.clean -> buildPlanFeatures).
const planDoc = (id) => {
  const { id: _omit, ...p } = PRESET[id];
  return { ...p, features: buildPlanFeatures(p.features, { vertical: p.vertical }) };
};
const resolvedOf = (id, extra = {}) => resolveCapabilities({ planFeatures: planDoc(id).features, ...extra });
const llamar = (method, path, actor = ADMIN, body = {}) => runRoute(router, method, path, { actor, body });

let n = 0;
const altaPro = (actor = ADMIN, body = {}) => llamar('POST', '/negocio/profesionales', actor, { firstName: 'Pro', lastName: String(++n), username: `pro${n}`, ...body });
const altaSuc = (actor = ADMIN, body = {}) => llamar('POST', '/negocio/sucursales', actor, { name: `Suc ${++n}`, address: 'Av. 1', ...body });
const contar = (col, neg = 'negA') => db._list(`negocios/${neg}/${col}`).length;

function seed({ plan = 'esencial', pros = 0, sucs = 0, extra = {} } = {}) {
  db._clear();
  for (const id of Object.keys(PRESET)) db._set(`planes/${id}`, planDoc(id));
  db._set('negocios/negA', { adminUid: 'uidA', plan, status: 'active', businessType: 'barberia', ...extra });
  db._set('negocios/negB', { adminUid: 'uidB', plan: 'premium', status: 'active' });
  for (let i = 0; i < pros; i++) db._set(`negocios/negA/profesionales/p${i}`, { name: `P${i}` });
  for (let i = 0; i < sucs; i++) db._set(`negocios/negA/sucursales/s${i}`, { name: `S${i}` });
}

// ─────────────────────────────── Modelo ───────────────────────────────

describe('planes de lanzamiento (modelo)', () => {
  test('tres planes con precio numérico, moneda Bs, mensual, 14 días de prueba y activación gratis', () => {
    assert.deepEqual(LAUNCH_PLAN_PRESETS.map((p) => [p.id, p.price]), [['esencial', 150], ['profesional', 280], ['premium', 450]]);
    for (const p of LAUNCH_PLAN_PRESETS) {
      assert.equal(typeof p.price, 'number');
      assert.equal(p.currency, 'Bs');
      assert.equal(p.billingCycle, 'monthly');
      assert.equal(p.trialDays, 14);
      assert.equal(p.setupFee, 0);
      assert.equal(p.vertical, 'citas');
      assert.equal(p.active, true);
      assert.deepEqual(p.addons, { profesionalExtra: { available: true, price: 45 }, asistenteWhatsapp: { available: true, price: 350 } });
    }
  });

  test('límites: Esencial 2/1, Profesional 5/1, Premium 10/2', () => {
    const lim = (id) => { const r = resolvedOf(id); return [getLimit(r, 'profesionales'), getLimit(r, 'sucursales')]; };
    assert.deepEqual(lim('esencial'), [2, 1]);
    assert.deepEqual(lim('profesional'), [5, 1]);
    assert.deepEqual(lim('premium'), [10, 2]);
  });

  test('funciones por plan', () => {
    const e = resolvedOf('esencial');
    for (const k of ['agenda', 'servicios', 'reservaPublica', 'linkPersonalProfesional', 'clientes', 'appProfesionales']) assert.ok(canUse(e, k), k);
    for (const k of ['comisiones', 'analiticas', 'historialCliente', 'permisosProfesional']) assert.ok(!canUse(e, k), k);
    for (const id of ['profesional', 'premium']) {
      const r = resolvedOf(id);
      for (const k of ['comisiones', 'analiticas', 'historialCliente', 'fichaCliente', 'permisosProfesional', 'reservaPublica']) assert.ok(canUse(r, k), `${id}.${k}`);
    }
  });

  test('ningún plan activa WhatsApp; el complemento sí (y el tipo de negocio puede restringirlo)', () => {
    for (const id of Object.keys(PRESET)) assert.equal(resolvedOf(id).asistenteWhatsapp.enabled, false, id);
    const con = resolvedOf('esencial', { addons: { asistenteWhatsapp: true } });
    assert.equal(con.asistenteWhatsapp.enabled, true);
    assert.equal(con.asistenteWhatsapp.source, 'addon');
    const sinSettings = resolvedOf('premium', { addons: { asistenteWhatsapp: true }, relevantModules: ['agenda', 'services'] });
    assert.equal(sinSettings.asistenteWhatsapp.enabled, false);
    const excepcion = resolvedOf('premium', { addons: { asistenteWhatsapp: true }, overrides: { asistenteWhatsapp: false } });
    assert.equal(excepcion.asistenteWhatsapp.enabled, false);
  });

  test('WhatsApp: 1000 mensajes/mes al contratar el complemento; un plan comercial nunca lo incluye', () => {
    const con = resolvedOf('esencial', { addons: { asistenteWhatsapp: true } });
    assert.equal(getLimit(con, 'asistenteWhatsapp'), 1000);
    const forzado = buildPlanFeatures({ asistenteWhatsapp: { enabled: true, limit: 500 } }, { vertical: 'citas' });
    assert.deepEqual(forzado.asistenteWhatsapp, { enabled: false, limit: 500 });
    // Plan anterior (sin vertical) que ya incluía WhatsApp: se respeta.
    assert.equal(buildPlanFeatures({ asistenteWhatsapp: { enabled: true } }).asistenteWhatsapp.enabled, true);
  });

  test('profesional adicional suma al límite; una excepción con límite propio manda', () => {
    assert.equal(getLimit(resolvedOf('esencial', { addons: { profesionalesExtra: 3 } }), 'profesionales'), 5);
    assert.equal(getLimit(resolvedOf('esencial', { addons: { profesionalesExtra: 3 }, overrides: { profesionales: { limit: 4 } } }), 'profesionales'), 4);
    assert.equal(getLimit(resolvedOf('esencial', { addons: { profesionalesExtra: -2 } }), 'profesionales'), 2);
  });

  test('prioridad: excepción > tipo de negocio > plan', () => {
    assert.equal(resolvedOf('esencial', { overrides: { comisiones: true } }).comisiones.enabled, true);
    assert.equal(resolvedOf('premium', { profileDefaults: { comisiones: { enabled: false } } }).comisiones.enabled, false);
    assert.equal(resolvedOf('premium', { profileDefaults: { comisiones: { enabled: false } }, overrides: { comisiones: true } }).comisiones.enabled, true);
  });

  test('maquetas, próximamente y restaurante: nunca habilitados ni promocionados', () => {
    for (const id of Object.keys(PRESET)) {
      const r = resolvedOf(id);
      for (const c of CAPABILITIES) {
        if (c.status === 'mock' || c.status === 'soon') assert.equal(r[c.key].enabled, false, `${id}.${c.key}`);
      }
      for (const k of ['pedidos', 'appMesero', 'mesas', 'menuRestaurante', 'cajaRestaurante']) assert.equal(r[k].enabled, false);
      const vendibles = sellableCapabilities(r);
      assert.ok(vendibles.every((c) => c.status === 'implemented' || c.status === 'partial'));
      assert.ok(!vendibles.some((c) => c.key === 'asistenteWhatsapp'));
    }
    // Aunque alguien active una maqueta en un plan, no se lista como vendible.
    const conMaqueta = resolveCapabilities({ planFeatures: { inventario: true } });
    assert.ok(conMaqueta.inventario.enabled);
    assert.ok(!sellableCapabilities(conMaqueta).some((c) => c.key === 'inventario'));
    // WhatsApp por complemento no cuenta como "incluido en el plan".
    assert.ok(!sellableCapabilities(resolvedOf('premium', { addons: { asistenteWhatsapp: true } })).some((c) => c.key === 'asistenteWhatsapp'));
  });

  test('planes de citas no se asignan a restaurantes', () => {
    assert.equal(isPlanCompatible(planDoc('esencial'), 'citas'), true);
    assert.equal(isPlanCompatible(planDoc('esencial'), 'restaurante'), false);
    assert.equal(isPlanCompatible({ name: 'Plan viejo' }, 'restaurante'), true); // sin vertical: no cambia nada
  });

  test('negocio sin plan: sin funciones de pago y con límites mínimos', () => {
    const r = resolveCapabilities({ planFeatures: null });
    for (const k of ['comisiones', 'analiticas', 'asistenteWhatsapp', 'inventario', 'asistencia']) assert.equal(r[k].enabled, false, k);
    assert.equal(getLimit(r, 'profesionales'), 2);
    assert.equal(getLimit(r, 'sucursales'), 1);
  });

  test('planes anteriores (sin vertical) se guardan igual que antes', () => {
    const viejo = buildPlanFeatures({});
    assert.equal(viejo.pedidos, true); // no se apaga el vertical restaurante en planes viejos
    assert.deepEqual(viejo.profesionales, { limit: null }); // explícito: no le afecta el mínimo "sin plan"
    assert.equal(getLimit(resolveCapabilities({ planFeatures: viejo }), 'profesionales'), null);
  });

  test('total mensual: plan + complementos', () => {
    const t = computeMonthlyTotal(planDoc('esencial'), { profesionalesExtra: 2, asistenteWhatsapp: true });
    assert.equal(t.total, 150 + 2 * 45 + 350);
    assert.equal(t.currency, 'Bs');
    assert.equal(computeMonthlyTotal(planDoc('premium'), null).total, 450);
  });

  test('desactivar un plan no cambia lo que resuelve para quien ya lo tiene', () => {
    const activo = resolvedOf('profesional');
    const inactivo = resolveCapabilities({ planFeatures: { ...planDoc('profesional'), active: false }.features });
    assert.deepEqual(inactivo, activo);
  });

  test('la prueba gratuita sigue con el mismo criterio', () => {
    const futuro = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    const pasado = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
    assert.equal(computeEffectiveStatus('trial', null, futuro), 'trial');
    assert.equal(computeEffectiveStatus('trial', null, pasado), 'expired');
    assert.equal(computeEffectiveStatus('active', futuro, pasado), 'active');
  });

  test('las copias front y backend del modelo son idénticas', () => {
    const back = readFileSync(new URL('../services/capabilities/capabilityModel.js', import.meta.url), 'utf8');
    const front = readFileSync(new URL('../../src/shared/capabilities/capabilityModel.js', import.meta.url), 'utf8');
    assert.equal(back, front);
  });
});

// ─────────────────────────────── Backend ───────────────────────────────

describe('altas validadas en el backend', () => {
  for (const [plan, maxPros, maxSucs] of [['esencial', 2, 1], ['profesional', 5, 1], ['premium', 10, 2]]) {
    test(`${plan}: hasta ${maxPros} profesionales y ${maxSucs} sucursales`, async () => {
      seed({ plan });
      for (let i = 0; i < maxPros; i++) assert.equal((await altaPro()).status, 201);
      const extra = await altaPro();
      assert.equal(extra.status, 403);
      assert.equal(extra.body.code, 'cupo_alcanzado');
      assert.equal(contar('profesionales'), maxPros);

      for (let i = 0; i < maxSucs; i++) assert.equal((await altaSuc()).status, 201);
      const extraSuc = await altaSuc();
      assert.equal(extraSuc.status, 403);
      assert.equal(contar('sucursales'), maxSucs);
    });
  }

  test('una solicitud directa no puede elegir otro negocio ni saltar el límite', async () => {
    seed({ plan: 'esencial', pros: 2 });
    const r = await altaPro(ADMIN, { negocioId: 'negB' });
    assert.equal(r.status, 403);
    assert.equal(contar('profesionales', 'negB'), 0);
    // El admin de B crea en B (Premium), nunca en A.
    assert.equal((await altaPro(ADMIN_B, { negocioId: 'negA' })).status, 201);
    assert.equal(contar('profesionales', 'negB'), 1);
    assert.equal(contar('profesionales'), 2);
  });

  test('crea el perfil y usuarios/{id} juntos, sin contraseña', async () => {
    seed({ plan: 'premium' });
    const r = await altaPro(ADMIN, { username: 'juan', firstName: 'Juan', lastName: 'Pérez', password: 'NO' });
    assert.equal(r.status, 201);
    const pro = db._get(`negocios/negA/profesionales/${r.body.id}`);
    assert.equal(pro.name, 'Juan Pérez');
    assert.equal(pro.password, undefined);
    assert.deepEqual(db._get(`usuarios/${r.body.id}`), { username: 'juan', rol: 'barber', negocioId: 'negA', uidFirebase: r.body.id });
  });

  test('usuario repetido: 409 y no se crea nada', async () => {
    seed({ plan: 'premium' });
    db._set('usuarios/otro', { username: 'juan', rol: 'barber', negocioId: 'negB' });
    const r = await altaPro(ADMIN, { username: 'juan' });
    assert.equal(r.status, 409);
    assert.equal(contar('profesionales'), 0);
  });

  test('cambiar de plan actualiza los límites al instante', async () => {
    seed({ plan: 'esencial', pros: 2 });
    assert.equal((await altaPro()).status, 403);
    db._set('negocios/negA', { ...db._get('negocios/negA'), plan: 'profesional' });
    assert.equal((await altaPro()).status, 201);
    assert.equal(getLimit((await getNegocioAccess('negA', { fresh: true })).capabilities, 'profesionales'), 5);
  });

  test('bajar de plan con exceso: conserva todo y bloquea altas hasta cumplir el límite', async () => {
    seed({ plan: 'premium', pros: 4, sucs: 2 });
    db._set('negocios/negA', { ...db._get('negocios/negA'), plan: 'esencial' });
    const r = await altaPro();
    assert.equal(r.status, 403);
    assert.equal(r.body.quota.over, 2);
    assert.equal(contar('profesionales'), 4); // nada borrado
    assert.equal(contar('sucursales'), 2);
    assert.equal((await altaSuc()).status, 403);
    // El negocio elimina por su cuenta hasta quedar por debajo del límite.
    await db.doc('negocios/negA/profesionales/p0').delete();
    await db.doc('negocios/negA/profesionales/p1').delete();
    assert.equal((await altaPro()).status, 403); // 2 de 2: cupo completo
    await db.doc('negocios/negA/profesionales/p2').delete();
    assert.equal((await altaPro()).status, 201);
  });

  test('complemento de profesionales adicionales amplía el cupo sin cambiar de plan', async () => {
    seed({ plan: 'esencial', pros: 2, extra: { addons: { profesionalesExtra: 1 } } });
    assert.equal((await altaPro()).status, 201);
    assert.equal((await altaPro()).status, 403);
  });

  test('desactivar un plan no borra negocios ni datos, y sus límites siguen aplicando', async () => {
    seed({ plan: 'profesional', pros: 3 });
    db._set('planes/profesional', { ...db._get('planes/profesional'), active: false });
    const access = await getNegocioAccess('negA', { fresh: true });
    assert.equal(access.planId, 'profesional');
    assert.equal(access.planActive, false);
    assert.equal(getLimit(access.capabilities, 'profesionales'), 5);
    assert.ok(db._get('negocios/negA'));
    assert.equal(contar('profesionales'), 3);
    assert.equal((await altaPro()).status, 201);
  });

  test('negocio sin plan (o con plan borrado): máximo 2 profesionales y 1 sucursal', async () => {
    seed({ plan: null, pros: 2, sucs: 1 });
    assert.equal((await altaPro()).status, 403);
    assert.equal((await altaSuc()).status, 403);
    seed({ plan: 'plan-que-no-existe', pros: 1 });
    assert.equal((await altaPro()).status, 201);
    assert.equal((await altaPro()).status, 403);
  });

  test('negocio suspendido o con prueba vencida no crea', async () => {
    seed({ plan: 'premium', extra: { status: 'suspended' } });
    assert.equal((await altaPro()).body.code, 'negocio_bloqueado');
    seed({ plan: 'premium', extra: { status: 'trial', trialEnd: '2020-01-01' } });
    assert.equal((await altaSuc()).body.code, 'negocio_bloqueado');
    seed({ plan: 'premium', extra: { status: 'trial', trialEnd: '2999-01-01' } });
    assert.equal((await altaSuc()).status, 201); // prueba vigente: funciona normal
  });

  test('solo el admin del negocio', async () => {
    seed({ plan: 'premium' });
    assert.equal((await altaPro({ verified: true, rol: 'barber', uid: 'x' })).status, 401);
    assert.equal((await altaSuc({ verified: false })).status, 401);
    assert.equal((await altaPro({ verified: true, rol: 'admin', uid: 'desconocido' })).status, 403);
  });

  test('datos inválidos se rechazan', async () => {
    seed({ plan: 'premium' });
    assert.equal((await llamar('POST', '/negocio/profesionales', ADMIN, { firstName: '', username: '' })).status, 400);
    assert.equal((await llamar('POST', '/negocio/sucursales', ADMIN, { name: 'X' })).status, 400);
  });

  test('WhatsApp: el límite es por cliente; los demás clientes siguen normales', async () => {
    const { checkCapability, checkClientLimit, incrementClientUsage, currentPeriod } = await import('../services/capabilities/capabilityService.js');
    seed({ plan: 'esencial', extra: { addons: { asistenteWhatsapp: true } } });
    await getNegocioAccess('negA', { fresh: true }); // el webhook usa la caché de 60 s
    const periodo = currentPeriod();
    // El total del negocio (aunque sea alto) no corta el servicio.
    db._set(`negocios/negA/uso/${periodo}`, { whatsappMensajes: 50000 });
    const permiso = await checkCapability('negA', 'asistenteWhatsapp');
    assert.equal(permiso.allowed, true);
    assert.equal(permiso.limit, 1000);

    db._set(`negocios/negA/uso/${periodo}/clientes/59170000001`, { enviados: 999 });
    assert.equal((await checkClientLimit('negA', '+591 70000001', permiso.limit)).allowed, true);
    await incrementClientUsage('negA', '59170000001', permiso.limit); // llega a 1000
    assert.equal((await checkClientLimit('negA', '59170000001', permiso.limit)).allowed, false);
    assert.equal(db._get(`negocios/negA/uso/${periodo}`).clientesAlLimite, 1);
    // Otro cliente: sin problema.
    assert.equal((await checkClientLimit('negA', '59170000002', permiso.limit)).allowed, true);
    await incrementClientUsage('negA', '59170000002', permiso.limit);
    assert.equal(db._get(`negocios/negA/uso/${periodo}/clientes/59170000002`).enviados, 1);
    // Sin límite configurado: siempre permitido.
    assert.equal((await checkClientLimit('negA', '59170000001', null)).allowed, true);
  });

  test('GET /negocio/quotas', async () => {
    seed({ plan: 'esencial', pros: 3, sucs: 1 });
    const r = await llamar('GET', '/negocio/quotas');
    assert.equal(r.status, 200);
    assert.equal(r.body.planId, 'esencial');
    assert.deepEqual(r.body.quotas.profesionales, { key: 'profesionales', limit: 2, used: 3, remaining: 0, exceeded: true, over: 1 });
    assert.equal(r.body.quotas.sucursales.exceeded, true);
  });
});
