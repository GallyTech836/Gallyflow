// Pruebas de Finanzas: cuentas, a qué cuenta llega cada cobro, saldos
// calculados, transferencias, correcciones y resumen del mes.
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
mock.module('../services/capabilities/capabilityService.js', { namedExports: { requireCapability: () => pasa } });

await import('../routes/finanzas.routes.js');
const F = await import('../services/finanzas/finanzasModel.js');
const C = await import('../services/cash/cashModel.js');

const ADMIN = { verified: true, rol: 'admin', uid: 'uidA', email: 'dueno@negocio.bo' };
const OTRO = { verified: true, rol: 'admin', uid: 'uidX', email: 'otro@negocio.bo' };
const call = (method, path, body = {}, actor = ADMIN, query = {}) => runRoute(router, method, path, { actor, body, query });

const N = 'negocios/negA';
const fecha = C.localDateKey(Date.now());
let n = 0;
const rid = () => `req${String(++n).padStart(6, '0')}`;
const luego = (s = 0.002) => new Date(Date.now() + s * 1000).toISOString();

function cita(data) {
  const id = `c${++n}`;
  db._set(`${N}/citas/${id}`, {
    status: 'completed', date: fecha, time: '10:00', clientName: 'Cliente', branch: 'Central',
    serviceId: 'corte', serviceName: 'Corte', professionalId: 'p1', barberId: 'p1', price: 50,
    paidAt: luego(), updatedAt: luego(), ...data,
  });
  return id;
}

before(() => {
  db._set(N, { adminUid: 'uidA', plan: 'profesional', businessSettings: { paymentMethods: ['Efectivo', 'QR', 'Transferencia', 'Tarjeta'] } });
  db._set(`${N}/sucursales/s1`, { name: 'Central' });
  db._set(`${N}/servicios/corte`, { name: 'Corte', price: 50 });
  db._set(`${N}/profesionales/p1`, { name: 'Matías', branch: 'Central', services: [{ serviceId: 'corte', commissionEnabled: true, type: '%', value: 50 }] });
  // Caja cerrada antes de configurar: quedó un fondo de 200.
  db._set(`${N}/cajaEstado/s1`, { openSessionId: null, lastNextFund: 200 });
});

