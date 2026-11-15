// Pruebas de anticipos por QR: reserva que espera el anticipo, vencimiento,
// confirmar, rechazar, devolver o quedárselo, y cómo cuenta en caja y Finanzas.
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';
import { createFakeRouter, runRoute } from './helpers/fakeExpress.js';

const db = createFakeDb();
const router = createFakeRouter();
const pasa = (req, res, next) => next();
const caps = { anticipos: true };

mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('express', { namedExports: { Router: () => router } });
mock.module('../middlewares/auth.middleware.js', { namedExports: { identifyRequester: pasa } });
const enviados = [];
mock.module('../services/notificationService.js', {
  namedExports: { sendNotification: async (x) => { enviados.push(x); return { sent: 1 }; }, sendDirectNotification: async () => ({}) },
});
mock.module('../middlewares/session.middleware.js', { namedExports: { requireSession: pasa } });
mock.module('../services/capabilities/capabilityService.js', {
  namedExports: {
    requireCapability: () => pasa, checkCapability: async (id, key) => ({ allowed: caps[key] !== false }),
    getNegocioAccess: async () => ({ capabilities: {} }), invalidateNegocioAccess: () => {}, DENY_MESSAGES: {},
  },
});

await import('../routes/anticipos.routes.js');
const { createPublicBooking, listBusyAppointments } = await import('../services/appointments/publicBooking.js');
const S = await import('../services/anticipos/anticipoService.js');
const M = await import('../services/anticipos/anticipoModel.js');
const C = await import('../services/cash/cashModel.js');
const F = await import('../services/finanzas/finanzasModel.js');
const { buildMessage } = await import('../services/notificationTemplates.js');

const NEG = 'negA';
const N = `negocios/${NEG}`;
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const semana = () => DIAS.map((day) => ({ day, status: 'Disponible', start: '08:00', end: '20:00' }));
const QR = 'https://res.cloudinary.com/demo/qr.png';
const ADMIN = { verified: true, uid: 'uidA', email: 'dueno@negocio.bo' };
const call = (path, body = {}) => runRoute(router, 'POST', path, { actor: ADMIN, body });

// Fecha de la reserva: dentro de 3 días (la reserva pide 30 min de anticipación).
const DATE = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

function seed(anticipos = {}) {
  db._clear();
  db._set(N, {
    adminUid: 'uidA',
    businessSettings: {
      paymentMethods: ['Efectivo', 'QR', 'Tarjeta'],
      anticipos: { enabled: true, mode: 'percent', value: 50, minutes: 30, method: 'QR', qrImage: QR, instructions: 'Pon tu nombre en la glosa', ...anticipos },
    },
  });
  db._set(`${N}/servicios/s1`, { name: 'Corte', price: 100, duration: 30 });
  db._set(`${N}/servicios/s2`, { name: 'Barba', price: 50, duration: 30 });
  db._set(`${N}/profesionales/ana`, { name: 'Ana', active: true, availability: semana(), services: [{ serviceId: 's1' }, { serviceId: 's2' }] });
}

const reserva = (extra = {}) => ({
  negocioId: NEG, professionalId: 'ana', serviceIds: ['s1'], date: DATE, time: '09:00',
  clientName: 'Juan Pérez', clientPhone: '71234567', ...extra,
});

describe('modelo', () => {
  const cfg = M.normalizeAnticipoConfig({ enabled: true, mode: 'percent', value: 50, minutes: 30, qrImage: QR }, ['Efectivo', 'QR']);
  test('método por defecto: el QR (nunca efectivo); minutos acotados', () => {
    assert.equal(cfg.method, 'QR');
    assert.equal(M.normalizeAnticipoConfig({ minutes: 1 }, []).minutes, M.MIN_MINUTES);
    assert.equal(M.normalizeAnticipoConfig({ method: 'Efectivo' }, ['Efectivo']).method, '');
  });
  test('monto: porcentaje o fijo, redondeado arriba; excepciones no piden', () => {
    assert.equal(M.depositAmountFor(cfg, [{ serviceId: 's1', price: 75 }], 75), 38); // 37,5 -> 38
    const fijo = { ...cfg, mode: 'fixed', value: 30 };
    assert.equal(M.depositAmountFor(fijo, [{ serviceId: 's1', price: 20 }], 20), 20); // nunca más que el precio
    const exc = { ...cfg, excludedServiceIds: ['s2'] };
    assert.equal(M.depositAmountFor(exc, [{ serviceId: 's2', price: 50 }], 50), 0);
    assert.equal(M.depositAmountFor(exc, [{ serviceId: 's1', price: 100 }, { serviceId: 's2', price: 50 }], 150), 50);
    assert.equal(M.depositAmountFor({ ...cfg, qrImage: '' }, [{ serviceId: 's1', price: 100 }], 100), 0); // sin QR no pide
  });
  test('cobro al completar: precio menos anticipo pagado', () => {
    const cita = { status: 'completed', price: 100, paymentMethod: 'Efectivo', deposit: { status: 'paid', amount: 50 } };
    assert.equal(C.cobroAmountOfCita(cita), 50);
    assert.equal(C.amountOfCita(cita), 100); // el ingreso sigue siendo el precio completo
    assert.equal(C.buildCobros({ citas: [{ ...cita, id: 'x' }] })[0].amount, 50);
    assert.equal(C.buildCobros({ citas: [{ ...cita, id: 'y', deposit: { status: 'paid', amount: 100 } }] }).length, 0);
  });
});

