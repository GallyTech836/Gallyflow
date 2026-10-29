// Pruebas del aviso de vencimiento de suscripción / prueba gratuita, de la
// configuración de soporte en Super Admin y del criterio de "hoy" en La Paz
// de computeEffectiveStatus.
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
mock.module('firebase-admin/auth', { namedExports: { getAuth: () => ({}) } });
mock.module('express', { namedExports: { Router: () => router } });
mock.module('../middlewares/auth.middleware.js', { namedExports: { identifyRequester: pasa } });
mock.module('../middlewares/session.middleware.js', { namedExports: { requireSession: pasa } });

await import('../routes/subscriptionNotice.routes.js');
await import('../routes/superadmin.routes.js');
const M = await import('../services/subscription/subscriptionNoticeModel.js');
const { computeEffectiveStatus, laPazDateKey } = await import('../services/capabilities/capabilityModel.js');

const ADMIN = { verified: true, rol: 'admin', uid: 'uidA', email: 'dueno@negocio.bo' };
const BARBER = { verified: true, rol: 'barber', uid: 'staff1', negocioId: 'negA' };
const SUPER = { verified: true, email: 'torricogali@gmail.com' };
const call = (method, path, body = {}, actor = ADMIN) => runRoute(router, method, path, { actor, body });

// Día "AAAA-MM-DD" a `n` días de una fecha base.
const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
// Mediodía en La Paz (UTC-4) del día dado.
const mediodia = (key) => new Date(`${key}T16:00:00Z`);

const BASE = '2026-11-01';
const NOW = mediodia(BASE);
const activo = (dias) => ({ status: 'active', subscriptionEnd: addDays(BASE, dias), trialEnd: null });
const prueba = (dias) => ({ status: 'trial', trialEnd: addDays(BASE, dias), subscriptionEnd: null });

// ───────────────────────── Modelo puro: tramos ─────────────────────────