describe('modelo puro', () => {
  const accounts = [
    { id: 'caja_s1', openingBalance: 100, openingAt: '2026-01-01T00:00:00Z' },
    { id: 'bnb', openingBalance: 1000, openingAt: '2026-01-01T00:00:00Z' },
  ];
  const config = { methodAccounts: { qr: 'bnb', transferencia: 'bnb' } };
  const suc = [{ id: 's1', name: 'Central' }];
  const at = '2026-02-10T15:00:00Z';

  test('efectivo va a la caja, QR al banco y lo que no tiene cuenta queda por asignar', () => {
    const flows = F.buildFlows({
      citas: [
        { id: 'a', status: 'completed', paymentMethod: 'Efectivo', price: 50, paidAt: at, date: '2026-02-10' },
        { id: 'b', status: 'completed', paymentMethod: 'QR', price: 80, paidAt: at, date: '2026-02-10' },
        { id: 'c', status: 'completed', paymentMethod: 'Tarjeta', price: 30, paidAt: at, date: '2026-02-10' },
        { id: 'd', status: 'cancelled', paymentMethod: 'QR', price: 999, paidAt: at, date: '2026-02-10' },
      ],
      pagos: [{ id: 'p', amount: 40, method: 'Efectivo', isCash: true, cashScopeKey: 's1', paidAt: at, barberName: 'Matías' }],
      salidas: [
        { id: 's', source: 'manual', amount: 10, scopeKey: 's1', createdAt: at },
        { id: 's2', source: 'comision', amount: 40, scopeKey: 's1', createdAt: at }, // ya está en pagos
        { id: 's3', source: 'manual', amount: 99, scopeKey: 's1', createdAt: at, voided: true },
      ],
      movs: [
        { id: 't', type: 'transferencia', fromAccountId: 'caja_s1', toAccountId: 'bnb', amount: 50, at },
        { id: 'j', type: 'ajuste', accountId: 'bnb', amount: -5, at },
      ],
      cierres: [{ id: 'x', status: 'closed', scopeKey: 's1', closedAt: at, close: { difference: -2 } }],
      sucursales: suc, config,
    });
    const { balances, unassigned } = F.computeBalances(accounts, flows);
    // caja: 100 + 50 - 40 - 10 - 50 - 2 = 48 ; banco: 1000 + 80 + 50 - 5 = 1125
    assert.equal(balances.caja_s1, 48);
    assert.equal(balances.bnb, 1125);
    assert.deepEqual(unassigned, { total: 30, byMethod: { Tarjeta: 30 } });
  });

  test('lo anterior a la fecha de apertura de la cuenta no cuenta', () => {
    const flows = F.buildFlows({ citas: [{ id: 'a', status: 'completed', paymentMethod: 'QR', price: 80, paidAt: '2025-12-01T10:00:00Z', date: '2025-12-01' }], sucursales: suc, config });
    assert.equal(F.computeBalances(accounts, flows).balances.bnb, 1000);
  });

  test('historial agrupa los cobros por día y cuenta; la transferencia sale una vez', () => {
    const flows = F.buildFlows({
      citas: [
        { id: 'a', status: 'completed', paymentMethod: 'QR', price: 50, paidAt: at, date: '2026-02-10' },
        { id: 'b', status: 'completed', paymentMethod: 'Transferencia', price: 30, paidAt: at, date: '2026-02-10' },
      ],
      movs: [{ id: 't', type: 'transferencia', fromAccountId: 'caja_s1', toAccountId: 'bnb', amount: 50, at, note: 'Depósito del sobre' }],
      sucursales: suc, config,
    });
    const h = F.buildHistory(flows, [{ id: 'caja_s1', name: 'Caja' }, { id: 'bnb', name: 'Banco BNB' }], { startDay: '2026-02-01', endDay: '2026-02-28' });
    assert.equal(h.length, 2);
    const ventas = h.find((i) => i.type === 'in');
    assert.equal(ventas.amount, 80);
    assert.equal(ventas.title, 'Ventas del 10 feb');
    assert.match(ventas.detail, /2 cobros · entró a Banco BNB/);
    assert.match(h.find((i) => i.type === 'move').detail, /de Caja a Banco BNB/);
  });

  test('totales del mes: ganancia = entró − comisiones generadas − gastos', () => {
    const t = F.monthTotals({
      citas: [{ status: 'completed', paymentMethod: 'QR', price: 100, date: '2026-02-03' }, { status: 'completed', paymentMethod: 'QR', price: 100, date: '2026-03-01' }],
      pagos: [{ amount: 30, paidAt: '2026-02-05T15:00:00Z' }],
      salidas: [{ source: 'manual', amount: 10, createdAt: '2026-02-05T15:00:00Z' }],
      comisionesGeneradas: 50, startDay: '2026-02-01', endDay: '2026-02-28',
    });
    assert.deepEqual(t, { ingresos: 100, salio: 40, comisiones: 50, gastos: 10, fijos: 0, ganancia: 40 });
  });

  test('importes y meses', () => {
    assert.equal(F.parseMoney('12,5'), 12.5);
    assert.equal(F.parseMoney('-1'), null);
    assert.equal(F.parseMoney('0', { allowZero: false }), null);
    assert.equal(F.shiftMonth('2026-01', -1), '2025-12');
    assert.equal(F.methodKey(' Transferéncia '), 'transferencia');
  });
});

