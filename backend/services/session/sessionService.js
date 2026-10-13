// sessionService.js
//
// Sesiones del servidor (colección authSessions, solo la usa el backend).
// - Máximo 2 sesiones activas por usuario (el Super Admin queda excluido).
// - Vencen tras SESSION_IDLE_DAYS días sin uso (por defecto 30).
// - La última actividad se guarda como mucho cada 6 horas (pocas escrituras).
// - Una sesión cerrada deja de servir en el backend al instante.

import crypto from 'node:crypto';
import { db } from '../../config/firebase.js';

export const MAX_SESSIONS = 2;
export const IDLE_DAYS = Number(process.env.SESSION_IDLE_DAYS) || 30;
const IDLE_MS = IDLE_DAYS * 24 * 60 * 60 * 1000;
const TOUCH_MS = 6 * 60 * 60 * 1000;
const CACHE_MS = 30 * 1000;
const SUPER_ADMIN_EMAIL = 'torricogali@gmail.com';

const col = () => db.collection('authSessions');
const cache = new Map(); // sid -> { data, at }

export function isExemptFromLimit(actor) {
  return !!actor?.email && actor.email === SUPER_ADMIN_EMAIL;
}

export function describeDevice(userAgent = '') {
  const u = String(userAgent);
  const browser = /Edg\//.test(u) ? 'Edge'
    : /OPR\//.test(u) ? 'Opera'
    : /SamsungBrowser/.test(u) ? 'Samsung Internet'
    : /Firefox\/|FxiOS/.test(u) ? 'Firefox'
    : /CriOS|Chrome\//.test(u) ? 'Chrome'
    : /Safari\//.test(u) ? 'Safari'
    : 'Navegador';
  const os = /iPad/.test(u) ? 'iPad'
    : /iPhone/.test(u) ? 'iPhone'
    : /Android/.test(u) ? 'Android'
    : /Windows/.test(u) ? 'Windows'
    : /Mac OS X|Macintosh/.test(u) ? 'Mac'
    : /Linux/.test(u) ? 'Linux'
    : 'Dispositivo';
  return { browser, os, label: browser + ' en ' + os };
}

function isAlive(s, now) {
  return s.status === 'active' && now - Date.parse(s.lastActiveAt) < IDLE_MS;
}

function publicView(id, s) {
  return { id, device: s.device || null, createdAt: s.createdAt, lastActiveAt: s.lastActiveAt };
}

/**
 * Crea una sesión respetando el límite.
 * Devuelve { sid } o { limit: true, sessions } si ya hay 2 abiertas.
 * replaceSid: sesión propia que el usuario eligió cerrar para entrar.
 */
export async function createSession({ uid, rol, negocioId, userAgent, replaceSid, exempt }) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const sid = crypto.randomBytes(24).toString('base64url');

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(col().where('uid', '==', uid).where('status', '==', 'active'));
    let vivas = [];
    for (const d of snap.docs) {
      if (isAlive(d.data(), now)) vivas.push(d);
      else tx.update(d.ref, { status: 'expired', endedAt: nowIso });
    }
    if (replaceSid) {
      const elegida = vivas.find((d) => d.id === replaceSid);
      if (elegida) {
        tx.update(elegida.ref, { status: 'revoked', endedAt: nowIso, endedReason: 'replaced' });
        vivas = vivas.filter((d) => d.id !== replaceSid);
      }
    }
    if (!exempt && vivas.length >= MAX_SESSIONS) {
      return { limit: true, sessions: vivas.map((d) => publicView(d.id, d.data())) };
    }
    tx.set(col().doc(sid), {
      uid,
      rol,
      negocioId: negocioId || null,
      device: describeDevice(userAgent),
      userAgent: String(userAgent || '').slice(0, 200),
      createdAt: nowIso,
      lastActiveAt: nowIso,
      status: 'active',
    });
    return { sid };
  });

  if (replaceSid) cache.delete(replaceSid);
  return result;
}

/** Valida una sesión. Devuelve { ok: true, session } o { ok: false, code }. */
export async function validateSession(sid, uid) {
  if (!sid || typeof sid !== 'string' || sid.length > 100) return { ok: false, code: 'SESSION_MISSING' };
  const now = Date.now();
  let entry = cache.get(sid);
  if (!entry || now - entry.at > CACHE_MS) {
    const snap = await col().doc(sid).get();
    entry = { data: snap.exists ? snap.data() : null, at: now };
    if (cache.size > 5000) cache.clear();
    cache.set(sid, entry);
  }
  const s = entry.data;
  if (!s || s.uid !== uid) return { ok: false, code: 'SESSION_INVALID' };
  if (s.status !== 'active') return { ok: false, code: 'SESSION_REVOKED' };

  const idle = now - Date.parse(s.lastActiveAt);
  if (idle >= IDLE_MS) {
    cache.delete(sid);
    col().doc(sid).update({ status: 'expired', endedAt: new Date(now).toISOString() }).catch(() => {});
    return { ok: false, code: 'SESSION_EXPIRED' };
  }
  if (idle >= TOUCH_MS) {
    const iso = new Date(now).toISOString();
    s.lastActiveAt = iso;
    col().doc(sid).update({ lastActiveAt: iso }).catch(() => {});
  }
  return { ok: true, session: { id: sid, ...s } };
}

export async function listSessions(uid) {
  const now = Date.now();
  const snap = await col().where('uid', '==', uid).where('status', '==', 'active').get();
  return snap.docs
    .filter((d) => isAlive(d.data(), now))
    .map((d) => publicView(d.id, d.data()))
    .sort((a, b) => String(b.lastActiveAt).localeCompare(String(a.lastActiveAt)));
}

/** Cierra una sesión propia. Devuelve false si no existe o no es del usuario. */
export async function revokeSession(sid, uid, reason = 'user') {
  if (!sid || typeof sid !== 'string' || sid.length > 100) return false;
  const ref = col().doc(sid);
  const snap = await ref.get();
  if (!snap.exists || snap.data().uid !== uid) return false;
  if (snap.data().status === 'active') {
    await ref.update({ status: 'revoked', endedAt: new Date().toISOString(), endedReason: reason });
  }
  cache.delete(sid);
  return true;
}

/** Cierra todas las sesiones activas de un usuario (ej. profesional eliminado). */
export async function revokeAllSessions(uid, reason) {
  const snap = await col().where('uid', '==', uid).where('status', '==', 'active').get();
  if (snap.empty) return 0;
  const batch = db.batch();
  const nowIso = new Date().toISOString();
  for (const d of snap.docs) {
    batch.update(d.ref, { status: 'revoked', endedAt: nowIso, endedReason: reason });
    cache.delete(d.id);
  }
  await batch.commit();
  return snap.size;
}
