// Pruebas de la caja y el cierre diario (el "sobre"), pagos de comisiones,
// permisos y correcciones con PIN.
// Ejecutar:  cd backend && npm test

import { test, describe, before, mock } from 'node:test';
import assert from 'node:assert/strict';
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
mock.module('../middlewares/rateLimit.middleware.js', { namedExports: { financePinRateLimit: pasa } });
mock.module('../services/capabilities/capabilityService.js', { namedExports: { requireCapability: () => pasa } });

await import('../routes/cash.routes.js');
const { hashPin } = await import('../services/finance/pin.js');
const M = await import('../services/cash/cashModel.js');

const ADMIN = { verified: true, rol: 'admin', uid: 'uidA', email: 'dueno@negocio.bo' };
const BARBER = { verified: true, rol: 'barber', uid: 'staff1', negocioId: 'negA' };
const call = (method, path, body = {}, actor = ADMIN, query = {}) => runRoute(router, method, path, { actor, body, query });

const hoy = new Date().toISOString();
const fecha = M.localDateKey(Date.now());
const N = 'negocios/negA';
let n = 0;
function cita(data) {
  const id = `c${++n}`;
  db._set(`${N}/citas/${id}`, {
    status: 'completed', date: fecha, time: '10:00', clientName: `Cliente ${n}`, branch: 'Central',
    serviceId: 'corte', serviceName: 'Corte', professionalId: 'p1', barberId: 'p1',
    paidAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...data,
  });
  return id;
}
const current = async () => (await call('GET', '/cash/current')).body;

before(async () => {
  db._set(N, { adminUid: 'uidA', plan: 'profesional', businessSettings: { paymentMethods: ['Efectivo', 'QR', 'Transferencia', 'Tarjeta'] } });
  db._set(`${N}/sucursales/s1`, { name: 'Central' });
  db._set(`${N}/servicios/corte`, { name: 'Corte', price: 50 });
  const svc = [{ serviceId: 'corte', commissionEnabled: true, type: '%', value: 50 }];
  db._set(`${N}/profesionales/p1`, { name: 'Matías', branch: 'Central', services: svc });
  db._set(`${N}/profesionales/p2`, { name: 'Sofía', branch: 'Central', services: svc });
});

describe('modelo puro', () => {
  test('ejemplo del sobre: 200 + 650 efectivo; QR y otros no entran al efectivo', () => {
    const cobros = [
      { method: 'Efectivo', amount: 650 }, { method: 'QR', amount: 300 }, { method: 'Tarjeta', amount: 50 },
    ];
    const s = M.computeCashSummary({ openingFund: 200, cobros, salidas: [] });
    assert.equal(s.cashSales, 650);
    assert.equal(s.nonCashSales, 350);
    assert.equal(s.totalSales, 1000);
    assert.equal(s.expectedCash, 850);
  });
  test('el sobre y el fondo deben sumar lo contado', () => {
    assert.equal(M.validateClose({ expectedCash: 850, countedCash: 850, envelopeAmount: 650, nextFund: 200 }).ok, true);
    const mal = M.validateClose({ expectedCash: 850, countedCash: 850, envelopeAmount: 700, nextFund: 200 });
    assert.equal(mal.ok, false);
    assert.equal(M.validateClose({ expectedCash: 850, countedCash: 830, envelopeAmount: 630, nextFund: 200 }).difference, -20);
  });
  test('el día empieza a medianoche de Bolivia (UTC-4)', () => {
    const ms = Date.parse('2026-10-25T03:30:00Z'); // 23:30 del 24 en La Paz
    assert.equal(M.localDateKey(ms), '2026-10-24');
    assert.equal(new Date(M.localDayStartMillis(ms)).toISOString(), '2026-10-24T04:00:00.000Z');
  });
});