describe('cuentas y pregunta inicial', () => {
  test('otro usuario no entra', async () => {
    const r = await call('GET', '/finanzas/estado', {}, OTRO);
    assert.equal(r.status, 403);
  });

  test('sin configurar: pide a dónde llega cada cobro y muestra la caja', async () => {
    const r = await call('GET', '/finanzas/estado');
    assert.equal(r.status, 200);
    assert.equal(r.body.setupDone, false);
    assert.deepEqual(r.body.methods.filter((m) => !m.isCash).map((m) => m.name), ['QR', 'Transferencia', 'Tarjeta']);
    assert.deepEqual(r.body.cajas, [{ scopeKey: 's1', name: 'Caja', balance: 200 }]);
  });

  test('no se puede crear una cuenta antes de la pregunta inicial', async () => {
    const r = await call('POST', '/finanzas/cuentas', { name: 'BNB', balance: 0, requestId: rid() });
    assert.equal(r.status, 409);
  });

  test('si falta un método, no guarda nada', async () => {
    const r = await call('POST', '/finanzas/setup', { newAccounts: [{ tempId: 'n1', name: 'Banco BNB', type: 'banco', balance: 1000 }], map: { QR: 'n1' }, requestId: rid() });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Transferencia, Tarjeta/);
    assert.equal((await call('GET', '/finanzas/estado')).body.setupDone, false);
  });

  test('configura: crea la caja con lo que hay y el banco con su saldo', async () => {
    const req = { newAccounts: [{ tempId: 'n1', name: 'Banco BNB', type: 'banco', balance: 1000 }], map: { QR: 'n1', Transferencia: 'n1', Tarjeta: 'n1' }, requestId: 'setup000001' };
    const r = await call('POST', '/finanzas/setup', req);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.setupDone, true);
    const caja = r.body.accounts.find((a) => a.isCaja);
    const bnb = r.body.accounts.find((a) => a.name === 'Banco BNB');
    assert.equal(caja.balance, 200);
    assert.equal(bnb.balance, 1000);
    assert.deepEqual(bnb.methodKeys.sort(), ['qr', 'tarjeta', 'transferencia']);
    assert.equal(r.body.total, 1200);
    // Repetir no duplica
    const r2 = await call('POST', '/finanzas/setup', req);
    assert.equal(r2.body.accounts.length, 2);
  });
});