describe('tramos del aviso', () => {
  test('8 días: sin aviso', () => {
    assert.deepEqual(M.computeNotice(activo(8), null, NOW), { show: false });
  });

  test('7 días: tramo 7', () => {
    const n = M.computeNotice(activo(7), null, NOW);
    assert.equal(n.show, true);
    assert.equal(n.tramo, '7');
    assert.equal(n.diasRestantes, 7);
    assert.equal(n.tipo, 'subscription');
    assert.equal(n.fechaVencimiento, '2026-11-08');
  });

  test('6 días: tramo 7', () => {
    const n = M.computeNotice(activo(6), null, NOW);
    assert.equal(n.tramo, '7');
    assert.equal(n.diasRestantes, 6);
  });

  test('5 días: tramo 5', () => {
    const n = M.computeNotice(activo(5), null, NOW);
    assert.equal(n.tramo, '5');
    assert.equal(n.diasRestantes, 5);
  });

  test('0 días (vence hoy): tramo 5, todavía activo', () => {
    const n = M.computeNotice(activo(0), null, NOW);
    assert.equal(n.show, true);
    assert.equal(n.tramo, '5');
    assert.equal(n.diasRestantes, 0);
  });

  test('tramo 7 ya aceptado: no vuelve a salir, pero el 5 sí', () => {
    const reg = { aviso7: { aceptadoAt: '2026-11-01T12:00:00Z', diasRestantes: 7, email: 'x' }, aviso5: null };
    assert.deepEqual(M.computeNotice(activo(6), reg, NOW), { show: false });
    const n = M.computeNotice(activo(5), reg, NOW);
    assert.equal(n.show, true);
    assert.equal(n.tramo, '5');
  });

  test('tramo 7 saltado: solo sale el 5 (nunca los dos)', () => {
    const n = M.computeNotice(activo(3), null, NOW);
    assert.equal(n.tramo, '5');
    const reg = { aviso7: null, aviso5: { aceptadoAt: 'x', diasRestantes: 3, email: 'x' } };
    assert.deepEqual(M.computeNotice(activo(3), reg, NOW), { show: false });
  });

  test('renovación: con fecha nueva el período (y el registro) cambia', () => {
    const viejo = M.noticePeriod(activo(5));
    const nuevo = M.noticePeriod({ ...activo(5), subscriptionEnd: addDays(BASE, 35) });
    assert.notEqual(M.periodDocId(viejo), M.periodDocId(nuevo));
    assert.equal(M.periodDocId(viejo), 'subscription_2026-11-06');
  });

  test('prueba: manda trialEnd; plan: manda subscriptionEnd', () => {
    const t = M.computeNotice({ ...prueba(6), subscriptionEnd: addDays(BASE, 300) }, null, NOW);
    assert.equal(t.tipo, 'trial');
    assert.equal(t.tramo, '7');
    assert.equal(t.fechaVencimiento, addDays(BASE, 6));
    // Negocio activo con trialEnd cerca: se ignora, manda subscriptionEnd.
    assert.deepEqual(M.computeNotice({ status: 'active', trialEnd: addDays(BASE, 3), subscriptionEnd: addDays(BASE, 40) }, null, NOW), { show: false });
    // Sin fecha: sin aviso.
    assert.deepEqual(M.computeNotice({ status: 'active', subscriptionEnd: null }, null, NOW), { show: false });
    assert.deepEqual(M.computeNotice({ status: 'trial', trialEnd: null, subscriptionEnd: addDays(BASE, 3) }, null, NOW), { show: false });
  });

  test('negocio bloqueado: sin aviso', () => {
    assert.deepEqual(M.computeNotice(activo(-1), null, NOW), { show: false });
    assert.deepEqual(M.computeNotice({ ...activo(3), status: 'suspended' }, null, NOW), { show: false });
    // En prueba vigente pero con subscriptionEnd ya pasado => vencido.
    assert.deepEqual(M.computeNotice({ ...prueba(3), subscriptionEnd: addDays(BASE, -2) }, null, NOW), { show: false });
  });

  test('número y enlace de WhatsApp', () => {
    assert.equal(M.normalizeWhatsapp('+591 700-00000'), '59170000000');
    assert.equal(M.isValidWhatsapp('59170000000'), true);
    assert.equal(M.isValidWhatsapp(''), true);
    assert.equal(M.isValidWhatsapp('591abc'), false);
    assert.equal(M.isValidWhatsapp('123'), false);
    assert.equal(M.buildWhatsappUrl('', 'X'), null);
    assert.equal(
      M.buildWhatsappUrl('59170000000', 'Barbería Sol'),
      `https://wa.me/59170000000?text=${encodeURIComponent('Hola, soy de Barbería Sol. Quiero renovar mi suscripción de Nexus.')}`,
    );
  });
});

// ───────────────────── computeEffectiveStatus en La Paz ─────────────────────

describe('computeEffectiveStatus usa el día de La Paz', () => {
  const fin = '2026-11-05';

  test('día del vencimiento a las 21:00 de La Paz (ya 01:00 UTC del día siguiente): activo', () => {
    const now = new Date('2026-11-06T01:00:00Z'); // 05/11 21:00 en La Paz
    assert.equal(laPazDateKey(now), '2026-11-05');
    assert.equal(computeEffectiveStatus('active', fin, null, now), 'active');
    assert.equal(computeEffectiveStatus('trial', null, fin, now), 'trial');
  });

  test('día siguiente a las 00:01 de La Paz: vencido', () => {
    const now = new Date('2026-11-06T04:01:00Z'); // 06/11 00:01 en La Paz
    assert.equal(laPazDateKey(now), '2026-11-06');
    assert.equal(computeEffectiveStatus('active', fin, null, now), 'expired');
    assert.equal(computeEffectiveStatus('trial', null, fin, now), 'expired');
  });

  test('día anterior a las 23:59 de La Paz: activo', () => {
    assert.equal(computeEffectiveStatus('active', fin, null, new Date('2026-11-05T03:59:00Z')), 'active');
  });

  test('suspendido siempre gana; sin fechas sigue el estado', () => {
    assert.equal(computeEffectiveStatus('suspended', '2099-01-01', null, NOW), 'suspended');
    assert.equal(computeEffectiveStatus(undefined, null, null, NOW), 'active');
  });
});

