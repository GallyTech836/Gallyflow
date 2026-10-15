// Pruebas del punto 3: clientes que llegan desde un anuncio de Facebook /
// Instagram (Click to WhatsApp) y botones «Servicios y precios» /
// «Ubicación y horarios». Firestore en memoria, sin red.
//
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';

const db = createFakeDb();

mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('../services/notificationService.js', {
  namedExports: { sendNotification: async () => ({}), sendDirectNotification: async () => ({}), getRecipients: async () => [] },
});
mock.module('../services/capabilities/capabilityService.js', {
  namedExports: {
    getNegocioAccess: async () => ({ capabilities: { asistenteWhatsapp: { enabled: true } } }),
    checkCapability: async () => ({ allowed: true }),
    DENY_MESSAGES: {},
    invalidateNegocioAccess: () => {},
    incrementUsage: async () => {},
    incrementRejected: async () => {},
    currentPeriod: () => 'test',
    getUsage: async () => ({}),
    requireCapability: () => (req, res, next) => next(),
  },
});

const { assistantEngine } = await import('../services/assistantEngine/engine.js');
const info = await import('../services/assistantEngine/infoNegocio.js');

const N = 'negocios/neg';
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const horario = () => DIAS.map((day, i) => (i < 5
  ? { day, status: 'Disponible', start: '09:00', end: '19:00' }
  : i === 5 ? { day, status: 'Disponible', start: '09:00', end: '14:00' } : { day, status: 'Cerrado', start: '09:00', end: '19:00' }));
const AD = { source_url: 'https://fb.me/xxx', source_type: 'ad', source_id: '123', headline: 'Corte 2x1' };

let seq = 0;
let phone;
function seed({ conCita = false } = {}) {
  db._clear();
  phone = `5917200${String(++seq).padStart(4, '0')}`;
  db._set(N, { slug: 'neg', heroConfig: { businessName: 'Barbería Test' }, businessSettings: { schedule: horario() } });
  db._set(`${N}/servicios/s1`, { name: 'Corte', price: 100, duration: 30, order: 1 });
  db._set(`${N}/servicios/s2`, { name: 'Barba', price: 50, duration: 20, order: 2 });
  db._set(`${N}/sucursales/b1`, { name: 'Centro', address: 'Av. Busch 123', mapsUrl: 'https://maps.app.goo.gl/abc123', active: true });
  const allDay = DIAS.map((day) => ({ day, status: 'Disponible', start: '00:00', end: '23:59' }));
  db._set(`${N}/profesionales/ana`, { name: 'Ana', active: true, branch: 'Centro', availability: allDay, services: [{ serviceId: 's1', customPrice: 150 }, { serviceId: 's2' }] });
  db._set(`${N}/profesionales/beto`, { name: 'Beto', active: true, branch: 'Centro', availability: allDay, services: [{ serviceId: 's1' }] });
  if (conCita) {
    db._set(`${N}/citas/c1`, { date: '2030-01-15', time: '10:00', duration: 30, professionalId: 'beto', barberId: 'beto', status: 'confirmed', clientName: 'Juan', clientPhone: phone, price: 100, serviceName: 'Corte', services: [{ serviceId: 's1', serviceName: 'Corte', price: 100, duration: 30 }] });
  }
}

const say = (message, referral = null) => assistantEngine({ negocioId: 'neg', phone, message, referral });
const botones = (r) => (r.interactive?.action?.buttons || []).map((b) => b.reply.id.replace(/^[a-z_]+\|/, ''));