describe('saldos con datos reales', () => {
  let bnbId;
  test('los cobros nuevos suben la caja o el banco según el método', async () => {
    cita({ paymentMethod: 'Efectivo' });
    cita({ paymentMethod: 'QR' });
    cita({ paymentMethod: 'Tarjeta', price: 30 });
    db._set(`${N}/ventas/v1`, { status: 'paid', total: 20, paymentMethod: 'Efectivo', paidAt: luego(), date: fecha, branchKey: 's1' });
    const r = await call('GET', '/finanzas/estado');
    const caja = r.body.accounts.find((a) => a.isCaja);
    const bnb = r.body.accounts.find((a) => a.name === 'Banco BNB');
    bnbId = bnb.id;
    assert.equal(caja.balance, 270);
    assert.equal(bnb.balance, 1080);
  });

  test('pago de comisión en efectivo y salida de caja restan de la caja', async () => {
    db._set(`${N}/commissionPayments/pg1`, { barberId: 'p1', barberName: 'Matías', amount: 25, method: 'Efectivo', isCash: true, cashScopeKey: 's1', paidAt: luego() });
    db._set(`${N}/cajaMovimientos/m1`, { source: 'comision', amount: 25, scopeKey: 's1', createdAt: luego() });
    db._set(`${N}/cajaMovimientos/m2`, { source: 'manual', amount: 15, reason: 'Agua', scopeKey: 's1', createdAt: luego() });
    const caja = (await call('GET', '/finanzas/estado')).body.accounts.find((a) => a.isCaja);
    assert.equal(caja.balance, 230);
  });

  test('depositar el sobre pasa dinero de la caja al banco, sin pasar del saldo', async () => {
    const mucho = await call('POST', '/finanzas/transferencias', { fromAccountId: 'caja_s1', toAccountId: bnbId, amount: 999, requestId: rid() });
    assert.equal(mucho.status, 409);
    const req = { fromAccountId: 'caja_s1', toAccountId: bnbId, amount: 200, note: 'Depósito del sobre', requestId: 'dep00000001' };
    const r = await call('POST', '/finanzas/transferencias', req);
    assert.equal(r.status, 200);
    await call('POST', '/finanzas/transferencias', req); // doble clic
    const after = (await call('GET', '/finanzas/estado')).body;
    assert.equal(after.accounts.find((a) => a.isCaja).balance, 30);
    assert.equal(after.accounts.find((a) => a.id === bnbId).balance, 1280);
    assert.equal(after.total, 1310);
  });

  test('corregir el saldo deja una corrección, no cambia el saldo inicial', async () => {
    const r = await call('PATCH', `/finanzas/cuentas/${bnbId}`, { balance: 1275, requestId: rid() });
    assert.equal(r.status, 200);
    assert.equal(r.body.accounts.find((a) => a.id === bnbId).balance, 1275);
    const movs = (await db.collection(`${N}/finanzasMovimientos`).where('type', '==', 'ajuste').get()).docs.map((d) => d.data());
    assert.equal(movs.length, 1);
    assert.equal(movs[0].amount, -5);
    assert.equal(movs[0].note, 'Corrección de saldo');
  });

  test('nueva cuenta que recibe QR: el QR deja de llegar al banco', async () => {
    const r = await call('POST', '/finanzas/cuentas', { name: 'Tigo Money', type: 'billetera', balance: 0, methods: ['QR'], requestId: rid() });
    assert.equal(r.status, 200);
    const tigo = r.body.accounts.find((a) => a.name === 'Tigo Money');
    assert.deepEqual(tigo.methodKeys, ['qr']);
    assert.deepEqual(r.body.accounts.find((a) => a.id === bnbId).methodKeys.sort(), ['tarjeta', 'transferencia']);
    cita({ paymentMethod: 'QR', price: 40 });
    const e = (await call('GET', '/finanzas/estado')).body;
    assert.equal(e.accounts.find((a) => a.id === tigo.id).balance, 40);
  });

  test('desactivar: no con cobros asignados ni con saldo; la caja nunca', async () => {
    const e = (await call('GET', '/finanzas/estado')).body;
    const tigo = e.accounts.find((a) => a.name === 'Tigo Money');
    assert.equal((await call('PATCH', `/finanzas/cuentas/${tigo.id}`, { active: false, requestId: rid() })).status, 409);
    assert.equal((await call('PATCH', `/finanzas/cuentas/${tigo.id}`, { active: false, methods: [], requestId: rid() })).body.code, 'HAS_BALANCE');
    assert.equal((await call('PATCH', '/finanzas/cuentas/caja_s1', { active: false, requestId: rid() })).status, 400);
  });

  test('cobros sin cuenta quedan "por asignar"', async () => {
    db._set(N, { adminUid: 'uidA', plan: 'profesional', businessSettings: { paymentMethods: ['Efectivo', 'QR', 'Transferencia', 'Tarjeta', 'PayPal'] } });
    cita({ paymentMethod: 'PayPal', price: 70 });
    const e = (await call('GET', '/finanzas/estado')).body;
    assert.deepEqual(e.unassigned, { total: 70, byMethod: { PayPal: 70 } });
    assert.deepEqual(e.unassignedMethods, ['PayPal']);
  });
});

describe('resumen del mes', () => {
  test('totales, gráfico de 6 meses e historial', async () => {
    const r = await call('GET', '/finanzas/resumen');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // Citas: 50 + 50 + 30 + 40 + 70 = 240 ; venta 20  → 260
    assert.equal(r.body.ingresos, 260);
    assert.equal(r.body.comisiones, 120); // 50% de las citas con comisión
    assert.equal(r.body.gastos, 15);
    assert.equal(r.body.salio, 40);
    assert.equal(r.body.ganancia, 125);
    assert.equal(r.body.chart.length, 6);
    assert.equal(r.body.chart.at(-1).partial, true);
    const tipos = new Set(r.body.history.map((h) => h.type));
    for (const t of ['in', 'out', 'move', 'adj']) assert.ok(tipos.has(t), t);
  });

  test('mes futuro o inválido', async () => {
    assert.equal((await call('GET', '/finanzas/resumen', {}, ADMIN, { month: '2999-01' })).status, 400);
    assert.equal((await call('GET', '/finanzas/resumen', {}, ADMIN, { month: 'abc' })).status, 200);
  });
});