// ───────────────────────── Rutas del administrador ─────────────────────────

const HOY = laPazDateKey(new Date());
const NEG = 'negocios/negA';
function setNegocio(data) {
  db._set(NEG, { adminUid: 'uidA', heroConfig: { businessName: 'Barbería Sol' }, ...data });
}

describe('GET/POST /subscription-notice', () => {
  beforeEach(() => db._clear());

  test('profesional: 401', async () => {
    setNegocio({ status: 'active', subscriptionEnd: addDays(HOY, 6) });
    const r = await call('GET', '/subscription-notice', {}, BARBER);
    assert.equal(r.status, 401);
  });

  test('sin número de soporte: whatsappUrl null', async () => {
    setNegocio({ status: 'active', subscriptionEnd: addDays(HOY, 6) });
    const r = await call('GET', '/subscription-notice');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      show: true, tramo: '7', diasRestantes: 6, tipo: 'subscription',
      fechaVencimiento: addDays(HOY, 6), whatsappUrl: null,
    });
  });

  test('con número de soporte: whatsappUrl con el nombre del negocio', async () => {
    db._set('plataforma/soporte', { whatsapp: '59170000000' });
    setNegocio({ status: 'trial', trialEnd: addDays(HOY, 2) });
    const r = await call('GET', '/subscription-notice');
    assert.equal(r.body.tipo, 'trial');
    assert.equal(r.body.tramo, '5');
    assert.match(r.body.whatsappUrl, /^https:\/\/wa\.me\/59170000000\?text=/);
    assert.match(decodeURIComponent(r.body.whatsappUrl), /Hola, soy de Barbería Sol\. Quiero renovar mi suscripción de Nexus\./);
  });

  test('aceptar guarda el registro, es idempotente y el aviso ya no sale', async () => {
    const fecha = addDays(HOY, 7);
    setNegocio({ status: 'active', subscriptionEnd: fecha });
    const a = await call('POST', '/subscription-notice/ack', { tramo: '7', fechaVencimiento: fecha });
    assert.equal(a.status, 200);
    assert.equal(a.body.already, false);
    const reg = db._get(`${NEG}/avisosVencimiento/subscription_${fecha}`);
    assert.equal(reg.tipo, 'subscription');
    assert.equal(reg.fechaVencimiento, fecha);
    assert.equal(reg.aviso5, null);
    assert.equal(reg.aviso7.diasRestantes, 7);
    assert.equal(reg.aviso7.email, 'dueno@negocio.bo');
    assert.ok(!Number.isNaN(Date.parse(reg.aviso7.aceptadoAt)));

    const b = await call('POST', '/subscription-notice/ack', { tramo: 7, fechaVencimiento: fecha });
    assert.equal(b.status, 200);
    assert.equal(b.body.already, true);
    assert.equal(db._get(`${NEG}/avisosVencimiento/subscription_${fecha}`).aviso7.aceptadoAt, reg.aviso7.aceptadoAt);

    const g = await call('GET', '/subscription-notice');
    assert.deepEqual(g.body, { show: false });
  });

  test('aceptar un tramo o una fecha que no corresponden: 409 y no guarda nada', async () => {
    const fecha = addDays(HOY, 6);
    setNegocio({ status: 'active', subscriptionEnd: fecha });
    const r1 = await call('POST', '/subscription-notice/ack', { tramo: '5', fechaVencimiento: fecha });
    assert.equal(r1.status, 409);
    const r2 = await call('POST', '/subscription-notice/ack', { tramo: '7', fechaVencimiento: addDays(HOY, 30) });
    assert.equal(r2.status, 409);
    assert.equal(db._list(`${NEG}/avisosVencimiento`).length, 0);
  });

  test('renovación: con fecha nueva el aviso vuelve a salir y el historial queda', async () => {
    const vieja = addDays(HOY, 3);
    setNegocio({ status: 'active', subscriptionEnd: vieja });
    await call('POST', '/subscription-notice/ack', { tramo: '5', fechaVencimiento: vieja });
    assert.deepEqual((await call('GET', '/subscription-notice')).body, { show: false });

    const nueva = addDays(HOY, 6); // renovó, pero la nueva fecha también está cerca
    setNegocio({ status: 'active', subscriptionEnd: nueva });
    const g = await call('GET', '/subscription-notice');
    assert.equal(g.body.show, true);
    assert.equal(g.body.fechaVencimiento, nueva);
    assert.ok(db._get(`${NEG}/avisosVencimiento/subscription_${vieja}`).aviso5);
  });

  test('negocio bloqueado: sin aviso y sin ack', async () => {
    setNegocio({ status: 'suspended', subscriptionEnd: addDays(HOY, 3) });
    assert.deepEqual((await call('GET', '/subscription-notice')).body, { show: false });
    const r = await call('POST', '/subscription-notice/ack', { tramo: '5', fechaVencimiento: addDays(HOY, 3) });
    assert.equal(r.status, 409);
  });
});

