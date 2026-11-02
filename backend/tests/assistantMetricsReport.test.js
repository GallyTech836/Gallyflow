// Informe de Super Admin "Asistente WhatsApp / Consumo": separación de
// pruebas y consumo real, reservas por WhatsApp, aislamiento entre negocios
// y permisos (solo Super Admin).

import { test, describe, beforeEach, mock } from 'node:test';
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

const R = await import('../services/assistantMetrics/assistantMetricsReport.js');
await import('../routes/superadmin.routes.js');

const SUPER = { verified: true, email: 'torricogali@gmail.com' };
const OTRO = { verified: true, email: 'dueno@negocio.com' };
const HOY = '2026-11-20';

function cita(id, data, negocio = 'negA') {
  db._set(`negocios/${negocio}/citas/${id}`, { status: 'confirmed', bookedBy: 'client', ...data });
}

beforeEach(() => {
  db._clear();
  db._set('negocios/negA', { assistantMetrics: { startDate: '2026-11-01', enabled: true } });
  // Octubre: solo pruebas de desarrollo.
  db._set('negocios/negA/uso/2026-10', { whatsappMensajes: 500 });
  // Noviembre: el contador mensual tiene todo el mes; el desglose diario existe desde el despliegue (día 02).
  db._set('negocios/negA/uso/2026-11', {
    whatsappMensajes: 120,
    asistente: {
      entrantes: 110,
      dias: {
        '02': { enviados: 40, entrantes: 38, conversaciones: { reserva: 5, consulta: 3, abandonada: 2 } },
        '10': { enviados: 70, entrantes: 72, conversaciones: { reserva: 7, humano: 1, reprogramacion: 1, consulta: 2 } },
      },
    },
  });
});

describe('Separación de pruebas y consumo real', () => {
  test('mes anterior al inicio: todo es prueba, nada entra en las métricas', async () => {
    const r = await R.buildMonthReport('negA', '2026-10', { hoy: HOY });
    assert.equal(r.alcance, 'ninguno');
    assert.equal(r.mensajes.enviados, 0);
    assert.equal(r.mensajes.enviadosPruebas, 500);
    assert.equal(r.promedioEnviadosPorReserva, null);
    assert.ok(r.diario.every((d) => d.real === false));
  });

  test('mes completo desde el inicio: usa el contador mensual completo', async () => {
    cita('c1', { date: '2026-11-03', bookedBy: 'assistant', createdAt: '2026-11-02T15:00:00Z' });
    cita('c2', { date: '2026-11-04', bookedBy: 'client' });
    const r = await R.buildMonthReport('negA', '2026-11', { hoy: HOY });
    assert.equal(r.alcance, 'completo');
    assert.equal(r.estado, 'medicion');
    assert.equal(r.mensajes.enviados, 120);
    assert.equal(r.mensajes.entrantes, 110);
    assert.equal(r.mensajes.interacciones, 230);
    assert.equal(r.mensajes.entrantesDesde, '2026-11-02');
    assert.equal(r.conversaciones.total, 21);
    assert.equal(r.conversaciones.reserva, 12);
    assert.equal(r.conversaciones.sinReserva, 9);
    assert.equal(r.reservas.asistente, 1);
    assert.equal(r.reservas.total, 2);
    assert.equal(r.reservas.porcentaje, 50);
    assert.equal(r.promedioEnviadosPorReserva, 120);
    assert.equal(r.diasMedidos, 20);
    assert.equal(r.promedioDiarioEnviados, 6);
  });

  test('inicio a mitad de mes: solo cuenta desde esa fecha (desglose diario)', async () => {
    db._set('negocios/negA', { assistantMetrics: { startDate: '2026-11-10', enabled: true } });
    const r = await R.buildMonthReport('negA', '2026-11', { hoy: HOY });
    assert.equal(r.alcance, 'parcial');
    assert.equal(r.mensajes.enviados, 70);
    assert.equal(r.mensajes.enviadosPruebas, 50);
    assert.equal(r.mensajes.entrantes, 72);
    assert.equal(r.conversaciones.total, 11);
  });

  test('sin fecha de inicio: el negocio está en pruebas', async () => {
    db._set('negocios/negA', {});
    const r = await R.buildMonthReport('negA', '2026-11', { hoy: HOY });
    assert.equal(r.estado, 'pruebas');
    assert.equal(r.alcance, 'ninguno');
    assert.equal(r.mensajes.enviados, 0);
  });

  test('historial: meses en orden y con su alcance', async () => {
    const h = await R.buildHistory('negA', { hoy: HOY });
    assert.deepEqual(h.meses.map((m) => [m.mes, m.alcance, m.enviados, m.enviadosPruebas]), [
      ['2026-11', 'completo', 120, 0],
      ['2026-10', 'ninguno', 0, 500],
    ]);
  });
});