describe('reserva con anticipo', () => {
  beforeEach(() => seed());

  test('queda por confirmar, con monto y vencimiento; devuelve lo necesario para pagar', async () => {
    const r = await createPublicBooking(reserva());
    const cita = db._get(`${N}/citas/${r.id}`);
    assert.equal(cita.status, 'pending');
    assert.equal(cita.deposit.status, 'awaiting');
    assert.equal(cita.deposit.amount, 50);
    assert.equal(cita.deposit.method, 'QR');
    const faltan = (Date.parse(cita.deposit.expiresAt) - Date.now()) / 60000;
    assert.ok(faltan > 29 && faltan <= 30);
    assert.equal(r.deposit.qrImage, QR);
    assert.equal(r.deposit.amount, 50);
    assert.equal(r.deposit.instructions, 'Pon tu nombre en la glosa');
  });

  test('ocupa el horario mientras no vence; vencida se cancela sola y libera el horario', async () => {
    const r = await createPublicBooking(reserva());
    await assert.rejects(createPublicBooking(reserva({ clientPhone: '79999999' })), /no está disponible/);
    const cita = db._get(`${N}/citas/${r.id}`);
    db._set(`${N}/citas/${r.id}`, { ...cita, deposit: { ...cita.deposit, expiresAt: new Date(Date.now() - 1000).toISOString() } });
    const busy = await listBusyAppointments(NEG, DATE);
    assert.equal(busy.citas.length, 0);
    const vencida = db._get(`${N}/citas/${r.id}`);
    assert.equal(vencida.status, 'cancelled');
    assert.equal(vencida.deposit.status, 'expired');
    const otra = await createPublicBooking(reserva({ clientPhone: '79999999' }));
    assert.ok(otra.id);
  });

  test('sin la capacidad, sin QR o con el servicio en excepción: reserva normal', async () => {
    caps.anticipos = false;
    const a = await createPublicBooking(reserva({ time: '09:00' }));
    assert.equal(db._get(`${N}/citas/${a.id}`).status, 'confirmed');
    caps.anticipos = true;
    seed({ qrImage: '' });
    const b = await createPublicBooking(reserva({ time: '10:00' }));
    assert.equal(db._get(`${N}/citas/${b.id}`).deposit, undefined);
    seed({ excludedServiceIds: ['s2'] });
    const c = await createPublicBooking(reserva({ time: '11:00', serviceIds: ['s2'] }));
    assert.equal(db._get(`${N}/citas/${c.id}`).status, 'confirmed');
  });
});

