// identifyRequester + requireSession: solo un rechazo explícito del token o
// de la sesión responde 401 con código. Errores temporales (claves de Google,
// Firestore) responden 503 para que el front reintente y no cierre la sesión.
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';

const db = createFakeDb();
let verify = async () => ({ uid: 'u1', email: 'a@b.c' });
let failReads = false;
const realDb = {
  collection: (name) => {
    const c = db.collection(name);
    return {
      ...c,
      doc: (id) => {
        const d = c.doc(id);
        return { ...d, get: (...a) => (failReads ? Promise.reject(new Error('UNAVAILABLE')) : d.get(...a)), update: (...a) => d.update(...a) };
      },
    };
  },
};

mock.module('../config/firebase.js', { namedExports: { db: realDb } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('firebase-admin/auth', { namedExports: { getAuth: () => ({ verifyIdToken: (t) => verify(t) }) } });

const { identifyRequester, isTransientAuthError } = await import('../middlewares/auth.middleware.js');
const { requireSession } = await import('../middlewares/session.middleware.js');

const authError = (code) => Object.assign(new Error(code), { code });

function run(mw, req) {
  const out = { status: 200, body: undefined, next: false };
  const res = {
    status(c) { out.status = c; return res; },
    json(b) { out.body = b; return res; },
  };
  return Promise.resolve(mw(req, res, () => { out.next = true; })).then(() => out);
}
const reqWith = ({ token, sid, actor } = {}) => ({
  headers: token ? { authorization: 'Bearer ' + token } : {},
  get: (h) => (String(h).toLowerCase() === 'x-session-id' ? sid : undefined),
  actor,
});

let n = 0;
function seedSession(data = {}) {
  const sid = 'sid' + (++n);
  db._set('authSessions/' + sid, { uid: 'u1', status: 'active', lastActiveAt: new Date().toISOString(), ...data });
  return sid;
}

beforeEach(() => {
  verify = async () => ({ uid: 'u1', email: 'a@b.c' });
  failReads = false;
});

describe('identifyRequester', () => {
  test('token válido: sigue con el actor verificado', async () => {
    const req = reqWith({ token: 't' });
    const out = await run(identifyRequester, req);
    assert.equal(out.next, true);
    assert.equal(req.actor.verified, true);
    assert.equal(req.actor.uid, 'u1');
  });

  test('token vencido o inválido: 401 TOKEN_INVALID', async () => {
    for (const code of ['auth/id-token-expired', 'auth/argument-error', 'auth/id-token-revoked', 'auth/user-disabled']) {
      verify = async () => { throw authError(code); };
      const out = await run(identifyRequester, reqWith({ token: 't' }));
      assert.equal(out.status, 401, code);
      assert.equal(out.body.code, 'TOKEN_INVALID', code);
    }
  });

  test('error temporal (claves de Google, red, interno): 503 AUTH_UNAVAILABLE, no 401', async () => {
    for (const err of [authError('auth/internal-error'), authError('app/network-error'), new Error('ECONNRESET')]) {
      verify = async () => { throw err; };
      const out = await run(identifyRequester, reqWith({ token: 't' }));
      assert.equal(out.status, 503, err.message);
      assert.equal(out.body.code, 'AUTH_UNAVAILABLE');
    }
    assert.equal(isTransientAuthError(authError('auth/internal-error')), true);
    assert.equal(isTransientAuthError(authError('auth/id-token-expired')), false);
  });

  test('sin token: sigue sin verificar (lo decide cada ruta)', async () => {
    const req = reqWith();
    const out = await run(identifyRequester, req);
    assert.equal(out.next, true);
    assert.equal(req.actor.verified, false);
  });
});

describe('requireSession (/auth/session/check y rutas protegidas)', () => {
  const actor = { verified: true, uid: 'u1' };

  test('sesión activa: sigue', async () => {
    const sid = seedSession();
    const out = await run(requireSession, reqWith({ sid, actor }));
    assert.equal(out.next, true);
  });

  test('sin token: 401 NOT_AUTHENTICATED (el front no cierra la sesión por esto)', async () => {
    const out = await run(requireSession, reqWith({ sid: seedSession(), actor: { verified: false } }));
    assert.equal(out.status, 401);
    assert.equal(out.body.code, 'NOT_AUTHENTICATED');
  });

  test('cerrada desde otro dispositivo: 401 SESSION_REVOKED', async () => {
    const sid = seedSession({ status: 'revoked' });
    const out = await run(requireSession, reqWith({ sid, actor }));
    assert.equal(out.status, 401);
    assert.equal(out.body.code, 'SESSION_REVOKED');
  });

  test('30 días sin uso: 401 SESSION_EXPIRED', async () => {
    const sid = seedSession({ lastActiveAt: new Date(Date.now() - 31 * 864e5).toISOString() });
    const out = await run(requireSession, reqWith({ sid, actor }));
    assert.equal(out.status, 401);
    assert.equal(out.body.code, 'SESSION_EXPIRED');
  });

  test('de otro usuario o inexistente: 401 SESSION_INVALID; sin id: SESSION_MISSING', async () => {
    const ajena = seedSession({ uid: 'otro' });
    assert.equal((await run(requireSession, reqWith({ sid: ajena, actor }))).body.code, 'SESSION_INVALID');
    assert.equal((await run(requireSession, reqWith({ sid: 'no-existe', actor }))).body.code, 'SESSION_INVALID');
    assert.equal((await run(requireSession, reqWith({ actor }))).body.code, 'SESSION_MISSING');
  });

  test('Firestore no responde: 503 SESSION_UNAVAILABLE, no 401', async () => {
    failReads = true;
    const out = await run(requireSession, reqWith({ sid: 'sid-sin-cache', actor }));
    assert.equal(out.status, 503);
    assert.equal(out.body.code, 'SESSION_UNAVAILABLE');
  });
});