describe('caja de punta a punta', () => {
  let ses1;
  let ses2;

  test('6. un profesional no puede abrir, ver, registrar salidas ni cerrar la caja', async () => {
    for (const [m, p] of [['POST', '/cash/open'], ['GET', '/cash/current'], ['POST', '/cash/cash-out'], ['POST', '/cash/close'], ['POST', '/cash/commission-payments']]) {
      const r = await call(m, p, { openingFund: 200, countedCash: 0, envelopeAmount: 0, nextFund: 0 }, BARBER);
      assert.equal(r.status, 401, `${m} ${p}`);
    }
    // Un admin de OTRO negocio tampoco ve esta caja.
    const otro = await call('GET', '/cash/current', {}, { verified: true, rol: 'admin', uid: 'nadie' });
    assert.equal(otro.status, 403);
    assert.equal(db._list(`${N}/cajas`).length, 0);
  });

  test('1. abrir con Bs 200 y cobrar 650 efectivo, 300 QR y 50 tarjeta', async () => {
    const r = await call('POST', '/cash/open', { openingFund: 200 });
    assert.equal(r.status, 200);
    ses1 = r.body.session.id;
    assert.equal(r.body.session.openedBy.uid, 'uidA');
    // No se abre dos veces.
    assert.equal((await call('POST', '/cash/open', { openingFund: 100 })).status, 409);

    cita({ price: 650, paymentMethod: 'Efectivo' });
    cita({ price: 300, paymentMethod: 'QR' });
    cita({ price: 50, paymentMethod: 'Tarjeta', professionalId: 'p2', barberId: 'p2' });
    // No son cobros: pendiente, cancelada, completada sin método, venta anulada.
    cita({ price: 100, paymentMethod: 'Efectivo', status: 'pending' });
    cita({ price: 100, paymentMethod: 'Efectivo', status: 'cancelled' });
    cita({ price: 100, paymentMethod: 'Pendiente', professionalId: 'p9', barberId: 'p9' });
    db._set(`${N}/ventas/v1`, { status: 'void', total: 40, paymentMethod: 'Efectivo', date: fecha, paidAt: hoy, branchKey: 's1' });

    const c = await current();
    assert.equal(c.open, true);
    const qr = c.summary.byMethod.find((x) => x.method === 'QR');
    assert.equal(c.summary.openingFund, 200);
    assert.equal(c.summary.cashSales, 650);
    assert.equal(qr.amount, 300);
    assert.equal(c.summary.nonCashSales, 350);
    assert.equal(c.summary.expectedCash, 850);
    assert.equal(c.cobros.length, 3);
  });

  test('9. el total de ventas suma todos los métodos y no es el efectivo físico', async () => {
    const c = await current();
    assert.equal(c.summary.totalSales, 1000);
    assert.notEqual(c.summary.totalSales, c.summary.expectedCash);
  });

  test('2. cerrar con 850 contados: 650 al sobre y 200 de fondo', async () => {
    const malo = await call('POST', '/cash/close', { sessionId: ses1, countedCash: 850, envelopeAmount: 700, nextFund: 200 });
    assert.equal(malo.status, 400);
    const r = await call('POST', '/cash/close', { sessionId: ses1, countedCash: 850, envelopeAmount: 650, nextFund: 200 });
    assert.equal(r.status, 200);
    assert.equal(r.body.difference, 0);
    const s = db._get(`${N}/cajas/${ses1}`);
    assert.equal(s.status, 'closed');
    assert.equal(s.close.envelopeAmount, 650);
    assert.equal(s.close.nextFund, 200);
    assert.equal(s.close.summary.totalSales, 1000);
    assert.equal(s.closedBy.uid, 'uidA');
    assert.deepEqual(s.originalClose, s.close);
    // Cierre repetido: rechazado.
    assert.equal((await call('POST', '/cash/close', { sessionId: ses1, countedCash: 850, envelopeAmount: 650, nextFund: 200 })).status, 409);
    // Los cobros quedaron atados a esta caja.
    assert.equal(db._get(`${N}/citas/c1`).cashSessionId, ses1);
  });

  test('los cobros de una caja cerrada no se cuentan otra vez al reabrir el mismo día', async () => {
    const c0 = await current();
    assert.equal(c0.open, false);
    assert.equal(c0.suggestedOpeningFund, 200);
    const r = await call('POST', '/cash/open', { openingFund: 200 });
    ses2 = r.body.session.id;
    const c = await current();
    assert.equal(c.cobros.length, 0);
    assert.equal(c.summary.expectedCash, 200);
    cita({ price: 1000, paymentMethod: 'Efectivo', professionalId: 'p2', barberId: 'p2' });
    assert.equal((await current()).summary.expectedCash, 1200);
  });

  test('3. una comisión pagada en efectivo baja el efectivo esperado', async () => {
    // p1: 50% de 650 + 50% de 300 = 475
    const r = await call('POST', '/cash/commission-payments', { barberId: 'p1', startDate: fecha, endDate: fecha, method: 'Efectivo' });
    assert.equal(r.status, 200);
    assert.equal(r.body.monto, 475);
    assert.equal(r.body.cashSessionId, ses2);
    const c = await current();
    assert.equal(c.summary.cashOut, 475);
    assert.equal(c.summary.expectedCash, 1200 - 475);
    assert.equal(c.summary.cashOutByReason[0].reason, 'Comisión Matías');
    const pago = db._get(`${N}/commissionPayments/${r.body.paymentId}`);
    assert.equal(pago.method, 'Efectivo');
    assert.equal(pago.createdBy.uid, 'uidA');
    assert.ok(pago.paidAt);
    // No se puede pagar otra vez lo mismo.
    const otra = await call('POST', '/cash/commission-payments', { barberId: 'p1', startDate: fecha, endDate: fecha, method: 'Efectivo' });
    assert.equal(otra.status, 409);
    assert.equal(db._list(`${N}/commissionPayments`).length, 1);
  });

  test('4. una comisión pagada por transferencia no toca el efectivo', async () => {
    const antes = (await current()).summary.expectedCash;
    // p2: 50% de 50 + 50% de 1000 = 525
    const r = await call('POST', '/cash/commission-payments', { barberId: 'p2', startDate: fecha, endDate: fecha, method: 'Transferencia' });
    assert.equal(r.status, 200);
    assert.equal(r.body.monto, 525);
    assert.equal(r.body.isCash, false);
    const c = await current();
    assert.equal(c.summary.expectedCash, antes);
    assert.equal(c.salidas.length, 1);
    assert.equal(db._get(`${N}/commissionPayments/${r.body.paymentId}`).cashMovementId, null);
  });

  test('salida manual de efectivo con motivo', async () => {
    assert.equal((await call('POST', '/cash/cash-out', { amount: 30, reason: '' })).status, 400);
    const r = await call('POST', '/cash/cash-out', { amount: 30, reason: 'Compra de navajas' });
    assert.equal(r.status, 200);
    const c = await current();
    assert.equal(c.summary.cashOut, 505);
    assert.equal(c.summary.expectedCash, 200 + 1000 - 505); // 695
  });

  test('5. detecta la diferencia entre lo esperado y lo contado', async () => {
    const r = await call('POST', '/cash/close', { sessionId: ses2, countedCash: 680, envelopeAmount: 480, nextFund: 200 });
    assert.equal(r.status, 200);
    assert.equal(r.body.summary.expectedCash, 695);
    assert.equal(r.body.difference, -15);
  });

  test('una comisión en efectivo con la caja cerrada queda pendiente y se descuenta de la próxima caja', async () => {
    cita({ price: 80, paymentMethod: 'QR', professionalId: 'p1', barberId: 'p1' });
    const r = await call('POST', '/cash/commission-payments', { barberId: 'p1', startDate: fecha, endDate: fecha, method: 'Efectivo' });
    assert.equal(r.status, 200);
    assert.equal(r.body.pendingCashSession, true);
    const mov = db._list(`${N}/cajaMovimientos`).find((m) => m.commissionPaymentId === r.body.paymentId);
    assert.equal(mov.sessionId, null);
    // No se metió en la caja cerrada.
    assert.equal(db._get(`${N}/cajas/${ses2}`).close.summary.cashOut, 505);
    const c0 = await current();
    assert.equal(c0.pendingCashOut.length, 1);
    const o = await call('POST', '/cash/open', { openingFund: 200 });
    assert.equal(o.body.attachedCashOut, 1);
    const c = await current();
    assert.equal(c.summary.cashOut, 40);
    // La cita por QR de Bs 80 se cobró con la caja cerrada: entra en esta caja como venta, no como efectivo.
    assert.equal(c.summary.expectedCash, 200 - 40);
    assert.equal(c.summary.totalSales, 80);
    await call('POST', '/cash/close', { countedCash: 160, envelopeAmount: 0, nextFund: 160 });
  });

  test('7. no se corrige una caja cerrada sin PIN, ni con PIN incorrecto', async () => {
    const sinPin = await call('POST', `/cash/sessions/${ses2}/correct`, { pin: '1234', reason: 'Conté mal', changes: { countedCash: 695, envelopeAmount: 495, nextFund: 200 } });
    assert.equal(sinPin.status, 409);
    db._set('negocioSecrets/negA', { financePinHash: await hashPin('4321') });
    const mal = await call('POST', `/cash/sessions/${ses2}/correct`, { pin: '1111', reason: 'Conté mal', changes: { countedCash: 695, envelopeAmount: 495, nextFund: 200 } });
    assert.equal(mal.status, 401);
    const pro = await call('POST', `/cash/sessions/${ses2}/correct`, { pin: '4321', reason: 'Conté mal', changes: { countedCash: 695 } }, BARBER);
    assert.equal(pro.status, 401);
    assert.equal(db._get(`${N}/cajas/${ses2}`).close.countedCash, 680);
  });

  test('8. una corrección con PIN deja historial y no duplica movimientos', async () => {
    const movsAntes = db._list(`${N}/cajaMovimientos`).length;
    const salidaManual = db._list(`${N}/cajaMovimientos`).find((m) => m.source === 'manual');
    const r = await call('POST', `/cash/sessions/${ses2}/correct`, {
      pin: '4321', reason: 'Recontamos el sobre',
      changes: { countedCash: 695, envelopeAmount: 495, nextFund: 200 },
    });
    assert.equal(r.status, 200);
    let s = db._get(`${N}/cajas/${ses2}`);
    assert.equal(s.close.difference, 0);
    assert.equal(s.originalClose.countedCash, 680);
    assert.equal(s.corrected, true);
    // Anular la salida manual de Bs 30 (con PIN): el esperado sube a 725.
    const r2 = await call('POST', `/cash/sessions/${ses2}/correct`, {
      pin: '4321', reason: 'Las navajas se pagaron con la tarjeta del dueño',
      changes: { voidMovementIds: [salidaManual.id], countedCash: 695, envelopeAmount: 495, nextFund: 200 },
    });
    assert.equal(r2.status, 200);
    s = db._get(`${N}/cajas/${ses2}`);
    assert.equal(s.close.summary.expectedCash, 725);
    assert.equal(s.close.difference, -30);
    // La comisión no se anula desde la caja.
    const com = db._list(`${N}/cajaMovimientos`).find((m) => m.source === 'comision' && m.sessionId === ses2);
    const r3 = await call('POST', `/cash/sessions/${ses2}/correct`, { pin: '4321', reason: 'Probar anular comisión', changes: { voidMovementIds: [com.id] } });
    assert.equal(r3.status, 400);

    const corr = db._list(`${N}/cajas/${ses2}/correcciones`);
    assert.equal(corr.length, 2);
    assert.equal(corr[0].by.uid, 'uidA');
    assert.ok(corr[0].changes.some((c) => c.field === 'countedCash' && c.before === 680 && c.after === 695));
    assert.ok(corr[1].reason.includes('tarjeta'));
    // Nada se borró ni se duplicó: la salida sigue existiendo, marcada como anulada.
    assert.equal(db._list(`${N}/cajaMovimientos`).length, movsAntes);
    assert.equal(db._get(`${N}/cajaMovimientos/${salidaManual.id}`).voided, true);
    // El detalle trae el historial.
    const det = await call('GET', `/cash/sessions/${ses2}`);
    assert.equal(det.body.correcciones.length, 2);
  });
});