describe('Mensaje desde un anuncio', () => {
  beforeEach(() => seed());

  test('con referral: saludo + pregunta qué información desea con 3 botones', async () => {
    const r = await say('¡Hola! Quiero más información.', AD);
    assert.match(r.interactive.body.text, /Gracias por escribir a Barbería Test/);
    assert.match(r.interactive.body.text, /¿Qué información te gustaría\?/);
    assert.deepEqual(botones(r), ['info_servicios', 'info_ubicacion', '1']);
    const titulos = r.interactive.action.buttons.map((b) => b.reply.title);
    assert.deepEqual(titulos, ['Servicios y precios', 'Ubicación y horarios', 'Agendar cita']);
  });

  test('sin referral, solo por el texto del anuncio', async () => {
    const r = await say('Hola, me interesa, quiero más info');
    assert.deepEqual(botones(r), ['info_servicios', 'info_ubicacion', '1']);
  });

  test('un "hola" normal sigue mostrando el saludo de siempre', async () => {
    const r = await say('hola');
    assert.deepEqual(botones(r), ['1', '2']);
  });

  test('Servicios y precios: lista con precio por profesional y botones para seguir', async () => {
    await say('Quiero más información', AD);
    const r = await say('welcome|info_servicios');
    assert.match(r.interactive.body.text, /• Corte — Bs 100 – 150 · 30 min/);
    assert.match(r.interactive.body.text, /• Barba — Bs 50 · 20 min/);
    assert.deepEqual(botones(r), ['1', 'info_ubicacion', '2']);
    // "Agendar cita" entra al flujo normal de reserva.
    const agendar = await say('welcome|1');
    assert.equal(agendar.conversation.currentFlow, 'choosing_service');
  });

  test('Ubicación y horarios: dirección, link y horario agrupado', async () => {
    await say('Quiero más información', AD);
    const r = await say('welcome|info_ubicacion');
    const t = r.interactive.body.text;
    assert.match(t, /📍 \*Centro\*/);
    assert.match(t, /Av\. Busch 123/);
    assert.match(t, /Cómo llegar: https:\/\/maps\.app\.goo\.gl\/abc123/);
    assert.match(t, /Lun a Vie: 09:00 – 19:00/);
    assert.match(t, /Sáb: 09:00 – 14:00/);
    assert.match(t, /Dom: cerrado/);
    assert.deepEqual(botones(r), ['1', 'info_servicios', '2']);
  });

  test('preguntas escritas: "cuánto cuesta" y "dónde están"', async () => {
    await say('hola');
    assert.match((await say('¿Cuánto cuesta el corte?')).interactive.body.text, /Nuestros servicios/);
    assert.match((await say('¿dónde están?')).interactive.body.text, /📍 \*Centro\*/);
  });

  test('con referral a mitad de una reserva: empieza de nuevo con el saludo del anuncio', async () => {
    await say('hola');
    await say('1'); // eligiendo servicio
    const r = await say('Quiero más información', AD);
    assert.deepEqual(botones(r), ['info_servicios', 'info_ubicacion', '1']);
    assert.equal(r.conversation.currentFlow, 'welcome');
  });

  test('sin referral a mitad de una reserva: NO corta la reserva', async () => {
    await say('hola');
    await say('1');
    const r = await say('más información');
    assert.notEqual(r.conversation.currentFlow, 'welcome');
  });

  test('cliente con cita próxima: mantiene su saludo de siempre (muestra la cita)', async () => {
    seed({ conCita: true });
    db._set(`${N}/clientes/${phone}`, { name: 'Juan Perez', phone });
    const r = await say('Quiero más información', AD);
    assert.match(r.interactive.body.text, /Tienes una cita/);
  });

  test('modo "hablar con alguien" activo: el bot no responde aunque venga de un anuncio', async () => {
    await say('hola');
    await say('2');
    const r = await say('Quiero más información', AD);
    assert.equal(r.replyText, null);
  });
});

describe('infoNegocio (funciones puras)', () => {
  test('esMensajeDeAnuncio', () => {
    assert.equal(info.esMensajeDeAnuncio('hola', { source_type: 'ad' }), true);
    assert.equal(info.esMensajeDeAnuncio('hola', { ctwa_clid: 'x' }), true);
    for (const t of ['Quiero más información', 'mas info por favor', 'Me interesa', 'Info', 'Vi su anuncio', 'información sobre el corte']) {
      assert.equal(info.esMensajeDeAnuncio(t), true, t);
    }
    for (const t of ['hola', '1', 'Juan Perez', 'quiero agendar', 'reprogramar']) {
      assert.equal(info.esMensajeDeAnuncio(t), false, t);
    }
  });

  test('resumenHorario: sin configurar => null; agrupa días iguales', () => {
    const def = DIAS.map((day) => ({ day, status: 'Disponible', start: '00:00', end: '23:59' }));
    assert.equal(info.resumenHorario(def), null);
    assert.equal(info.resumenHorario(undefined), null);
    assert.equal(info.resumenHorario(horario()), 'Lun a Vie: 09:00 – 19:00\nSáb: 09:00 – 14:00\nDom: cerrado');
  });

  test('textoUbicacion: horario propio de la sucursal y filtro por sucursal del chat', () => {
    const sucursales = [
      { name: 'Centro', address: 'Calle 1', schedule: 'Lun a Sáb 8 a 20' },
      { name: 'Norte', address: 'Calle 2', lat: -17.7, lng: -63.1 },
      { name: 'Cerrada', active: false },
    ];
    const t = info.textoUbicacion({ sucursales, businessSettings: { schedule: horario() } });
    assert.match(t, /Lun a Sáb 8 a 20/);
    assert.match(t, /Norte[\s\S]*google\.com\/maps\/search\/\?api=1&query=-17\.7%2C-63\.1/);
    assert.doesNotMatch(t, /Cerrada/);
    const solo = info.textoUbicacion({ sucursales, branch: 'Norte' });
    assert.doesNotMatch(solo, /Centro/);
    assert.equal(info.textoUbicacion({ sucursales: [], businessSettings: {} }), null);
  });

  test('textoServicios recorta listas largas', () => {
    const muchos = Array.from({ length: 60 }, (_, i) => ({ name: `Servicio número ${i + 1}` }));
    const { completo, corto } = info.textoServicios(muchos, { precioDe: () => 'Bs 100', duracionDe: () => 30, max: 300 });
    assert.ok(corto.length < 340);
    assert.match(corto, /… y \d+ más\./);
    assert.equal(completo.split('\n').length, 60);
  });
});