describe('Reservas por WhatsApp', () => {
  test('cada cita del asistente cuenta una vez; canceladas, registros y pruebas no', async () => {
    cita('a1', { date: '2026-11-05', bookedBy: 'assistant', createdAt: '2026-11-04T12:00:00Z' });
    cita('a2', { date: '2026-11-06', bookedBy: 'assistant', createdAt: '2026-11-05T12:00:00Z', status: 'cancelled' });
    cita('a3', { date: '2026-11-07', bookedBy: 'assistant', createdAt: '2026-10-28T12:00:00Z' }); // prueba de octubre
    cita('r1', { date: '2026-11-07', bookedBy: 'admin', origin: 'registro' });
    cita('c1', { date: '2026-11-08', bookedBy: 'client' });
    const r = await R.buildMonthReport('negA', '2026-11', { hoy: HOY });
    assert.equal(r.reservas.asistente, 1);
    assert.equal(r.reservas.total, 3, 'a1 + a3 + c1 (a3 es real para el total del negocio)');
  });
});

describe('Aislamiento entre negocios', () => {
  test('los datos de otro negocio no aparecen', async () => {
    db._set('negocios/negB', { assistantMetrics: { startDate: '2026-11-01' } });
    db._set('negocios/negB/uso/2026-11', { whatsappMensajes: 999, asistente: { dias: { '03': { entrantes: 999 } } } });
    cita('b1', { date: '2026-11-05', bookedBy: 'assistant', createdAt: '2026-11-04T12:00:00Z' }, 'negB');
    const a = await R.buildMonthReport('negA', '2026-11', { hoy: HOY });
    assert.equal(a.mensajes.enviados, 120);
    assert.equal(a.mensajes.entrantes, 110);
    assert.equal(a.reservas.asistente, 0);
    const b = await R.buildMonthReport('negB', '2026-11', { hoy: HOY });
    assert.equal(b.mensajes.enviados, 999);
    assert.equal(b.reservas.asistente, 1);
  });
});

describe('Rutas de Super Admin', () => {
  test('solo Super Admin puede ver y configurar', async () => {
    for (const [method, path] of [
      ['GET', '/negocios/negA/asistente-metricas'],
      ['GET', '/negocios/negA/asistente-metricas/historial'],
      ['PUT', '/negocios/negA/asistente-metricas/config'],
    ]) {
      const sinToken = await runRoute(router, method, path, { query: { mes: '2026-11' }, body: { enabled: false } });
      assert.equal(sinToken.status, 403, `${method} ${path} sin token`);
      const otro = await runRoute(router, method, path, { actor: OTRO, query: { mes: '2026-11' }, body: { enabled: false } });
      assert.equal(otro.status, 403, `${method} ${path} otro usuario`);
    }
    assert.equal(db._get('negocios/negA').assistantMetrics.enabled, true, 'no se cambió nada');
  });

  test('Super Admin lee el mes y cambia la fecha de inicio sin tocar los datos', async () => {
    const r = await runRoute(router, 'GET', '/negocios/negA/asistente-metricas', { actor: SUPER, query: { mes: '2026-11' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.negocioId, 'negA');

    const antesUso = JSON.stringify(db._get('negocios/negA/uso/2026-11'));
    const c = await runRoute(router, 'PUT', '/negocios/negA/asistente-metricas/config', { actor: SUPER, body: { startDate: '2026-11-15', enabled: false } });
    assert.equal(c.status, 200);
    assert.equal(c.body.estado, 'pausado');
    const guardado = db._get('negocios/negA').assistantMetrics;
    assert.equal(guardado.startDate, '2026-11-15');
    assert.equal(guardado.enabled, false);
    assert.equal(guardado.updatedBy, SUPER.email);
    assert.equal(JSON.stringify(db._get('negocios/negA/uso/2026-11')), antesUso);
  });

  test('valida fecha y mes', async () => {
    const f = await runRoute(router, 'PUT', '/negocios/negA/asistente-metricas/config', { actor: SUPER, body: { startDate: '2026-13-01' } });
    assert.equal(f.status, 400);
    const m = await runRoute(router, 'GET', '/negocios/negA/asistente-metricas', { actor: SUPER, query: { mes: 'noviembre' } });
    assert.equal(m.status, 400);
    const n = await runRoute(router, 'GET', '/negocios/noexiste/asistente-metricas', { actor: SUPER, query: { mes: '2026-11' } });
    assert.equal(n.status, 404);
  });
});
