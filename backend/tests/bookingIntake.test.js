// Formulario de peluquería canina (datos de la mascota) de punta a punta:
// link público (publicBooking) y asistente de WhatsApp usan la misma config
// y guardan lo mismo en la cita (`intake`). Los demás negocios no cambian.
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';

const db = createFakeDb();
mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('../services/notificationService.js', { namedExports: { sendNotification: async () => ({}), sendDirectNotification: async () => ({}), getRecipients: async () => [] } });
mock.module('../services/capabilities/capabilityService.js', {
  namedExports: {
    getNegocioAccess: async () => ({ capabilities: { asistenteWhatsapp: { enabled: true } } }),
    checkCapability: async () => ({ allowed: true }), DENY_MESSAGES: {}, invalidateNegocioAccess: () => {},
    incrementUsage: async () => {}, incrementRejected: async () => {}, currentPeriod: () => 't', getUsage: async () => ({}),
    requireCapability: () => (a, b, n) => n(),
  },
});
const FOTO = 'https://res.cloudinary.com/yr91yhlf/image/upload/v1/toby.jpg';
class PhotoError extends Error {}
mock.module('../services/media/intakePhoto.js', {
  namedExports: {
    PhotoError,
    puedeDescargar: (m) => typeof m?.link === 'string' && m.link.startsWith('https://api.ycloud.com/'),
    guardarFotoDeWhatsApp: async () => FOTO,
  },
});

const { assistantEngine } = await import('../services/assistantEngine/engine.js');
const { createPublicBooking, BookingError } = await import('../services/appointments/publicBooking.js');

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const allDay = DIAS.map((day) => ({ day, status: 'Disponible', start: '00:00', end: '23:59' }));
let seq = 0;
let neg;
let phone;

function seed({ businessType = 'peluqueria_canina', bookingFormConfig } = {}) {
  neg = `perros${++seq}`; // el contexto se cachea 60 s por negocio
  phone = `59174000${String(seq).padStart(3, '0')}`;
  db._clear();
  db._set(`negocios/${neg}`, {
    heroConfig: { businessName: 'Patitas' }, businessType, businessSettings: { schedule: allDay },
    ...(bookingFormConfig ? { bookingFormConfig } : {}),
  });
  db._set(`negocios/${neg}/servicios/s1`, { name: 'Baño', price: 80, duration: 60 });
  db._set(`negocios/${neg}/profesionales/a`, { name: 'Ana', active: true, availability: allDay, services: [{ serviceId: 's1' }] });
  db._set(`negocios/${neg}/profesionales/b`, { name: 'Beto', active: true, availability: allDay, services: [{ serviceId: 's1' }] });
  db._set(`negocios/${neg}/clientes/${phone}`, { name: 'Juan Perez', phone });
}
const say = (m, media = null) => assistantEngine({ negocioId: neg, phone, message: m, media });
const btn = (r) => (r.interactive?.action?.buttons || []).map((b) => b.reply.id);
const cuerpo = (r) => r.interactive?.body?.text || r.replyText || '';
const citas = () => db._dump().filter(([k]) => k.startsWith(`negocios/${neg}/citas/`)).map(([, v]) => v);

async function hastaServicio() {
  await say('hola');
  await say('1'); // Agendar
  return say('1'); // Baño
}