describe('lo que hace el dueño', () => {
  let id;
  beforeEach(async () => { seed(); id = (await createPublicBooking(reserva())).id; });

  test('confirmar: queda confirmada y el anticipo pagado (doble clic no rompe)', async () => {
    const r = await call(`/anticipos/${id}/confirmar`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await call(`/anticipos/${id}/confirmar`);
    const cita = db._get(`${N}/citas/${id}`);
    assert.equal(cita.status, 'confirmed');
    assert.equal(cita.deposit.status, 'paid');
    assert.equal(cita.deposit.verifiedBy.uid, 'uidA');
  });

  test('no se confirma una vencida', async () => {
    const cita = db._get(`${N}/citas/${id}`);
    db._set(`${N}/citas/${id}`, { ...cita, deposit: { ...cita.deposit, expiresAt: new Date(Date.now() - 1000).toISOString() } });
    assert.equal((await call(`/anticipos/${id}/confirmar`)).body.code, 'EXPIRED');
  });

  test('rechazar: se cancela y libera el horario', async () => {
    await call(`/anticipos/${id}/rechazar`);
    const cita = db._get(`${N}/citas/${id}`);
    assert.equal(cita.status, 'cancelled');
    assert.equal(cita.deposit.status, 'rejected');
  });

  test('cancelada con anticipo pagado: devolver o quedárselo (antes hay que cancelar)', async () => {
    await call(`/anticipos/${id}/confirmar`);
    assert.equal((await call(`/anticipos/${id}/resolver`, { decision: 'retain' })).body.code, 'NOT_CANCELLED');
    db._set(`${N}/citas/${id}`, { ...db._get(`${N}/citas/${id}`), status: 'cancelled' });
    assert.equal((await call(`/anticipos/${id}/resolver`, { decision: 'x' })).body.code, 'DECISION');
    const r = await call(`/anticipos/${id}/resolver`, { decision: 'retain' });
    assert.equal(r.body.deposit.status, 'retained');
  });

  test('vencer desde la agenda', async () => {
    const cita = db._get(`${N}/citas/${id}`);
    db._set(`${N}/citas/${id}`, { ...cita, deposit: { ...cita.deposit, expiresAt: new Date(Date.now() - 1000).toISOString() } });
    assert.equal((await call('/anticipos/vencer')).body.expired, 1);
  });
});

describe('Finanzas', () => {
  const config = { methodAccounts: { qr: 'bnb' } };
  const accounts = [{ id: 'caja_general', openingBalance: 0, openingAt: '2026-01-01T00:00:00Z' }, { id: 'bnb', openingBalance: 0, openingAt: '2026-01-01T00:00:00Z' }];
  const base = { id: 'c1', clientName: 'Juan', date: '2026-02-10', price: 100, deposit: { amount: 40, method: 'QR', paidAt: '2026-02-08T15:00:00Z' } };

  test('anticipo entra al banco al confirmarlo; al completar la caja recibe solo el saldo', () => {
    const cita = { ...base, status: 'completed', paymentMethod: 'Efectivo', paidAt: '2026-02-10T15:00:00Z', deposit: { ...base.deposit, status: 'paid' } };
    const flows = F.buildFlows({ citas: [cita], anticipos: [cita], config });
    const { balances } = F.computeBalances(accounts, flows);
    assert.equal(balances.bnb, 40);
    assert.equal(balances.caja_general, 60);
    const t = F.monthTotals({ citas: [cita], anticipos: [cita], startDay: '2026-02-01', endDay: '2026-02-28' });
    assert.equal(t.ingresos, 100); // el ingreso es el precio, no se cuenta dos veces
    const h = F.buildHistory(flows, [{ id: 'bnb', name: 'Banco BNB' }, { id: 'caja_general', name: 'Caja' }], { startDay: '2026-02-01', endDay: '2026-02-28' });
    assert.ok(h.some((i) => i.title === 'Anticipo · Juan' && /QR · entró a Banco BNB/.test(i.detail)));
  });

  test('devuelto: entra y sale; retenido: queda y es ingreso del mes en que se decidió', () => {
    const dev = { ...base, status: 'cancelled', deposit: { ...base.deposit, status: 'refunded', resolvedAt: '2026-02-09T15:00:00Z' } };
    assert.equal(F.computeBalances(accounts, F.buildFlows({ anticipos: [dev], config })).balances.bnb, 0);
    const ret = { ...base, status: 'cancelled', deposit: { ...base.deposit, status: 'retained', resolvedAt: '2026-03-01T15:00:00Z' } };
    assert.equal(F.computeBalances(accounts, F.buildFlows({ anticipos: [ret], config })).balances.bnb, 40);
    assert.equal(F.monthTotals({ anticipos: [ret], startDay: '2026-02-01', endDay: '2026-02-28' }).ingresos, 0);
    assert.equal(F.monthTotals({ anticipos: [ret], startDay: '2026-03-01', endDay: '2026-03-31' }).ingresos, 40);
  });
});

describe('avisos', () => {
  test('textos: por confirmar, confirmado, rechazado y vencido', () => {
    const d = { clientName: 'Martin', time: '09:00', date: '2026-11-18', amount: 40 };
    assert.deepEqual(buildMessage('RESERVA_POR_CONFIRMAR', d), { titulo: '⏳ Reserva por confirmar', cuerpo: 'Martin reservó el mié 18 nov a las 09:00. Se confirma cuando llegue el anticipo de Bs 40.' });
    assert.equal(buildMessage('ANTICIPO_CONFIRMADO', d).titulo, '✅ Reserva confirmada');
    assert.match(buildMessage('ANTICIPO_VENCIDO', d).cuerpo, /no pagó el anticipo a tiempo/);
    assert.match(buildMessage('RESERVA_PENDIENTE', { ...d, porConfirmar: true }).cuerpo, /Por confirmar: espera el anticipo/);
  });

  test('confirmar avisa al profesional; vencer avisa a dueño y profesional', async () => {
    seed();
    const id = (await createPublicBooking(reserva())).id;
    enviados.length = 0;
    await call(`/anticipos/${id}/confirmar`);
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].tipo, 'ANTICIPO_CONFIRMADO');
    assert.equal(enviados[0].targetProfessionalId, 'ana');
    assert.equal(enviados[0].onlyTargetProfessional, true);

    const id2 = (await createPublicBooking(reserva({ time: '10:00' }))).id;
    const c = db._get(`${N}/citas/${id2}`);
    db._set(`${N}/citas/${id2}`, { ...c, deposit: { ...c.deposit, expiresAt: new Date(Date.now() - 1000).toISOString() } });
    enviados.length = 0;
    await call('/anticipos/vencer');
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].tipo, 'ANTICIPO_VENCIDO');
    assert.equal(enviados[0].onlyTargetProfessional, undefined);
  });
});

