// Pruebas del registro de servicios (plan Nexus Control):
// permisos barbero/admin, precio en el servidor, comisión congelada,
// requestId repetido, posible duplicado, sucursal, avisos push,
// correcciones/anulación con PIN, y que nada de esto cambie lo que ya existía
// (citas sin snapshot, disponibilidad, analítica, caja).
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';
import { createFakeRouter, runRoute } from './helpers/fakeExpress.js';

const db = createFakeDb();
const router = createFakeRouter();
const pasa = (req, res, next) => next();

// Push: se captura a quién se le envía (sin red).
const pushes = [];
let pushFalla = false;
mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('express', { namedExports: { Router: () => router } });
mock.module('../middlewares/auth.middleware.js', { namedExports: { identifyRequester: pasa } });
mock.module('../middlewares/session.middleware.js', { namedExports: { requireSession: pasa } });
mock.module('../services/providers/oneSignalProvider.js', {
  namedExports: {
    send: (oneSignalId, mensaje, url) => {
      if (pushFalla) throw new Error('OneSignal caído');
      pushes.push({ oneSignalId, mensaje, url });
      return Promise.resolve();
    },
  },
});

await import('../routes/serviciosRegistrados.routes.js');
const { invalidateNegocioAccess } = await import('../services/capabilities/capabilityService.js');
const { buildPlanFeatures, LAUNCH_PLAN_PRESETS } = await import('../services/capabilities/capabilityModel.js');
const { hashPin } = await import('../services/finance/pin.js');
const { calculateCommissionForCita } = await import('../services/finance/commissionModel.js');
const front = await import('../../src/shared/commissions/commissionModel.js');
const { getFinanceSummary, getComisionesPorProfesional } = await import('../services/finance/financeData.js');
const { openCash, closeCash, getCurrentCash, registerCommissionPayment } = await import('../services/cash/cashService.js');
const { getAvailableSlots } = await import('../services/appointments/availability.js');
const { isProfessionalFreeAt } = await import('../services/appointments/pendingModel.js');
const { listBusyAppointments } = await import('../services/appointments/publicBooking.js');
const { todayKey, DUPLICATE_WINDOW_MS, noonMillis, shiftDay, CASH_PLACEMENT, MAX_BACKDATE_DAYS } = await import('../services/registros/registroService.js');
const { localDateKey } = await import('../services/cash/cashModel.js');

const N = 'negocios/negA';
const ADMIN = { verified: true, rol: 'admin', uid: 'uidA', email: 'dueno@negocio.bo' };
const BARBER = { verified: true, rol: 'barber', uid: 'p1', negocioId: 'negA' };
const BARBER2 = { verified: true, rol: 'barber', uid: 'p2', negocioId: 'negA' };
const call = (method, path, body = {}, actor = ADMIN, query = {}) => runRoute(router, method, path, { actor, body, query });
const registrar = (body = {}, actor = BARBER) => call('POST', '/servicios-registrados', { requestId: randomUUID(), services: [{ serviceId: 'corte' }], paymentMethod: 'Efectivo', ...body }, actor);
const cita = (id) => db._get(`${N}/citas/${id}`);
const hoy = () => todayKey();
const ayer = () => localDateKey(Date.now() - 86400000);

const planDoc = (id) => {
  const p = { ...LAUNCH_PLAN_PRESETS.find((x) => x.id === id) };
  delete p.id;
  return { ...p, features: buildPlanFeatures(p.features, { vertical: p.vertical }) };
};

function seed({ plan = 'nexus-control', sucursales = ['Central'] } = {}) {
  db._clear();
  pushes.length = 0;
  pushFalla = false;
  invalidateNegocioAccess('negA');
  db._set('planes/nexus-control', planDoc('nexus-control'));
  db._set('planes/profesional', planDoc('profesional'));
  db._set(N, { adminUid: 'uidA', plan, status: 'active', businessType: 'barberia', businessSettings: { paymentMethods: ['Efectivo', 'QR'] } });
  sucursales.forEach((name, i) => db._set(`${N}/sucursales/s${i}`, { name }));
  db._set(`${N}/servicios/corte`, { name: 'Corte', price: 50, duration: 30 });
  db._set(`${N}/servicios/barba`, { name: 'Barba', price: 30, duration: 20 });
  db._set(`${N}/servicios/color`, { name: 'Color', price: 100, priceVariable: true, duration: 60 });
  db._set(`${N}/servicios/tinte`, { name: 'Tinte', price: 80 });
  const svc = [
    { serviceId: 'corte', commissionEnabled: true, type: '%', value: 40 },
    { serviceId: 'barba', commissionEnabled: true, type: 'Bs', value: 10 },
    { serviceId: 'color', commissionEnabled: true, type: '%', value: 50 },
  ];
  db._set(`${N}/profesionales/p1`, { name: 'Matías', branch: 'Central', active: true, services: svc });
  db._set(`${N}/profesionales/p2`, { name: 'Sofía', branch: 'Central', active: true, services: [...svc.slice(0, 1).map((s) => ({ ...s, customPrice: 70 }))] });
  db._set(`${N}/profesionales/p3`, { name: 'Inactivo', branch: 'Central', active: false, services: svc });
  db._set('usuarios/uidA', { rol: 'admin', negocioId: 'negA', oneSignalId: 'os-admin' });
  db._set('usuarios/uidA2', { rol: 'admin', negocioId: 'negA', oneSignalId: 'os-admin2' });
  db._set('usuarios/p1', { rol: 'barber', negocioId: 'negA', oneSignalId: 'os-p1' });
  db._set('usuarios/p2', { rol: 'barber', negocioId: 'negA', oneSignalId: 'os-p2' });
  db._set(`${N}/clientes/cli1`, { name: 'Juan Pérez', phone: '70000000' });
}

