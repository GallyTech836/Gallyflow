// «Servicios y precios» paginado de 5 en 5, preguntas escritas sobre
// servicios e ids estables en las listas. Firestore en memoria, sin red.
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
const { invalidateBusinessContext } = await import('../services/appointments/businessContext.js');
const info = await import('../services/assistantEngine/infoNegocio.js');

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const allDay = DIAS.map((day) => ({ day, status: 'Disponible', start: '00:00', end: '23:59' }));

let seq = 0;
let neg;
let phone;
const N = () => `negocios/${neg}`;

// `servicios`: [{ id, name, price?, duration? }]. Un profesional hace todos.
function seed(servicios) {
  db._clear();
  neg = `menu${++seq}`;
  phone = `5917300${String(seq).padStart(4, '0')}`;
  invalidateBusinessContext?.(neg);
  db._set(N(), { slug: neg, heroConfig: { businessName: 'Estudio Test' } });
  servicios.forEach((s, i) => {
    const { id, ...data } = s;
    db._set(`${N()}/servicios/${id}`, { order: i + 1, ...data });
  });
  db._set(`${N()}/profesionales/ana`, {
    name: 'Ana', active: true, availability: allDay, services: servicios.map((s) => ({ serviceId: s.id })),
  });
}

const muchos = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, name: `Servicio ${i + 1}`, price: 10 * (i + 1), duration: 30 }));
const say = (message) => assistantEngine({ negocioId: neg, phone, message });
const filas = (r) => r.interactive?.action?.sections?.[0]?.rows || [];
const ids = (r) => filas(r).map((x) => x.id.replace(/^[a-z_]+\|(?=info_|svc:|\d|mas|agregar|fotos)/, ''));
const botones = (r) => (r.interactive?.action?.buttons || []).map((b) => b.reply.id.replace(/^[a-z_]+\|/, ''));

describe('Servicios y precios: paginado de 5', () => {
  test('3 servicios: solo esos 3, sin «Ver más»', async () => {
    seed(muchos(3));
    await say('hola');
    const r = await say('welcome|info_servicios');
    assert.deepEqual(ids(r), ['info_svc|s1', 'info_svc|s2', 'info_svc|s3', 'info_ubicacion', '2']);
  });

  test('5 servicios exactos: sin «Ver más»', async () => {
    seed(muchos(5));
    await say('hola');
    const r = await say('welcome|info_servicios');
    assert.equal(ids(r).filter((x) => x.startsWith('info_svc|')).length, 5);
    assert.ok(!ids(r).some((x) => x.startsWith('info_mas|')));
  });

  test('12 servicios: 5 + «Ver más», luego 5 + «Ver más», luego los 2 últimos sin «Ver más»', async () => {
    seed(muchos(12));
    await say('hola');
    const p1 = await say('welcome|info_servicios');
    assert.deepEqual(ids(p1).slice(0, 6), ['info_svc|s1', 'info_svc|s2', 'info_svc|s3', 'info_svc|s4', 'info_svc|s5', 'info_mas|1']);
    assert.equal(filas(p1).length, 8); // 5 + ver más + ubicación + hablar (máx. 10)
    const p2 = await say(filas(p1)[5].id);
    assert.deepEqual(ids(p2).slice(0, 6), ['info_svc|s6', 'info_svc|s7', 'info_svc|s8', 'info_svc|s9', 'info_svc|s10', 'info_mas|2']);
    assert.match(p2.interactive.body.text, /página 2 de 3/);
    const p3 = await say(filas(p2)[5].id);
    assert.deepEqual(ids(p3), ['info_svc|s11', 'info_svc|s12', 'info_ubicacion', '2']);
    assert.equal(p3.conversation.currentFlow, 'welcome');
  });

  test('sin precio ni duración: no inventa «Bs 0» ni «30 min»', async () => {
    seed([
      { id: 'a', name: 'Solo nombre' },
      { id: 'b', name: 'Con duración', duration: 45 },
      { id: 'c', name: 'Con precio', price: 80 },
      { id: 'd', name: 'Precio cero', price: 0, duration: 20 },
      { id: 'e', name: 'Variable', price: 100, priceVariable: true, duration: 90 },
    ]);
    await say('hola');
    const rows = filas(await say('welcome|info_servicios'));
    assert.equal(rows[0].description, undefined);
    assert.equal(rows[1].description, '45 min');
    assert.equal(rows[2].description, 'Bs 80');
    assert.equal(rows[3].description, '20 min');
    assert.equal(rows[4].description, 'Desde Bs 100 · 90 min');
  });

  test('nombre largo: título recortado a 24 y nombre completo en la descripción', async () => {
    seed([{ id: 'x', name: 'Alisado brasileño con keratina premium', price: 300, duration: 120 }]);
    await say('hola');
    const [fila] = filas(await say('welcome|info_servicios'));
    assert.ok(fila.title.length <= 24);
    assert.ok(fila.description.length <= 72);
    assert.match(fila.description, /^Alisado brasileño con keratina premium · Bs 300 · 120 min$/);
  });

  test('tocar un servicio entra directo a agendar con ese servicio', async () => {
    seed(muchos(7));
    await say('hola');
    await say('welcome|info_servicios');
    const r = await say('welcome|info_svc|s3');
    assert.notEqual(r.conversation.currentFlow, 'welcome');
    assert.deepEqual((r.conversation.selectedServices || []).map((s) => s.serviceId), ['s3']);
  });

  test('servicio borrado mientras el cliente navega: aviso y página 1, nunca otro servicio', async () => {
    seed(muchos(7));
    await say('hola');
    await say('welcome|info_servicios');
    // Un id que ya no existe (servicio borrado o sin profesional).
    const r = await say('welcome|info_svc|zzz');
    assert.match(r.interactive.body.text, /ya no está disponible/);
    assert.equal(r.conversation.currentFlow, 'welcome');
    assert.equal(r.conversation.selectedServices ?? null, null);
  });

  test('«Ver más» de una página que ya no existe: muestra la última', async () => {
    seed(muchos(6));
    await say('hola');
    const r = await say('welcome|info_mas|9');
    assert.deepEqual(ids(r), ['info_svc|s6', 'info_ubicacion', '2']);
  });

  test('combos: una sola línea corta en el cuerpo', async () => {
    seed(muchos(3));
    db._set(`${N()}/promociones/p1`, { type: 'combo', name: 'Combo A', comboPrice: 25, serviceIds: ['s1', 's2'], active: true });
    invalidateBusinessContext?.(neg);
    await say('hola');
    const r = await say('welcome|info_servicios');
    assert.match(r.interactive.body.text, /🎁 Combos: Combo A \(Bs 25\)\./);
  });
});