describe('WhatsApp: datos de la mascota', () => {
  beforeEach(() => seed());

  test('pregunta los campos activos en orden y los guarda en la cita', async () => {
    let r = await hastaServicio();
    assert.match(cuerpo(r), /¿Cómo se llama tu mascota\?/);
    r = await say('Toby');
    assert.match(cuerpo(r), /¿Qué raza es Toby\?/);
    r = await say('Caniche');
    assert.match(cuerpo(r), /¿Qué tamaño tiene Toby\?/);
    assert.deepEqual(btn(r), ['collecting_intake|Pequeño', 'collecting_intake|Mediano', 'collecting_intake|Grande']);
    r = await say('collecting_intake|Pequeño');
    assert.match(cuerpo(r), /¿Qué edad tiene Toby\?/);
    r = await say('tres');
    assert.match(cuerpo(r), /edad con número/);
    r = await say('3 años');
    assert.match(cuerpo(r), /último baño/);
    r = await say('omitir');
    assert.match(cuerpo(r), /foto de Toby/);
    r = await say('', { link: 'https://api.ycloud.com/v2/whatsapp/media/download/1?sig=x', mimeType: 'image/jpeg' });
    assert.match(cuerpo(r), /¿Con quién/); // sigue con el profesional
    await say('1'); // Ana
    r = await say('1'); // primera hora (nombre conocido)
    assert.match(cuerpo(r), /Mascota: Toby \(Caniche, Pequeño, 3 años\) 📷/);
    await say('1'); // Confirmar
    const [cita] = citas();
    assert.deepEqual(cita.intake.values, { petName: 'Toby', breed: 'Caniche', size: 'Pequeño', age: { value: 3, unit: 'años' }, photo: FOTO });
    assert.equal(cita.intake.type, 'mascota');
    assert.equal(cita.bookedBy, 'assistant');
  });

  test('un campo obligatorio no se puede omitir', async () => {
    await hastaServicio();
    const r = await say('omitir');
    assert.match(cuerpo(r), /¿Cómo se llama tu mascota\?/);
  });

  test('una foto fuera del paso de la foto no se toma: aviso y la misma pregunta', async () => {
    await hastaServicio();
    const r = await say('', [{ link: 'https://api.ycloud.com/x' }]);
    assert.match(cuerpo(r), /^Recibí tu foto 📷/);
    assert.match(cuerpo(r), /¿Cómo se llama tu mascota\?/);
    assert.equal(r.conversation.intakeValues?.petName ?? null, null);
  });

  test('varias fotos en el paso de la foto: guarda una y el formulario avanza una sola vez', async () => {
    await hastaServicio();
    await say('Toby');
    await say('Caniche');
    await say('collecting_intake|Pequeño');
    await say('3 años');
    let r = await say('omitir');
    assert.match(cuerpo(r), /foto de Toby/);
    const foto = (n) => ({ link: `https://api.ycloud.com/v2/whatsapp/media/download/${n}?sig=x`, mimeType: 'image/jpeg' });
    r = await say('', [foto(1), foto(2), foto(3)]);
    assert.match(cuerpo(r), /^Recibí 3 fotos, usé la primera 📷/);
    assert.match(cuerpo(r), /¿Con quién/);
    assert.equal(r.conversation.intakeValues.photo, FOTO);
  });

  test('cliente que vuelve: ofrece la última mascota y no la vuelve a preguntar', async () => {
    db._set(`negocios/${neg}/citas/vieja`, {
      date: '2026-01-01', time: '10:00', status: 'completed', professionalId: 'a', clientPhone: phone, serviceId: 's1',
      intake: { type: 'mascota', values: { petName: 'Luna', breed: 'Pug', size: 'Pequeño' } },
    });
    let r = await hastaServicio();
    assert.match(cuerpo(r), /¿La reserva es para Luna \(Pug, Pequeño\)\?/);
    r = await say('confirming_pet|misma');
    // Solo faltan los opcionales que nunca se respondieron (edad, último baño, foto).
    assert.match(cuerpo(r), /¿Qué edad tiene Luna\?/);
  });

  test('respeta la config del negocio: campos apagados, etiquetas y orden', async () => {
    seed({ bookingFormConfig: { fields: [
      { key: 'size', label: 'Porte', enabled: true, required: true, options: ['Chico', 'Grande'] },
      { key: 'petName', label: 'Nombre', enabled: true, required: true },
      { key: 'breed', enabled: false }, { key: 'age', enabled: false }, { key: 'lastService', enabled: false }, { key: 'photo', enabled: false },
    ] } });
    let r = await hastaServicio();
    assert.deepEqual(btn(r), ['collecting_intake|Chico', 'collecting_intake|Grande']);
    r = await say('Chico');
    assert.match(cuerpo(r), /¿Cómo se llama tu mascota\?/);
    r = await say('Rocky');
    assert.match(cuerpo(r), /¿Con quién/);
  });

  test('barbería: el flujo no cambia', async () => {
    seed({ businessType: 'barberia' });
    const r = await hastaServicio();
    assert.match(cuerpo(r), /¿Con quién/);
  });
});

describe('Link público: datos de la mascota', () => {
  beforeEach(() => seed());
  const base = (extra = {}) => ({
    negocioId: neg, professionalId: 'a', serviceIds: ['s1'], date: '2030-01-15', time: '09:00',
    clientName: 'Juan Pérez', clientPhone: '71234567', ...extra,
  });
  const AHORA = new Date('2030-01-10T12:00:00Z');

  test('falta un obligatorio -> error claro y no se crea la cita', async () => {
    await assert.rejects(
      createPublicBooking(base({ intake: { petName: 'Toby' } }), { ahora: AHORA }),
      (e) => e instanceof BookingError && e.code === 'INTAKE_MISSING' && /Raza/.test(e.message) && /Tamaño/.test(e.message),
    );
    assert.equal(citas().length, 0);
  });

  test('valor inválido (foto que no es de Cloudinary) -> error', async () => {
    await assert.rejects(
      createPublicBooking(base({ intake: { petName: 'Toby', breed: 'Pug', size: 'Grande', photo: 'https://evil.com/x.jpg' } }), { ahora: AHORA }),
      (e) => e.code === 'INTAKE_INVALID',
    );
  });

  test('guarda el intake con la misma forma que WhatsApp', async () => {
    await createPublicBooking(base({ intake: { petName: 'Toby', breed: 'Pug', size: 'grande', age: { value: 8, unit: 'meses' }, lastService: '2029-12-20', photo: FOTO, extra: 'x' } }), { ahora: AHORA });
    const [cita] = citas();
    assert.deepEqual(cita.intake.values, { petName: 'Toby', breed: 'Pug', size: 'Grande', age: { value: 8, unit: 'meses' }, lastService: '2029-12-20', photo: FOTO });
    assert.equal(cita.intake.labels.size, 'Tamaño');
  });

  test('otro tipo de negocio: ignora intake y la cita queda como siempre', async () => {
    seed({ businessType: 'barberia' });
    await createPublicBooking(base({ intake: { petName: 'Toby' } }), { ahora: AHORA });
    const [cita] = citas();
    assert.equal('intake' in cita, false);
  });
});