async function setPin(pin = '1234') {
  db._set('negocioSecrets/negA', { financePinHash: await hashPin(pin) });
}

// ─────────────────────────────── Registrar ───────────────────────────────

describe('registrar: permisos y datos guardados', () => {
  beforeEach(() => seed());

  test('barbero: el servidor fuerza su profesional y guarda un cita completada de origen registro', async () => {
    const r = await registrar({ professionalId: 'p2', services: [{ serviceId: 'corte', price: 1 }] }, BARBER);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const d = cita(r.body.registro.id);
    assert.equal(r.body.registro.id, r.body.registro.requestId);
    assert.equal(d.professionalId, 'p1');
    assert.equal(d.barberId, 'p1');
    assert.equal(d.origin, 'registro');
    assert.equal(d.status, 'completed');
    assert.equal(d.bookedBy, 'barber');
    assert.deepEqual(d.registeredBy, { uid: 'p1', rol: 'barber' });
    assert.equal(d.price, 50, 'el precio del navegador se ignora en servicios de precio fijo');
    assert.equal(d.services[0].price, 50);
    assert.equal(d.clientId, null);
    assert.equal(d.clientName, 'Cliente general');
    assert.equal(d.paymentMethod, 'Efectivo');
    assert.equal(d.branch, 'Central');
    assert.equal(d.date, hoy());
    assert.match(d.time, /^\d{2}:\d{2}$/);
    assert.equal(d.paidAt, d.createdAt);
    assert.equal(d.commissionPaid, false);
    assert.equal(d.commission, undefined, 'no usa el campo commission viejo');
    assert.deepEqual({ amount: d.commissionSnapshot.amount, type: d.commissionSnapshot.breakdown[0].type, value: d.commissionSnapshot.breakdown[0].value }, { amount: 20, type: '%', value: 40 });
  });

  test('admin: elige cualquier profesional activo; inactivo, inexistente o vacío se rechaza', async () => {
    const ok = await registrar({ professionalId: 'p2' }, ADMIN);
    assert.equal(ok.status, 201);
    const d = cita(ok.body.registro.id);
    assert.equal(d.professionalId, 'p2');
    assert.equal(d.bookedBy, 'admin');
    assert.equal(d.price, 70, 'precio propio del profesional');
    assert.equal((await registrar({ professionalId: 'p3' }, ADMIN)).body.code, 'PROFESSIONAL_INACTIVE');
    assert.equal((await registrar({ professionalId: 'nadie' }, ADMIN)).body.code, 'PROFESSIONAL_NOT_FOUND');
    assert.equal((await registrar({}, ADMIN)).body.code, 'PROFESSIONAL_REQUIRED');
  });

  test('cliente existente opcional', async () => {
    const r = await registrar({ clientId: 'cli1' });
    assert.equal(cita(r.body.registro.id).clientName, 'Juan Pérez');
    assert.equal(cita(r.body.registro.id).clientId, 'cli1');
    assert.equal((await registrar({ clientId: 'no-existe' })).body.code, 'CLIENT_NOT_FOUND');
  });

  test('sin la capacidad registroServicios: 403 (plan Profesional)', async () => {
    seed({ plan: 'profesional' });
    const r = await registrar();
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'capacidad_no_incluida');
    assert.equal(db._list(`${N}/citas`).length, 0);
  });

  test('barbero de otro negocio o desactivado: 403', async () => {
    assert.equal((await registrar({}, { ...BARBER, negocioId: 'otro' })).status, 403);
    db._set(`${N}/profesionales/p1`, { ...db._get(`${N}/profesionales/p1`), active: false });
    assert.equal((await registrar({}, BARBER)).status, 403);
    assert.equal((await registrar({}, { verified: false })).status, 401);
  });
});