describe('Preguntas escritas sobre servicios', () => {
  beforeEach(() => seed([
    { id: 'c1', name: 'Corte clásico', price: 80, duration: 30 },
    { id: 'c2', name: 'Corte premium', price: 120, duration: 45 },
    { id: 'al', name: 'Alisado coreano', price: 100, priceVariable: true, duration: 90 },
    { id: 'tr', name: 'Tratamiento capilar', price: 150, duration: 60 },
    { id: 'un', name: 'Uñas acrílicas', price: 90 },
  ]));

  test('«¿Tienen alisado?»: un resultado con datos y botón para agendar', async () => {
    await say('hola');
    const r = await say('¿Tienen alisado?');
    assert.match(r.interactive.body.text, /Sí, tenemos \*Alisado coreano\*: Desde Bs 100 · 90 min\./);
    assert.deepEqual(botones(r), ['info_svc|al', 'info_servicios', '2']);
    const agendar = await say(r.interactive.action.buttons[0].reply.id);
    assert.deepEqual(agendar.conversation.selectedServices.map((s) => s.serviceId), ['al']);
  });

  test('«¿Cuánto cuesta un corte?»: varias coincidencias en lista', async () => {
    await say('hola');
    const r = await say('¿Cuánto cuesta un corte?');
    assert.equal(r.interactive.type, 'list');
    assert.deepEqual(ids(r), ['info_svc|c1', 'info_svc|c2', 'info_servicios']);
  });

  test('«¿Cuánto dura el tratamiento?»: con tildes y mayúsculas', async () => {
    await say('hola');
    const r = await say('¿CUÁNTO DURA EL TRATAMIENTO?');
    assert.match(r.interactive.body.text, /Tratamiento capilar\*: Bs 150 · 60 min/);
  });

  test('«uñas» no se confunde con el artículo «unas»', async () => {
    await say('hola');
    assert.match((await say('¿hacen uñas?')).interactive.body.text, /Uñas acrílicas\*: Bs 90\./);
  });

  test('«¿Qué servicios ofrecen?»: el menú paginado', async () => {
    await say('hola');
    const r = await say('¿Qué servicios ofrecen?');
    assert.match(r.interactive.body.text, /Aquí tienes nuestros servicios/);
  });

  test('servicio que no existe: lo dice sin inventar datos', async () => {
    await say('hola');
    const r = await say('¿Tienen manicure?');
    assert.match(r.interactive.body.text, /No encontré «manicure»/);
    assert.deepEqual(botones(r), ['info_servicios', '2']);
  });

  test('textos que no son sobre servicios siguen como antes', async () => {
    await say('hola');
    const r = await say('¿Hay alguien?');
    assert.doesNotMatch(r.interactive?.body?.text || r.replyText, /No encontré/);
    const g = await say('gracias');
    assert.doesNotMatch(g.replyText || '', /No encontré/);
  });
});