describe('gastos', () => {
  const cur = fecha.slice(0, 7);
  const enDias = (d) => C.localDateKey(Date.now() + d * 86400000);
  const estado = async () => (await call('GET', '/finanzas/estado')).body;
  const saldo = async (pred) => (await estado()).accounts.find(pred).balance;
  let bnbId;
  before(async () => { bnbId = (await estado()).accounts.find((a) => a.name === 'Banco BNB').id; });

  test('pagado desde el banco: baja el banco y queda como pagado', async () => {
    const antes = await saldo((a) => a.id === bnbId);
    const r = await call('POST', '/finanzas/gastos', { title: 'Luz del local', category: 'Servicios', amount: 100, paidNow: true, accountId: bnbId, requestId: 'gasto000001' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await call('POST', '/finanzas/gastos', { title: 'Luz del local', category: 'Servicios', amount: 100, paidNow: true, accountId: bnbId, requestId: 'gasto000001' }); // doble clic
    assert.equal(await saldo((a) => a.id === bnbId), antes - 100);
    const g = r.body.items.find((i) => i.title === 'Luz del local');
    assert.equal(g.status, 'pagado');
    assert.equal(r.body.owe, 0);
  });

  test('pagado desde la caja: también queda en la caja del día y no se cuenta dos veces', async () => {
    const antes = await saldo((a) => a.isCaja);
    const mucho = await call('POST', '/finanzas/gastos', { title: 'Detergente', category: 'Materiales', amount: 9999, paidNow: true, accountId: 'caja_s1', requestId: rid() });
    assert.equal(mucho.body.code, 'INSUFFICIENT');
    const r = await call('POST', '/finanzas/gastos', { title: 'Detergente', category: 'Materiales', amount: 20, paidNow: true, accountId: 'caja_s1', requestId: 'gasto000002' });
    assert.equal(r.body.saved.fromCaja, true);
    assert.equal(await saldo((a) => a.isCaja), antes - 20);
    const mov = db._get(`${N}/cajaMovimientos/gasto_gasto000002`);
    assert.equal(mov.source, 'gasto');
    assert.equal(mov.amount, 20);
    assert.equal(mov.sessionId, null); // caja cerrada: se descuenta al abrir la próxima
  });

  test('por pagar: no toca ninguna cuenta; se paga en partes', async () => {
    const antes = await saldo((a) => a.id === bnbId);
    const sinFecha = await call('POST', '/finanzas/gastos', { title: 'Proveedor', amount: 300, paidNow: false, requestId: rid() });
    assert.equal(sinFecha.body.code, 'DUE_REQUIRED');
    const r = await call('POST', '/finanzas/gastos', { title: 'Proveedor de productos', category: 'Productos', amount: 300, paidNow: false, due: enDias(10), requestId: rid() });
    assert.equal(r.body.owe, 300);
    assert.equal(await saldo((a) => a.id === bnbId), antes);
    const id = r.body.porPagar[0].id;
    const p1 = await call('POST', `/finanzas/gastos/${id}/pagos`, { amount: 100, accountId: bnbId, requestId: rid() });
    assert.equal(p1.body.saved.remaining, 200);
    assert.equal(p1.body.porPagar[0].status, 'parcial');
    assert.equal((await call('POST', `/finanzas/gastos/${id}/pagos`, { amount: 300, accountId: bnbId, requestId: rid() })).body.code, 'TOO_MUCH');
    const p2 = await call('POST', `/finanzas/gastos/${id}/pagos`, { amount: 200, accountId: bnbId, requestId: rid() });
    assert.equal(p2.body.owe, 0);
    assert.equal(await saldo((a) => a.id === bnbId), antes - 300);
  });

  test('se repite cada mes: crea el fijo y el gasto de este mes', async () => {
    const malDia = await call('POST', '/finanzas/gastos', { title: 'Alquiler', amount: 1000, repeat: true, day: 40, requestId: rid() });
    assert.equal(malDia.body.code, 'INVALID_DAY');
    const r = await call('POST', '/finanzas/gastos', { title: 'Alquiler', category: 'Alquiler', amount: 1000, paidNow: false, repeat: true, day: 5, requestId: 'fijo0000001' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.fijos.map((f) => [f.title, f.day]), [['Alquiler', 5]]);
    const g = r.body.porPagar.find((i) => i.title === 'Alquiler');
    assert.equal(g.id, `fijo_fijo_fijo0000001_${cur}`);
    assert.equal(g.due, `${cur}-05`);
    // volver a leer no lo duplica
    const again = await call('GET', '/finanzas/gastos');
    assert.equal(again.body.porPagar.filter((i) => i.title === 'Alquiler').length, 1);
  });

  test('el resumen suma los gastos del mes (pagados o no) y lo que salió', async () => {
    const r = (await call('GET', '/finanzas/resumen')).body;
    // salida de caja 15 + luz 100 + detergente 20 + proveedor 300 + alquiler 1000
    assert.equal(r.gastos, 1435);
    assert.equal(r.fijos, 1000);
    // comisión 25 + salida 15 + luz 100 + detergente 20 + proveedor 300
    assert.equal(r.salio, 460);
    assert.equal(r.ganancia, r.ingresos - r.comisiones - 1435);
    const luz = r.history.find((h) => h.title === 'Luz del local');
    assert.match(luz.detail, /Servicios · salió de Banco BNB/);
  });

  test('punto de equilibrio: meta = fijos ÷ lo que queda de cada venta', async () => {
    const r = (await call('GET', '/finanzas/equilibrio')).body;
    assert.equal(r.fijos, 1000);
    const ratio = (r.vendido - r.comisiones - r.variables) / r.vendido;
    assert.ok(Math.abs(r.ratio - ratio) < 0.0001);
    assert.equal(r.variables, 435);
    assert.equal(r.meta, null); // con estas ventas no queda nada para los fijos
    assert.equal(r.cubierto, false);
  });

  test('eliminar un gasto devuelve la plata a la cuenta; no si salió de una caja ya cerrada', async () => {
    const antes = await saldo((a) => a.isCaja);
    const del = await call('DELETE', '/finanzas/gastos/g_gasto000002');
    assert.equal(del.status, 200);
    assert.equal(await saldo((a) => a.isCaja), antes + 20);
    assert.equal(db._get(`${N}/cajaMovimientos/gasto_gasto000002`).voided, true);

    db._set(`${N}/cajaEstado/s1`, { openSessionId: 'ses1', lastNextFund: 200 });
    db._set(`${N}/cajas/ses1`, { status: 'open', scopeKey: 's1' });
    await call('POST', '/finanzas/gastos', { title: 'Agua', category: 'Otros', amount: 5, paidNow: true, accountId: 'caja_s1', requestId: 'gasto000003' });
    assert.equal(db._get(`${N}/cajaMovimientos/gasto_gasto000003`).sessionId, 'ses1');
    db._set(`${N}/cajas/ses1`, { status: 'closed', scopeKey: 's1' });
    const bloq = await call('DELETE', '/finanzas/gastos/g_gasto000003');
    assert.equal(bloq.body.code, 'CASH_CLOSED');
    db._set(`${N}/cajaEstado/s1`, { openSessionId: null, lastNextFund: 200 });
  });

  test('dejar de repetir', async () => {
    const fijo = (await call('GET', '/finanzas/gastos')).body.fijos[0];
    const r = await call('POST', `/finanzas/fijos/${fijo.id}/detener`);
    assert.deepEqual(r.body.fijos, []);
  });
});

describe('modelo: punto de equilibrio', () => {
  test('meta y si ya se cubrió', () => {
    const be = F.breakEven({ ingresos: 10000, comisiones: 4000, gastos: 3000, fijos: 2000 });
    // quedan 10000 - 4000 - 1000 = 5000 de 10000 -> 0,5 ; meta 2000 / 0,5 = 4000
    assert.equal(be.ratio, 0.5);
    assert.equal(be.meta, 4000);
    assert.equal(be.cubierto, true);
    assert.equal(F.breakEven({ ingresos: 0, comisiones: 0, gastos: 1000, fijos: 1000 }, 0.4).meta, 2500);
    assert.equal(F.breakEven({ ingresos: 0, comisiones: 0, gastos: 1000, fijos: 1000 }).meta, null);
    assert.equal(F.dueFor('2026-02', 31), '2026-02-28');
  });
});