describe('registrar: precio y servicios (calculados en el servidor)', () => {
  beforeEach(() => seed());

  test('precio variable: exige el precio final y respeta el mínimo "Desde"', async () => {
    const sin = await registrar({ services: [{ serviceId: 'color' }] });
    assert.equal(sin.status, 400);
    assert.equal(sin.body.code, 'PRICE_REQUIRED');
    const bajo = await registrar({ services: [{ serviceId: 'color', price: 80 }] });
    assert.equal(bajo.body.code, 'PRICE_BELOW_MIN');
    assert.equal(bajo.body.minPrice, 100);
    const ok = await registrar({ services: [{ serviceId: 'color', price: 180 }] });
    assert.equal(ok.status, 201);
    const d = cita(ok.body.registro.id);
    assert.equal(d.price, 180);
    assert.equal(d.commissionSnapshot.amount, 90);
  });

  test('varios servicios: suma y comisión por servicio', async () => {
    const r = await registrar({ services: [{ serviceId: 'corte' }, { serviceId: 'barba' }] });
    const d = cita(r.body.registro.id);
    assert.equal(d.price, 80);
    assert.equal(d.serviceName, 'Corte + Barba');
    assert.equal(d.commissionSnapshot.amount, 30); // 40% de 50 + 10 fijo
    assert.deepEqual(d.commissionSnapshot.breakdown.map((b) => [b.serviceId, b.type, b.value, b.amount]), [['corte', '%', 40, 20], ['barba', 'Bs', 10, 10]]);
  });

  test('servicio que el profesional no hace, inexistente o repetido: 400', async () => {
    assert.equal((await registrar({ services: [{ serviceId: 'tinte' }] })).body.code, 'SERVICE_NOT_ASSIGNED');
    assert.equal((await registrar({ services: [{ serviceId: 'nada' }] })).body.code, 'SERVICE_NOT_FOUND');
    assert.equal((await registrar({ services: [{ serviceId: 'corte' }, { serviceId: 'corte' }] })).body.code, 'SERVICE_REPEATED');
    assert.equal((await registrar({ services: [] })).body.code, 'SERVICES_REQUIRED');
  });

  test('método de pago: solo los del negocio (sin importar mayúsculas)', async () => {
    assert.equal(cita((await registrar({ paymentMethod: 'qr' })).body.registro.id).paymentMethod, 'QR');
    assert.equal((await registrar({ paymentMethod: 'Bitcoin' })).body.code, 'PAYMENT_METHOD_INVALID');
    assert.equal((await registrar({ paymentMethod: 'Pendiente' })).body.code, 'PAYMENT_METHOD_INVALID');
  });
});

describe('registrar: sucursal', () => {
  test('profesional sin sucursal y negocio con varias: 400 BRANCH_REQUIRED y no se guarda nada', async () => {
    seed({ sucursales: ['Central', 'Norte'] });
    db._set(`${N}/profesionales/p1`, { ...db._get(`${N}/profesionales/p1`), branch: '' });
    const r = await registrar();
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'BRANCH_REQUIRED');
    assert.match(r.body.error, /sucursal/);
    assert.equal(db._list(`${N}/citas`).length, 0);
  });

  test('profesional sin sucursal y negocio con una sola: usa esa', async () => {
    seed({ sucursales: ['Única'] });
    db._set(`${N}/profesionales/p1`, { ...db._get(`${N}/profesionales/p1`), branch: '' });
    assert.equal(cita((await registrar()).body.registro.id).branch, 'Única');
  });
});

describe('registrar: reintentos y posibles duplicados', () => {
  beforeEach(() => seed());

  test('el mismo requestId no duplica: devuelve el mismo registro y no vuelve a avisar', async () => {
    const requestId = randomUUID();
    const a = await registrar({ requestId });
    const b = await registrar({ requestId });
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(b.body.replay, true);
    assert.equal(b.body.registro.id, a.body.registro.id);
    assert.equal(db._list(`${N}/citas`).length, 1);
    assert.equal(pushes.length, 2, 'solo los avisos del primero (2 admins)');
  });

  test('requestId inválido o usado por otra persona', async () => {
    assert.equal((await registrar({ requestId: 'abc' })).body.code, 'REQUEST_ID_REQUIRED');
    const requestId = randomUUID();
    await registrar({ requestId }, BARBER);
    const otro = await registrar({ requestId }, BARBER2);
    assert.equal(otro.status, 409);
    assert.equal(otro.body.code, 'REQUEST_ID_CONFLICT');
  });

  test('mismo profesional y servicio en menos de 3 min: 409 POSSIBLE_DUPLICATE; con confirmDuplicate se guarda', async () => {
    await registrar();
    const dup = await registrar();
    assert.equal(dup.status, 409);
    assert.equal(dup.body.code, 'POSSIBLE_DUPLICATE');
    assert.ok(dup.body.duplicateOf.id);
    const ok = await registrar({ confirmDuplicate: true });
    assert.equal(ok.status, 201);
    assert.equal(cita(ok.body.registro.id).duplicateConfirmed, true);
    assert.equal(db._list(`${N}/citas`).length, 2);
  });

  test('no es posible duplicado: otro servicio, otro profesional, anulado o hace más de 3 min', async () => {
    const first = await registrar();
    assert.equal((await registrar({ services: [{ serviceId: 'barba' }] })).status, 201);
    assert.equal((await registrar({}, BARBER2)).status, 201);
    const id = first.body.registro.id;
    db._set(`${N}/citas/${id}`, { ...cita(id), createdAt: new Date(Date.now() - DUPLICATE_WINDOW_MS - 1000).toISOString() });
    assert.equal((await registrar()).status, 201);
  });
});

