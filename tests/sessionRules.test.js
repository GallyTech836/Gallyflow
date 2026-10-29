// Cuándo se cierra la sesión (Admin y BarberApp). Funciones puras.
// Ejecutar (desde la raíz):  npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_END_CODES, isSessionEnded, guardDecision, restoreDecision, startDecision,
} from '../src/shared/session/sessionRules.js';

const r401 = (code) => ({ ok: false, status: 401, data: code ? { code } : {} });
const r = (status, data = {}) => ({ ok: status >= 200 && status < 300, status, data });

describe('revisión periódica (useSessionGuard)', () => {
  test('cierra solo si el servidor dice revocada, vencida o inválida', () => {
    assert.deepEqual(SESSION_END_CODES, ['SESSION_REVOKED', 'SESSION_EXPIRED', 'SESSION_INVALID']);
    for (const code of SESSION_END_CODES) {
      assert.equal(guardDecision(r401(code)), 'end', code);
      assert.equal(isSessionEnded(r401(code)), true, code);
    }
  });

  test('sesión activa: sigue', () => {
    assert.equal(guardDecision(r(200, { ok: true })), 'keep');
  });

  test('sin conexión o sin token (no hubo respuesta): sigue', () => {
    assert.equal(guardDecision(null), 'keep');
    assert.equal(guardDecision(undefined), 'keep');
  });

  test('401 sin código o con código de token (no de sesión): sigue', () => {
    assert.equal(guardDecision(r401()), 'keep');
    assert.equal(guardDecision(r401('NOT_AUTHENTICATED')), 'keep');
    assert.equal(guardDecision(r401('TOKEN_INVALID')), 'keep');
    assert.equal(guardDecision(r401('SESSION_MISSING')), 'keep');
  });

  test('5xx, 502 de un despliegue, 503 y 429: sigue', () => {
    for (const s of [500, 502, 503, 504, 429]) assert.equal(guardDecision(r(s)), 'keep', String(s));
    assert.equal(guardDecision(r(503, { code: 'AUTH_UNAVAILABLE' })), 'keep');
    assert.equal(guardDecision(r(503, { code: 'SESSION_UNAVAILABLE' })), 'keep');
  });

  test('un código de cierre con otro status no cierra', () => {
    assert.equal(guardDecision(r(500, { code: 'SESSION_REVOKED' })), 'keep');
    assert.equal(guardDecision(r(403, { code: 'SESSION_EXPIRED' })), 'keep');
  });
});

describe('al abrir Admin con sesión guardada (useAdminSession)', () => {
  test('activa: entra', () => {
    assert.equal(restoreDecision(r(200, { ok: true })), 'ready');
  });

  test('revocada o vencida: sale con mensaje', () => {
    assert.equal(restoreDecision(r401('SESSION_REVOKED')), 'end');
    assert.equal(restoreDecision(r401('SESSION_EXPIRED')), 'end');
  });

  test('el servidor no la reconoce o falta: abre una nueva (sin echar al usuario)', () => {
    assert.equal(restoreDecision(r401('SESSION_INVALID')), 'renew');
    assert.equal(restoreDecision(r401('SESSION_MISSING')), 'renew');
  });

  test('red, 5xx, 429 o 401 sin código: entra con la sesión guardada (no la descarta)', () => {
    assert.equal(restoreDecision(null), 'keep');
    for (const s of [500, 502, 503, 429]) assert.equal(restoreDecision(r(s)), 'keep', String(s));
    assert.equal(restoreDecision(r401()), 'keep');
    assert.equal(restoreDecision(r401('NOT_AUTHENTICATED')), 'keep');
    assert.equal(restoreDecision(r401('TOKEN_INVALID')), 'keep');
  });
});

describe('abrir sesión nueva (/auth/session/start)', () => {
  test('abierta, límite de 2 sesiones, cuenta rechazada', () => {
    assert.equal(startDecision(r(201, { sid: 'x' })), 'ready');
    assert.equal(startDecision(r(409, { code: 'SESSION_LIMIT', sessions: [] })), 'limit');
    assert.equal(startDecision(r401('TOKEN_INVALID')), 'signout');
    assert.equal(startDecision(r(403)), 'signout');
  });

  test('sin respuesta o error del servidor: no bloquea ni cierra', () => {
    assert.equal(startDecision(null), 'retry');
    for (const s of [500, 502, 503, 429]) assert.equal(startDecision(r(s)), 'retry', String(s));
  });
});