// ───────────────────────── Super Admin ─────────────────────────

describe('Super Admin: soporte y avisos', () => {
  beforeEach(() => db._clear());

  test('solo el Super Admin', async () => {
    const r = await call('GET', '/config/soporte', {}, ADMIN);
    assert.equal(r.status, 403);
  });

  test('config/soporte: leer, guardar, validar y borrar', async () => {
    assert.deepEqual((await call('GET', '/config/soporte', {}, SUPER)).body, { whatsapp: '' });

    const ok = await call('PUT', '/config/soporte', { whatsapp: '+591 70000000' }, SUPER);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { whatsapp: '59170000000' });
    assert.deepEqual((await call('GET', '/config/soporte', {}, SUPER)).body, { whatsapp: '59170000000' });

    const mal = await call('PUT', '/config/soporte', { whatsapp: '591-abc' }, SUPER);
    assert.equal(mal.status, 400);
    assert.equal(db._get('plataforma/soporte').whatsapp, '59170000000');

    const borra = await call('PUT', '/config/soporte', { whatsapp: '' }, SUPER);
    assert.deepEqual(borra.body, { whatsapp: '' });
    assert.deepEqual((await call('GET', '/config/soporte', {}, SUPER)).body, { whatsapp: '' });
  });

  test('avisos-vencimiento: del más reciente al más antiguo', async () => {
    setNegocio({ status: 'active' });
    const aviso = { aceptadoAt: '2026-10-01T12:00:00.000Z', diasRestantes: 6, email: 'dueno@negocio.bo' };
    db._set(`${NEG}/avisosVencimiento/trial_2026-09-15`, { tipo: 'trial', fechaVencimiento: '2026-09-15', aviso7: null, aviso5: aviso });
    db._set(`${NEG}/avisosVencimiento/subscription_2026-11-15`, { tipo: 'subscription', fechaVencimiento: '2026-11-15', aviso7: aviso, aviso5: null });
    db._set(`${NEG}/avisosVencimiento/subscription_2026-10-15`, { tipo: 'subscription', fechaVencimiento: '2026-10-15', aviso7: aviso, aviso5: aviso });
    const r = await call('GET', '/negocios/negA/avisos-vencimiento', {}, SUPER);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.periodos.map((p) => p.fechaVencimiento), ['2026-11-15', '2026-10-15', '2026-09-15']);
    assert.deepEqual(r.body.periodos[0], { tipo: 'subscription', fechaVencimiento: '2026-11-15', aviso7: aviso, aviso5: null });
    assert.equal(r.body.periodos[2].tipo, 'trial');
  });

  test('avisos-vencimiento: negocio inexistente 404', async () => {
    const r = await call('GET', '/negocios/nada/avisos-vencimiento', {}, SUPER);
    assert.equal(r.status, 404);
  });
});