describe('avisos push', () => {
  beforeEach(() => seed());
  const destinos = () => pushes.map((p) => p.oneSignalId).sort();

  test('registra el barbero: llegan los admins, él no', async () => {
    await registrar({}, BARBER);
    assert.deepEqual(destinos(), ['os-admin', 'os-admin2']);
    assert.match(pushes[0].mensaje.cuerpo, /Matías registró Corte · Bs 50/);
  });

  test('registra el admin: llega solo al profesional (ni el admin ni otros admins)', async () => {
    await registrar({ professionalId: 'p1' }, ADMIN);
    assert.deepEqual(destinos(), ['os-p1']);
    assert.match(pushes[0].mensaje.cuerpo, /a tu nombre/);
  });

  test('si el push falla, el registro se guarda igual', async () => {
    pushFalla = true;
    const r = await registrar();
    assert.equal(r.status, 201);
    assert.ok(cita(r.body.registro.id));
  });
});

// ─────────────────────────── Corregir / anular ───────────────────────────

describe('corregir', () => {
  beforeEach(() => seed());
  const corregir = (id, body, actor = BARBER) => call('POST', `/servicios-registrados/${id}/correct`, body, actor);

  test('barbero corrige el suyo de hoy: guarda antes/después, quién, cuándo y motivo', async () => {
    const { id } = (await registrar()).body.registro;
    const r = await corregir(id, { reason: 'Era corte y barba', services: [{ serviceId: 'corte' }, { serviceId: 'barba' }], paymentMethod: 'QR' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = cita(id);
    assert.equal(d.price, 80);
    assert.equal(d.paymentMethod, 'QR');
    assert.equal(d.commissionSnapshot.amount, 30);
    assert.equal(d.correctionsCount, 1);
    const [c] = db._list(`${N}/citas/${id}/correcciones`);
    assert.equal(c.type, 'correct');
    assert.equal(c.reason, 'Era corte y barba');
    assert.deepEqual(c.by, { uid: 'p1', rol: 'barber' });
    assert.ok(c.at);
    assert.equal(c.before.price, 50);
    assert.equal(c.after.price, 80);
    assert.deepEqual(c.changes.map((x) => x.field).sort(), ['commissionAmount', 'paymentMethod', 'price', 'services']);
  });

  test('la tasa de comisión queda congelada al corregir el precio', async () => {
    const { id } = (await registrar({ services: [{ serviceId: 'color', price: 100 }] })).body.registro;
    // El dueño cambia la comisión del profesional después de registrar.
    const pro = db._get(`${N}/profesionales/p1`);
    db._set(`${N}/profesionales/p1`, { ...pro, services: pro.services.map((s) => (s.serviceId === 'color' ? { ...s, value: 10 } : s)) });
    await corregir(id, { reason: 'Precio final mal escrito', services: [{ serviceId: 'color', price: 200 }] });
    assert.equal(cita(id).commissionSnapshot.amount, 100, 'sigue el 50% pactado al registrar');
  });

  test('barbero: no el de otro, no de otro día, no con comisión pagada, no con caja cerrada, no cambia el profesional', async () => {
    const { id } = (await registrar({}, BARBER2)).body.registro;
    assert.equal((await corregir(id, { reason: 'motivo largo', paymentMethod: 'QR' }, BARBER)).body.code, 'NOT_OWNER');
    const mio = (await registrar({}, BARBER)).body.registro.id;
    db._set(`${N}/citas/${mio}`, { ...cita(mio), date: ayer() });
    assert.equal((await corregir(mio, { reason: 'motivo largo', paymentMethod: 'QR' })).body.code, 'ONLY_SAME_DAY');
    db._set(`${N}/citas/${mio}`, { ...cita(mio), date: hoy(), commissionPaid: true });
    assert.equal((await corregir(mio, { reason: 'motivo largo', paymentMethod: 'QR' })).body.code, 'COMMISSION_PAID');
    db._set(`${N}/citas/${mio}`, { ...cita(mio), commissionPaid: false, cashSessionId: 'caja1' });
    assert.equal((await corregir(mio, { reason: 'motivo largo', paymentMethod: 'QR' })).body.code, 'CASH_CLOSED');
    db._set(`${N}/citas/${mio}`, { ...cita(mio), cashSessionId: null });
    assert.equal((await corregir(mio, { reason: 'motivo largo', professionalId: 'p2' })).body.code, 'NOT_ALLOWED');
  });

  test('motivo obligatorio y sin cambios no se guarda', async () => {
    const { id } = (await registrar()).body.registro;
    assert.equal((await corregir(id, { paymentMethod: 'QR' })).body.code, 'REASON_REQUIRED');
    assert.equal((await corregir(id, { reason: 'motivo largo', paymentMethod: 'Efectivo' })).body.code, 'NO_CHANGES');
    assert.equal(db._list(`${N}/citas/${id}/correcciones`).length, 0);
  });

  test('admin corrige cualquiera y puede cambiar el profesional (precio y comisión del nuevo)', async () => {
    const { id } = (await registrar({}, BARBER)).body.registro;
    const r = await corregir(id, { reason: 'Lo atendió Sofía', professionalId: 'p2' }, ADMIN);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = cita(id);
    assert.equal(d.professionalId, 'p2');
    assert.equal(d.price, 70);
    assert.equal(d.commissionSnapshot.amount, 28);
  });

  test('admin con caja cerrada: exige el PIN de Analítica validado en el servidor', async () => {
    const { id } = (await registrar()).body.registro;
    const caja = await openCash('negA', { branchName: 'Central', openingFund: 0, actor: ADMIN });
    await closeCash('negA', { branchName: 'Central', sessionId: caja.session.id, countedCash: 50, envelopeAmount: 50, nextFund: 0, actor: ADMIN });
    assert.equal(cita(id).cashSessionId, caja.session.id, 'la caja marcó el registro al cerrar');

    const body = { reason: 'Cobró por QR', paymentMethod: 'QR' };
    assert.equal((await corregir(id, body, ADMIN)).body.code, 'PIN_MISSING');
    await setPin('1234');
    assert.equal((await corregir(id, body, ADMIN)).body.code, 'PIN_REQUIRED');
    assert.equal((await corregir(id, { ...body, pin: '9999' }, ADMIN)).body.code, 'PIN_INVALID');
    const ok = await corregir(id, { ...body, pin: '1234' }, ADMIN);
    assert.equal(ok.status, 200);
    assert.equal(db._list(`${N}/citas/${id}/correcciones`)[0].pinVerified, true);
  });

  test('admin con comisión pagada: también exige PIN', async () => {
    await setPin('1234');
    const { id } = (await registrar()).body.registro;
    db._set(`${N}/citas/${id}`, { ...cita(id), commissionPaid: true });
    assert.equal((await corregir(id, { reason: 'motivo largo', paymentMethod: 'QR' }, ADMIN)).body.code, 'PIN_REQUIRED');
    assert.equal((await corregir(id, { reason: 'motivo largo', paymentMethod: 'QR', pin: '1234' }, ADMIN)).status, 200);
  });

  test('una cita normal (sin origin registro) no se toca por aquí', async () => {
    db._set(`${N}/citas/normal`, { status: 'completed', date: hoy(), professionalId: 'p1', price: 50 });
    assert.equal((await corregir('normal', { reason: 'motivo largo', paymentMethod: 'QR' }, ADMIN)).status, 404);
    assert.equal((await call('POST', '/servicios-registrados/normal/void', { reason: 'motivo largo' }, ADMIN)).status, 404);
  });
});

describe('anular', () => {
  beforeEach(() => seed());
  const anular = (id, body, actor = BARBER) => call('POST', `/servicios-registrados/${id}/void`, body, actor);

  test('anula sin borrar: status cancelled, quién, cuándo, motivo e historial', async () => {
    const { id } = (await registrar()).body.registro;
    const r = await anular(id, { reason: 'Me equivoqué' });
    assert.equal(r.status, 200);
    const d = cita(id);
    assert.ok(d, 'el documento sigue existiendo');
    assert.equal(d.status, 'cancelled');
    assert.ok(d.voidedAt);
    assert.deepEqual(d.voidedBy, { uid: 'p1', rol: 'barber' });
    assert.equal(d.voidReason, 'Me equivoqué');
    const [c] = db._list(`${N}/citas/${id}/correcciones`);
    assert.equal(c.type, 'void');
    assert.equal((await anular(id, { reason: 'Otra vez' })).body.code, 'ALREADY_VOIDED');
    assert.equal((await anular(id, {})).body.code, 'REASON_REQUIRED');
  });

  test('anulado no cuenta en analítica', async () => {
    const a = (await registrar()).body.registro.id;
    await registrar({ services: [{ serviceId: 'barba' }] });
    await anular(a, { reason: 'Me equivoqué' });
    const s = await getFinanceSummary('negA', { startDate: hoy(), endDate: hoy() });
    assert.equal(s.ingresosBrutos, 30);
    assert.equal(s.citasCount, 1);
  });

  test('con caja cerrada el admin necesita PIN; el barbero no puede', async () => {
    await setPin('1234');
    const { id } = (await registrar()).body.registro;
    db._set(`${N}/citas/${id}`, { ...cita(id), cashSessionId: 'caja1' });
    assert.equal((await anular(id, { reason: 'motivo largo' })).body.code, 'CASH_CLOSED');
    assert.equal((await anular(id, { reason: 'motivo largo' }, ADMIN)).body.code, 'PIN_REQUIRED');
    assert.equal((await anular(id, { reason: 'motivo largo', pin: '1234' }, ADMIN)).status, 200);
  });
});

describe('listas', () => {
  beforeEach(() => seed());

  test('barbero ve solo los suyos; admin filtra por profesional; incluye anulados; historial', async () => {
    const a = (await registrar({}, BARBER)).body.registro.id;
    await registrar({}, BARBER2);
    db._set(`${N}/citas/normal`, { status: 'completed', date: hoy(), professionalId: 'p1', price: 50 });
    await call('POST', `/servicios-registrados/${a}/void`, { reason: 'Me equivoqué' }, BARBER);

    const mios = await call('GET', '/servicios-registrados', {}, BARBER, { from: hoy(), to: hoy(), professionalId: 'p2' });
    assert.deepEqual(mios.body.items.map((x) => x.professionalId), ['p1']);
    assert.equal(mios.body.items[0].status, 'cancelled');
    const todos = await call('GET', '/servicios-registrados', {}, ADMIN, { from: hoy(), to: hoy() });
    assert.equal(todos.body.items.length, 2, 'la cita normal no aparece');
    const deP2 = await call('GET', '/servicios-registrados', {}, ADMIN, { from: hoy(), to: hoy(), professionalId: 'p2' });
    assert.deepEqual(deP2.body.items.map((x) => x.professionalId), ['p2']);

    const hist = await call('GET', `/servicios-registrados/${a}/correcciones`, {}, BARBER);
    assert.equal(hist.body.items.length, 1);
    assert.equal((await call('GET', `/servicios-registrados/${a}/correcciones`, {}, BARBER2)).status, 404);
    assert.equal((await call('GET', '/servicios-registrados', {}, ADMIN, { from: '2026-01-01', to: '2026-12-31' })).body.code, 'RANGE_TOO_LONG');
  });
});

// ─────────────────────── Lo que ya existía no cambia ───────────────────────

describe('comisión: snapshot solo si existe', () => {
  const barber = { id: 'p1', services: [{ serviceId: 'corte', commissionEnabled: true, type: '%', value: 40 }] };
  const sinSnapshot = { services: [{ serviceId: 'corte', serviceName: 'Corte', price: 50 }] };

  test('cita sin snapshot: se calcula igual que antes (front y backend)', () => {
    for (const m of [{ calculateCommissionForCita }, front]) {
      const r = m.calculateCommissionForCita(sinSnapshot, barber);
      assert.equal(r.totalAmount, 20);
      assert.equal(r.allConfigured, true);
      assert.equal(r.frozen, undefined);
      assert.equal(r.breakdown[0].type, '%');
    }
    // Una cita con el campo viejo `commission` (BarberApp) sigue ignorándolo.
    assert.equal(calculateCommissionForCita({ ...sinSnapshot, commission: 999 }, barber).totalAmount, 20);
  });

  test('cita con snapshot: usa el snapshot aunque cambie la configuración (front y backend iguales)', () => {
    const conSnapshot = { ...sinSnapshot, commissionSnapshot: { amount: 15, breakdown: [{ serviceId: 'corte', serviceName: 'Corte', price: 50, amount: 15, isConfigured: true, type: '%', value: 30 }] } };
    const b = calculateCommissionForCita(conSnapshot, barber);
    const f = front.calculateCommissionForCita(conSnapshot, barber);
    assert.equal(b.totalAmount, 15);
    assert.equal(b.frozen, true);
    assert.deepEqual(f, b);
    // Snapshot inválido: se ignora y se calcula como siempre.
    assert.equal(calculateCommissionForCita({ ...sinSnapshot, commissionSnapshot: { amount: 'x', breakdown: [] } }, barber).totalAmount, 20);
    assert.equal(calculateCommissionForCita({ ...sinSnapshot, commissionSnapshot: { amount: 5 } }, barber).totalAmount, 20);
  });
});

describe('se cuenta una sola vez en analítica, comisiones y caja', () => {
  beforeEach(() => seed());

  test('analítica y comisiones por profesional', async () => {
    await registrar(); // corte 50, comisión 20
    db._set(`${N}/citas/normal`, { status: 'completed', date: hoy(), professionalId: 'p1', barberId: 'p1', services: [{ serviceId: 'barba', serviceName: 'Barba', price: 30 }], price: 30, branch: 'Central', paidAt: new Date().toISOString() });
    const s = await getFinanceSummary('negA', { startDate: hoy(), endDate: hoy() });
    assert.equal(s.ingresosBrutos, 80);
    assert.equal(s.comisionGenerada, 30);
    assert.equal(s.citasCount, 2);
    const p1 = (await getComisionesPorProfesional('negA', { startDate: hoy(), endDate: hoy() })).find((x) => x.barberId === 'p1');
    assert.equal(p1.citasAtendidas, 2);
    assert.equal(p1.comisionPendiente, 30);
  });

  test('caja abierta: el registro entra una vez como cobro', async () => {
    await openCash('negA', { branchName: 'Central', openingFund: 100, actor: ADMIN });
    await registrar();
    const c = await getCurrentCash('negA', { branchName: 'Central' });
    const cobros = c.cobros || c.summary?.cobros || [];
    assert.equal(cobros.filter((x) => x.kind === 'cita').length, 1);
    assert.equal(c.summary.expectedCash, 150);
  });

  test('el pago de comisiones usa el snapshot y marca el registro como pagado', async () => {
    const { id } = (await registrar()).body.registro;
    const pago = await registerCommissionPayment('negA', { barberId: 'p1', startDate: hoy(), endDate: hoy(), method: 'QR', actor: ADMIN });
    assert.equal(pago.monto, 20);
    assert.equal(cita(id).commissionPaid, true);
  });
});

describe('los registros no ocupan horario; las citas normales sí (igual que antes)', () => {
  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const profesional = { id: 'p1', active: true, services: [{ serviceId: 'corte' }], availability: dias.map((day) => ({ day, status: 'Disponible', start: '09:00', end: '12:00' })) };
  const fecha = '2030-01-07';
  const normal = { id: 'n', date: fecha, time: '10:00', duration: 60, status: 'completed', professionalId: 'p1' };
  const registro = { ...normal, id: 'r', origin: 'registro' };

  test('getAvailableSlots', () => {
    const libres = (citas) => getAvailableSlots({ fecha, serviceDuration: 30, profesional, citasDelNegocio: citas, bloqueos: [] });
    const base = libres([]);
    assert.ok(base.includes('10:00'), 'precondición: el día tiene horario');
    assert.deepEqual(libres([registro]), base);
    assert.ok(!libres([normal]).includes('10:00'));
  });

  test('isProfessionalFreeAt (Pendientes)', () => {
    const libre = (citas) => isProfessionalFreeAt({ professional: profesional, fecha, time: '10:00', duration: 30, citas, bloqueos: [] });
    assert.equal(libre([]), true, 'precondición');
    assert.equal(libre([registro]), true);
    assert.equal(libre([normal]), false);
  });

  test('listBusyAppointments (link público)', async () => {
    seed();
    db._set(`${N}/citas/n`, { ...normal, date: fecha });
    db._set(`${N}/citas/r`, { ...registro, date: fecha });
    const r = await listBusyAppointments('negA', fecha);
    assert.equal(r.citas.length, 1);
  });
});

// ─────────────────────────── Otra fecha (solo admin) ───────────────────────────

describe('otra fecha', () => {
  beforeEach(() => seed());
  const hace = (n) => shiftDay(hoy(), -n);
  const corregir = (id, body, actor = ADMIN) => call('POST', `/servicios-registrados/${id}/correct`, body, actor);

  test('el barbero siempre registra "ahora": la fecha que mande se ignora', async () => {
    const r = await registrar({ date: hace(2) }, BARBER);
    const d = cita(r.body.registro.id);
    assert.equal(d.date, hoy());
    assert.equal(d.backdated, undefined);
    assert.equal(d.paidAt, d.createdAt);
  });

  test('admin: solo hoy o hasta 7 días atrás, nunca futuro (validado en el servidor)', async () => {
    assert.equal((await registrar({ professionalId: 'p1', date: shiftDay(hoy(), 1) }, ADMIN)).body.code, 'DATE_IN_FUTURE');
    assert.equal((await registrar({ professionalId: 'p1', date: hace(MAX_BACKDATE_DAYS + 1) }, ADMIN)).body.code, 'DATE_TOO_OLD');
    assert.equal((await registrar({ professionalId: 'p1', date: '2026-02-31' }, ADMIN)).body.code, 'DATE_INVALID');
    assert.equal((await registrar({ professionalId: 'p1', date: 'ayer' }, ADMIN)).body.code, 'DATE_INVALID');
    assert.equal((await registrar({ professionalId: 'p1', date: hace(MAX_BACKDATE_DAYS) }, ADMIN)).status, 201);
    const hoyMismo = cita((await registrar({ professionalId: 'p1', date: hoy(), services: [{ serviceId: 'barba' }] }, ADMIN)).body.registro.id);
    assert.equal(hoyMismo.backdated, undefined, 'hoy = ahora, no se marca como otra fecha');
  });

  test('se guarda con date del día, 12:00, paidAt = ese mediodía y backdated', async () => {
    const r = await registrar({ professionalId: 'p1', date: hace(2) }, ADMIN);
    const d = cita(r.body.registro.id);
    assert.equal(d.date, hace(2));
    assert.equal(d.time, '12:00');
    assert.equal(d.paidAt, new Date(noonMillis(hace(2))).toISOString());
    assert.equal(localDateKey(Date.parse(d.paidAt)), hace(2));
    assert.ok(Date.parse(d.createdAt) > Date.parse(d.paidAt));
    assert.equal(d.backdated, true);
    assert.equal(d.cashPlacement, CASH_PLACEMENT.NONE, 'el negocio nunca usó la caja');
  });

  test('el aviso dice la fecha', async () => {
    await registrar({ professionalId: 'p1', date: hace(2) }, ADMIN);
    const dd = `${hace(2).slice(8, 10)}/${hace(2).slice(5, 7)}`;
    assert.match(pushes[0].mensaje.cuerpo, new RegExp(`Corte del ${dd} a tu nombre`));
  });

  test('caja de ese día todavía abierta: entra en ella', async () => {
    // Caja abierta desde hace 3 días (su ventana empieza ese día).
    db._set(`${N}/cajaEstado/s0`, { openSessionId: 'caja1' });
    db._set(`${N}/cajas/caja1`, { status: 'open', scopeKey: 's0', scopeName: 'Central', openingFund: 0, openedAt: new Date(noonMillis(hace(3))).toISOString(), windowStart: new Date(noonMillis(hace(3)) - 12 * 3600000).toISOString() });
    const r = await registrar({ professionalId: 'p1', date: hace(2) }, ADMIN);
    assert.equal(r.body.registro.cashPlacement, CASH_PLACEMENT.OPEN);
    const c = await getCurrentCash('negA', { branchName: 'Central' });
    assert.equal(c.cobros.filter((x) => x.kind === 'cita').length, 1);
  });

  test('caja de ese día ya cerrada: queda fuera de caja, no entra en la caja de hoy y corregirlo pide PIN', async () => {
    // Se cerró ayer; hoy hay otra abierta (su ventana empieza en ese cierre).
    const cierre = new Date(noonMillis(hace(1))).toISOString();
    db._set(`${N}/cajaEstado/s0`, { openSessionId: 'caja2', lastClosedAt: cierre });
    db._set(`${N}/cajas/caja2`, { status: 'open', scopeKey: 's0', scopeName: 'Central', openingFund: 0, openedAt: new Date().toISOString(), windowStart: cierre });
    const r = await registrar({ professionalId: 'p1', date: hace(2) }, ADMIN);
    assert.equal(r.body.registro.cashPlacement, CASH_PLACEMENT.OUTSIDE);
    const c = await getCurrentCash('negA', { branchName: 'Central' });
    assert.equal(c.cobros.filter((x) => x.kind === 'cita').length, 0);
    // Sí cuenta en la analítica de su día.
    assert.equal((await getFinanceSummary('negA', { startDate: hace(2), endDate: hace(2) })).ingresosBrutos, 50);

    await setPin('1234');
    const id = r.body.registro.id;
    assert.equal((await corregir(id, { reason: 'Era por QR', paymentMethod: 'QR' })).body.code, 'PIN_REQUIRED');
    assert.equal((await corregir(id, { reason: 'Era por QR', paymentMethod: 'QR', pin: '1234' })).status, 200);
  });

  test('caja cerrada antes de ese día y sin abrir todavía: irá en la próxima caja', async () => {
    db._set(`${N}/cajaEstado/s0`, { openSessionId: null, lastClosedAt: new Date(noonMillis(hace(4))).toISOString() });
    const r = await registrar({ professionalId: 'p1', date: hace(2) }, ADMIN);
    assert.equal(r.body.registro.cashPlacement, CASH_PLACEMENT.NEXT);
  });
});