describe('cuenta regresiva y "ya pagué"', () => {
  const vencer = (id) => { const c = db._get(`${N}/citas/${id}`); db._set(`${N}/citas/${id}`, { ...c, deposit: { ...c.deposit, expiresAt: new Date(Date.now() - 1000).toISOString() } }); };

  test('la reserva deja su registro para el revisor; el revisor la cancela al vencer y avisa', async () => {
    seed({ minutes: 5 });
    const { id } = await createPublicBooking(reserva());
    const hold = db._get(`anticipoHolds/${NEG}_${id}`);
    assert.equal(hold.citaId, id);
    const faltan = (Date.parse(hold.expiresAt) - Date.now()) / 60000;
    assert.ok(faltan > 4 && faltan <= 5);
    assert.equal(await S.sweepHolds(), 0); // todavía no vence
    enviados.length = 0;
    assert.equal(await S.sweepHolds(Date.now() + 6 * 60000), 1);
    assert.equal(db._get(`${N}/citas/${id}`).status, 'cancelled');
    assert.equal(db._get(`anticipoHolds/${NEG}_${id}`), undefined);
    assert.equal(enviados[0].tipo, 'ANTICIPO_VENCIDO');
  });

  test('"ya pagué": alarga el tiempo para que el dueño confirme y le avisa (solo una vez)', async () => {
    seed({ minutes: 5, verifyMinutes: 120 });
    const { id } = await createPublicBooking(reserva());
    enviados.length = 0;
    const r = await S.reportPaid(NEG, id);
    const extra = (Date.parse(r.expiresAt) - Date.now()) / 60000;
    assert.ok(extra > 119 && extra <= 120);
    assert.equal(db._get(`anticipoHolds/${NEG}_${id}`).expiresAt, r.expiresAt);
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].tipo, 'ANTICIPO_REPORTADO');
    assert.deepEqual(enviados[0].targetProfessionalIds, []); // solo al dueño
    const otra = await S.reportPaid(NEG, id);
    assert.equal(otra.expiresAt, r.expiresAt); // la segunda vez no alarga más
    assert.equal(enviados.length, 1);
    assert.equal(await S.sweepHolds(Date.now() + 6 * 60000), 0); // a los 6 min sigue guardada
    assert.equal((await call(`/anticipos/${id}/confirmar`)).status, 200);
    assert.equal(db._get(`anticipoHolds/${NEG}_${id}`), undefined);
  });

  test('"ya pagué" con el tiempo vencido no sirve', async () => {
    seed({ minutes: 5 });
    const { id } = await createPublicBooking(reserva());
    vencer(id);
    await assert.rejects(S.reportPaid(NEG, id), /Se acabó el tiempo/);
  });
});
