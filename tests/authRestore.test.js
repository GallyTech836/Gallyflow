// Restaurar el usuario de Firebase al abrir Admin (useAuth).
// Ejecutar (desde la raíz):  npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { watchAuthRestore, AUTH_RESTORE_TIMEOUT_MS } from '../src/auth/authRestore.js';

// Reloj y Firebase de mentira.
function setup() {
  const timers = new Map();
  let nextId = 1;
  const fb = { onUser: null, onError: null, unsubscribed: false };
  const states = [];
  const stop = watchAuthRestore({
    subscribe: (onUser, onError) => { fb.onUser = onUser; fb.onError = onError; return () => { fb.unsubscribed = true; }; },
    onChange: (s) => states.push(s),
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  const fire = () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } };
  return { fb, states, stop, timers, fire };
}

describe('restauración del usuario (useAuth)', () => {
  test('el límite es de 15 segundos', () => {
    assert.equal(AUTH_RESTORE_TIMEOUT_MS, 15000);
    const { timers } = setup();
    assert.equal([...timers.values()][0].ms, 15000);
  });

  test('Firebase responde a tiempo con usuario: entra, sin aviso de conexión', () => {
    const { fb, states, timers } = setup();
    fb.onUser({ uid: 'u1' });
    assert.deepEqual(states, [{ status: 'ready', user: { uid: 'u1' } }]);
    assert.equal(timers.size, 0);
  });

  test('Firebase responde sin usuario: va al login', () => {
    const { fb, states } = setup();
    fb.onUser(null);
    assert.deepEqual(states, [{ status: 'ready', user: null }]);
  });

  test('Firebase no responde en 15 s: "No se pudo conectar", nunca el login', () => {
    const { states, fire } = setup();
    fire();
    assert.deepEqual(states, [{ status: 'unreachable' }]);
    assert.ok(!states.some((s) => s.status === 'ready'));
  });

  test('si Firebase responde después del límite, entra normal', () => {
    const { fb, states, fire } = setup();
    fire();
    fb.onUser({ uid: 'u1' });
    assert.deepEqual(states, [{ status: 'unreachable' }, { status: 'ready', user: { uid: 'u1' } }]);
  });

  test('error de Firebase al restaurar: "No se pudo conectar" (no el login)', () => {
    const { fb, states, timers } = setup();
    fb.onError(new Error('network'));
    assert.deepEqual(states, [{ status: 'unreachable' }]);
    assert.equal(timers.size, 0);
  });

  test('al desmontar deja de escuchar y cancela el límite', () => {
    const { fb, stop, timers } = setup();
    stop();
    assert.equal(fb.unsubscribed, true);
    assert.equal(timers.size, 0);
  });
});