describe('Lista de reserva con ids estables', () => {
  test('las filas usan el id del servicio y el número escrito sigue funcionando', async () => {
    seed(muchos(3));
    await say('hola');
    const lista = await say('1');
    assert.deepEqual(ids(lista).slice(0, 3), ['svc:s1', 'svc:s2', 'svc:s3']);
    const porToque = await say(filas(lista)[1].id);
    assert.deepEqual(porToque.conversation.selectedServices.map((s) => s.serviceId), ['s2']);

    seed(muchos(3));
    await say('hola');
    await say('1');
    const porNumero = await say('3');
    assert.deepEqual(porNumero.conversation.selectedServices.map((s) => s.serviceId), ['s3']);
  });

  test('id de un servicio que ya no está: no elige otro', async () => {
    seed(muchos(3));
    await say('hola');
    await say('1');
    const r = await say('choosing_service|svc:noexiste');
    assert.equal(r.conversation.currentFlow, 'choosing_service');
    assert.match(r.interactive.body.text, /ya no está disponible/);
  });
});

describe('buscarServicios (función pura)', () => {
  const servicios = [{ id: '1', name: 'Corte' }, { id: '2', name: 'Barba' }];
  test('general / coincidencias / sin resultado / null', () => {
    assert.deepEqual(info.buscarServicios('precios', servicios, { pideLista: true }), { tipo: 'general' });
    assert.equal(info.buscarServicios('cortes', servicios).servicios[0].id, '1');
    assert.equal(info.buscarServicios('¿tienen depilación?', servicios).tipo, 'sin_resultado');
    assert.equal(info.buscarServicios('hola buenas tardes', servicios), null);
    assert.equal(info.buscarServicios('', servicios), null);
  });
});

describe('Fotos y archivos en el motor (un lote = una respuesta)', () => {
  const sayLote = (message, media = null, unsupportedCount = 0) => assistantEngine({ negocioId: neg, phone, message, media, unsupportedCount });
  const foto = (n) => ({ link: `https://api.ycloud.com/m/${n}`, mimeType: 'image/jpeg' });

  test('3 fotos en el inicio: aviso corto con opciones, sin repetir el saludo', async () => {
    seed(muchos(3));
    await say('hola');
    const r = await sayLote('', [foto(1), foto(2), foto(3)]);
    assert.match(r.interactive.body.text, /^Recibí tus 3 fotos 📷/);
    assert.doesNotMatch(r.interactive.body.text, /Soy el asistente/);
    assert.deepEqual(botones(r), ['1', 'info_servicios', '2']);
    assert.equal(r.conversation.currentFlow, 'welcome');
  });

  test('fotos + texto: responde al texto con el aviso delante', async () => {
    seed(muchos(3));
    await say('hola');
    const r = await sayLote('precios', [foto(1), foto(2)]);
    assert.match(r.interactive.body.text, /^Recibí tus 2 fotos 📷\n\n¡Claro!/);
    assert.equal(r.interactive.type, 'list');
  });

  test('audio solo: un aviso de que no puede escucharlo', async () => {
    seed(muchos(3));
    await say('hola');
    const r = await sayLote('', null, 2);
    assert.match(r.interactive.body.text, /^Todavía no puedo escuchar audios ni abrir archivos\. ¿Me escribes tu consulta\?/);
    assert.doesNotMatch(r.interactive.body.text, /🙂/);
    // Una sola pregunta: sin "¿En qué te ayudo?" después del aviso.
    assert.equal(r.interactive.body.text, 'Todavía no puedo escuchar audios ni abrir archivos. ¿Me escribes tu consulta?');
    assert.deepEqual(botones(r), ['1', 'info_servicios', '2']);
  });

  test('personalidad formal: los textos nuevos hablan de «usted» sin mezclar', async () => {
    seed([{ id: 's1', name: 'Corte ', price: 100, duration: 30 }]);
    db._set(N(), { slug: neg, heroConfig: { businessName: 'Estudio Test' }, assistantConfig: { personalidad: { tono: 'formal' } } });
    invalidateBusinessContext?.(neg);
    await say('hola');
    const audio = await sayLote('', null, 1);
    assert.match(audio.interactive.body.text, /^Por el momento no puedo escuchar audios ni abrir archivos\. ¿Podría escribirme su consulta\?/);
    const lista = await say('welcome|info_servicios');
    assert.match(lista.interactive.body.text, /Toque el que le interese para agendarlo\./);
    assert.match(lista.replyText, /Escríbame el nombre del servicio que busca y le paso su precio/);
    const corte = await say('¿tienen corte?');
    // Nombre sin espacio sobrante: la negrita de WhatsApp funciona.
    assert.match(corte.interactive.body.text, /Sí, tenemos \*Corte\*: Bs 100 · 30 min\./);
  });

  test('fotos a mitad de una reserva: aviso y el mismo paso, sin perder lo elegido', async () => {
    seed(muchos(3));
    await say('hola');
    await say('1');
    const r = await sayLote('', [foto(1)]);
    assert.match(r.interactive.body.text, /^Recibí tu foto 📷/);
    assert.equal(r.conversation.currentFlow, 'choosing_service');
    assert.deepEqual(ids(r).slice(0, 3), ['svc:s1', 'svc:s2', 'svc:s3']);
  });
});
