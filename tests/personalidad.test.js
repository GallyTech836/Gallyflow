// Pruebas de la personalidad del asistente (funciones puras) y de que la
// copia del Admin sea igual a la del backend.  Ejecutar: npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as front from '../src/shared/assistant/personalidad.js';
import * as back from '../backend/services/assistantEngine/personalidad.js';

describe('personalidad', () => {
  test('sin configurar: amigable, igual que antes', () => {
    const v = front.crearVoz(undefined, { negocio: 'Royal Barber' });
    assert.equal(v.tono, 'amigable');
    assert.equal(`${v.bienvenida('Juan')} ${v.ayuda()}`, 'Hola Juan 👋 Soy el asistente de Royal Barber. ¿En qué te ayudo?');
    assert.equal(v.bienvenida(''), 'Hola 👋 Soy el asistente de Royal Barber.');
    assert.equal(v.anuncio('Juan'), 'Hola Juan 👋 Gracias por escribir a Royal Barber.');
    assert.equal(v.gracias(), '¡Gracias!');
    assert.equal(v.texto('✅ Tu cita'), '✅ Tu cita');
  });

  test('hay al menos 5 personalidades y todas generan sus frases', () => {
    assert.ok(front.LISTA_TONOS.length >= 5);
    for (const { id } of front.LISTA_TONOS) {
      const v = front.crearVoz({ tono: id }, { negocio: 'N', hora: 10 });
      for (const f of ['ayuda', 'gracias', 'noEntendi', 'preguntaInfo', 'humano']) assert.ok(v[f]().length > 0, `${id}.${f}`);
      assert.ok(v.bienvenida('Ana').includes('Ana'), id);
    }
  });

  test('formal: usted, sin emojis y saludo según la hora', () => {
    assert.equal(front.crearVoz({ tono: 'formal' }, { negocio: 'N', hora: 9 }).bienvenida('Juan'), 'Buenos días, Juan. Le saluda el asistente virtual de N.');
    assert.match(front.crearVoz({ tono: 'formal' }, { negocio: 'N', hora: 15 }).bienvenida(''), /^Buenas tardes\./);
    assert.match(front.crearVoz({ tono: 'formal' }, { negocio: 'N', hora: 21 }).bienvenida(''), /^Buenas noches\./);
    const v = front.crearVoz({ tono: 'formal' }, { negocio: 'N' });
    assert.equal(v.texto('✅ Confirma tu cita. Escribe "menu" si quieres volver.'), 'Confirme su cita. Escriba "menu" si quiere volver.');
    assert.equal(v.texto('¿Con quién deseas atenderte?'), '¿Con quién desea atenderse?');
  });

  test('emojis combinables con cualquier personalidad', () => {
    assert.match(front.crearVoz({ tono: 'formal', emojis: true }, { negocio: 'N' }).texto('✅ Listo'), /✅/);
    const sin = front.crearVoz({ tono: 'cercano', emojis: false }, { negocio: 'N' });
    assert.doesNotMatch(sin.bienvenida('Juan'), /\p{Extended_Pictographic}/u);
    assert.equal(sin.titulo('📷 No sé quién es'), 'No sé quién es');
  });

  test('saludo propio y despedida', () => {
    const v = front.crearVoz({ saludo: '¡Bienvenido a {negocio}, {nombre}! ✂️', despedida: 'Llega 5 min antes.' }, { negocio: 'Royal' });
    assert.equal(v.bienvenida('Juan'), '¡Bienvenido a Royal, Juan! ✂️');
    assert.equal(v.bienvenida(''), '¡Bienvenido a Royal,! ✂️'.replace(',!', '!'));
    assert.equal(v.despedida(), 'Llega 5 min antes.');
  });

  test('datos inválidos se normalizan', () => {
    assert.deepEqual(front.normalizarPersonalidad({ tono: 'pirata', emojis: 'si', saludo: 5, despedida: 'x'.repeat(400) }),
      { tono: 'amigable', emojis: null, saludo: '', despedida: 'x'.repeat(300) });
  });

  test('aplicarVoz toca cuerpo, botones y filas pero no ids', () => {
    const v = front.crearVoz({ tono: 'formal' }, { negocio: 'N' });
    const r = front.aplicarVoz({ replyText: 'Elige 👇', interactive: { body: { text: 'Elige tu servicio 👇' }, action: { buttons: [{ reply: { id: 'welcome|1', title: '📅 Agendar' } }], sections: [{ rows: [{ id: 'x|1', title: '➕ Agregar', description: 'Sumar a tu cita' }] }] } } }, v);
    assert.equal(r.replyText, 'Elija');
    assert.equal(r.interactive.body.text, 'Elija su servicio');
    assert.equal(r.interactive.action.buttons[0].reply.title, 'Agendar');
    assert.equal(r.interactive.action.buttons[0].reply.id, 'welcome|1');
    assert.equal(r.interactive.action.sections[0].rows[0].description, 'Sumar a su cita');
  });
});

describe('copia del Admin igual a la del backend', () => {
  test('mismo código', async () => {
    const a = await readFile(new URL('../backend/services/assistantEngine/personalidad.js', import.meta.url), 'utf8');
    const b = await readFile(new URL('../src/shared/assistant/personalidad.js', import.meta.url), 'utf8');
    assert.ok(b.endsWith(a), 'src/shared/assistant/personalidad.js debe ser copia de backend/services/assistantEngine/personalidad.js');
    assert.deepEqual(Object.keys(front).sort(), Object.keys(back).sort());
  });
});
