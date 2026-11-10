// inboundQueue.js
//
// Cola de mensajes entrantes de WhatsApp, guardada en Firestore.
//
//  1. El webhook guarda cada mensaje ANTES de responder 200 (enqueue). El id
//     de WhatsApp es el id del documento: un reintento del mismo mensaje no
//     se guarda dos veces (deduplicación atómica con create()).
//  2. drain() procesa la conversación con un turno (lock) con vencimiento:
//     una sola ejecución a la vez por cliente, aunque haya varias instancias.
//  3. Fotos, audios y archivos se juntan durante MEDIA_WINDOW_MS desde el
//     último: varias fotos seguidas = un solo lote = una sola respuesta. Un
//     texto que llega dentro de la ventana cierra el lote y va con las fotos.
//     Los textos seguidos ("Hola" + "quiero un corte") también se juntan
//     durante la ventana de texto (textWindowMs) y se responden una sola vez.
//     Un toque de botón/lista se procesa al instante (descarta esos textos).
//  4. Un barrido periódico retoma lo que quedó pendiente (reinicio de
//     Railway, timer perdido, otra instancia caída).
//
// Colección (solo backend, Admin SDK):
//   assistantInbox/{negocioId}__{phone}            -> turno + pendingSince
//   assistantInbox/{negocioId}__{phone}/messages/{hash del id de WhatsApp}

import crypto from 'crypto';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';

export const MEDIA_WINDOW_MS = Number(process.env.ASSISTANT_MEDIA_WINDOW_MS) || 3500;
/**
 * Espera tras el último texto del cliente antes de responder, para juntar los
 * mensajes que manda seguidos. ASSISTANT_TEXT_WINDOW_MS=0 lo desactiva
 * (cada texto se responde al instante, como antes).
 */
export function textWindowMs() {
  const crudo = process.env.ASSISTANT_TEXT_WINDOW_MS;
  const v = Number(crudo);
  return crudo !== undefined && crudo !== '' && Number.isFinite(v) && v >= 0 ? v : 2500;
}
const LOCK_MS = 120 * 1000; // vencimiento del turno si el proceso se cae
const STALE_MS = 10 * 1000; // pendientes con más de esto los retoma el barrido
const SWEEP_MS = 30 * 1000;
const MAX_ATTEMPTS = 2; // tras 2 intentos fallidos el mensaje queda 'failed'
const MAX_LOTES_POR_TURNO = 25;
const KEEP_DONE_MS = 24 * 60 * 60 * 1000; // ids procesados que se conservan (deduplicación)
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // expireAt para la política TTL de Firestore (opcional)

// Tipos que se agrupan en la ventana de multimedia.
const AGRUPABLES = new Set(['media', 'unsupported', 'ignored']);

const INSTANCIA = crypto.randomUUID();

/** ASSISTANT_INBOX=off en Railway vuelve al procesamiento directo (sin cola). */
export function inboxEnabled() {
  return String(process.env.ASSISTANT_INBOX || 'on').toLowerCase() !== 'off';
}

let procesarLote = null;
/** El webhook registra aquí la función que procesa un lote ([mensajes]). */
export function registerBatchHandler(fn) {
  procesarLote = fn;
}

const conversacionId = (negocioId, phone) => `${negocioId}__${phone}`;
const convRef = (negocioId, phone) => db.collection('assistantInbox').doc(conversacionId(negocioId, phone));
// Los ids de WhatsApp (wamid...) pueden traer "/" o "+": se usa su hash.
const idDocumento = (messageId) => crypto.createHash('sha1').update(String(messageId)).digest('hex');

const esDuplicado = (err) => err?.code === 6 || /ALREADY_EXISTS/i.test(String(err?.message || ''));

/**
 * Guarda un mensaje. `mensaje` = { id, phoneNumberId, displayPhone, kind,
 * text?, media?, mediaType?, referral? } (normalizado por el webhook).
 * Devuelve { duplicate } y lanza si Firestore falla (el webhook responde 500
 * para que el proveedor reintente).
 */
export async function enqueue({ negocioId, phone, mensaje, now = Date.now() }) {
  const cRef = convRef(negocioId, phone);
  const mRef = cRef.collection('messages').doc(idDocumento(mensaje.id));
  try {
    await db.runTransaction(async (tx) => {
      const c = await tx.get(cRef);
      const previo = c.exists ? c.data() : {};
      tx.create(mRef, {
        ...mensaje,
        negocioId,
        phone,
        status: 'pending',
        attempts: 0,
        receivedAt: now,
        expireAt: new Date(now + TTL_MS),
      });
      tx.set(cRef, {
        negocioId,
        phone,
        pendingSince: Number(previo.pendingSince) > 0 ? previo.pendingSince : now,
        updatedAt: now,
      }, { merge: true });
    });
    return { duplicate: false };
  } catch (err) {
    if (esDuplicado(err)) return { duplicate: true };
    throw err;
  }
}

/**
 * Arma el próximo lote con los pendientes (ordenados por llegada).
 *   { tipo: 'vacio' } | { tipo: 'esperar', ms } | { tipo: 'lote', mensajes }
 * Un lote solo junta mensajes del mismo número del negocio.
 */
export function armarLote(pendientes, now = Date.now(), ventanaMs = MEDIA_WINDOW_MS, ventanaTextoMs = textWindowMs()) {
  if (!pendientes.length) return { tipo: 'vacio' };
  const primero = pendientes[0];
  const mismoNumero = (m) => m.phoneNumberId === primero.phoneNumberId;

  // Textos seguidos: se juntan hasta que pase la ventana sin uno nuevo.
  if (primero.kind === 'text' && ventanaTextoMs > 0) {
    const lote = [];
    for (const m of pendientes) {
      if (!mismoNumero(m)) break;
      if (m.kind === 'text' || m.kind === 'ignored') { lote.push(m); continue; }
      // Tocó un botón: se responde ya, con el botón como mensaje principal.
      if (m.kind === 'interactive') { lote.push(m); return { tipo: 'lote', mensajes: lote }; }
      break; // fotos/archivos: van en el lote siguiente
    }
    if (lote.length < pendientes.length) return { tipo: 'lote', mensajes: lote };
    const ultimo = Math.max(...lote.map((m) => Number(m.receivedAt) || 0));
    const falta = ultimo + ventanaTextoMs - now;
    if (falta > 0) return { tipo: 'esperar', ms: falta };
    return { tipo: 'lote', mensajes: lote };
  }

  if (!AGRUPABLES.has(primero.kind)) return { tipo: 'lote', mensajes: [primero] };

  const lote = [];
  for (const m of pendientes) {
    if (!mismoNumero(m)) break;
    if (AGRUPABLES.has(m.kind)) { lote.push(m); continue; }
    // Texto o toque de botón después de la multimedia: cierra el lote y va con ella.
    lote.push(m);
    return { tipo: 'lote', mensajes: lote };
  }
  const ultimo = Math.max(...lote.map((m) => Number(m.receivedAt) || 0));
  const falta = ultimo + ventanaMs - now;
  // Si después vienen mensajes de otro número, no se espera por esta ventana.
  const hayOtros = lote.length < pendientes.length;
  if (falta > 0 && !hayOtros) return { tipo: 'esperar', ms: falta };
  return { tipo: 'lote', mensajes: lote };
}

async function tomarTurno(cRef, owner, now = Date.now()) {
  return db.runTransaction(async (tx) => {
    const c = await tx.get(cRef);
    if (!c.exists) return false;
    const d = c.data();
    if (d.lockOwner && d.lockOwner !== owner && Number(d.lockUntil) > now) return false;
    tx.set(cRef, { lockOwner: owner, lockUntil: now + LOCK_MS }, { merge: true });
    return true;
  });
}

async function leerPendientes(cRef) {
  const snap = await cRef.collection('messages').where('status', 'in', ['pending', 'processing']).get();
  return snap.docs
    .map((d) => ({ ...d.data(), _ref: d.ref }))
    .sort((a, b) => (Number(a.receivedAt) || 0) - (Number(b.receivedAt) || 0));
}

// Suelta el turno. Si mientras tanto llegó algo, avisa para seguir drenando.
async function soltarTurno(cRef, owner) {
  return db.runTransaction(async (tx) => {
    const c = await tx.get(cRef);
    const pend = await tx.get(cRef.collection('messages').where('status', 'in', ['pending', 'processing']));
    if (!c.exists || c.data().lockOwner !== owner) return { quedan: false };
    const tiempos = pend.docs.map((d) => Number(d.data().receivedAt) || 0).filter(Boolean);
    tx.set(cRef, {
      lockOwner: null,
      lockUntil: 0,
      pendingSince: tiempos.length ? Math.min(...tiempos) : null,
    }, { merge: true });
    return { quedan: tiempos.length > 0 };
  });
}

const marcar = (mensajes, datos) => Promise.all(mensajes.map((m) => m._ref.set(datos, { merge: true })));
const sinRef = ({ _ref, ...m }) => m;

// Timers de la ventana de multimedia (solo una optimización: si se pierden,
// el barrido completa el trabajo).
const timers = new Map();
function programar(negocioId, phone, ms) {
  const clave = conversacionId(negocioId, phone);
  clearTimeout(timers.get(clave));
  const t = setTimeout(() => {
    timers.delete(clave);
    drain(negocioId, phone).catch((err) => logger.error('[inboundQueue] Error al drenar (timer):', err.message));
  }, Math.max(0, ms) + 50);
  t.unref?.();
  timers.set(clave, t);
}

/**
 * Procesa los pendientes de una conversación, de a un lote por vez. Si otro
 * proceso tiene el turno, no hace nada (ese proceso recoge lo nuevo).
 * Devuelve cuántos lotes procesó (útil para pruebas).
 */
export async function drain(negocioId, phone, { now = () => Date.now() } = {}) {
  if (!procesarLote) throw new Error('[inboundQueue] Falta registerBatchHandler');
  const cRef = convRef(negocioId, phone);
  const owner = `${INSTANCIA}:${crypto.randomUUID()}`;
  let lotes = 0;

  for (let ronda = 0; ronda < 5; ronda++) {
    if (!(await tomarTurno(cRef, owner, now()))) return lotes;
    let quedan = false;
    try {
      for (let i = 0; i < MAX_LOTES_POR_TURNO; i++) {
        let pendientes = await leerPendientes(cRef);
        // Lo que ya se intentó demasiadas veces no se reintenta en bucle.
        const agotados = pendientes.filter((m) => (Number(m.attempts) || 0) >= MAX_ATTEMPTS);
        if (agotados.length) {
          logger.error(`[inboundQueue] ${agotados.length} mensaje(s) sin procesar tras ${MAX_ATTEMPTS} intentos (${negocioId})`);
          await marcar(agotados, { status: 'failed' });
          pendientes = pendientes.filter((m) => !agotados.includes(m));
        }
        const plan = armarLote(pendientes, now());
        if (plan.tipo === 'vacio') break;
        if (plan.tipo === 'esperar') { programar(negocioId, phone, plan.ms); break; }

        const lote = plan.mensajes;
        await Promise.all(lote.map((m) => m._ref.set({ status: 'processing', attempts: (Number(m.attempts) || 0) + 1 }, { merge: true })));
        try {
          await procesarLote(lote.map(sinRef));
        } catch (err) {
          // Igual que antes de la cola: el error se registra y el mensaje no
          // se reintenta (reintentar podría duplicar respuestas ya enviadas).
          logger.error('[inboundQueue] Error procesando lote:', err.message);
        }
        await marcar(lote, { status: 'done' });
        lotes += 1;
        // Renueva el turno para lotes largos.
        await cRef.set({ lockUntil: now() + LOCK_MS }, { merge: true });
      }
    } finally {
      ({ quedan } = await soltarTurno(cRef, owner));
    }
    if (!quedan) break;
    // Quedan pendientes: si es una ventana de multimedia abierta, ya hay un
    // timer; si no, se sigue drenando.
    const plan = armarLote(await leerPendientes(cRef), now());
    if (plan.tipo !== 'lote') {
      if (plan.tipo === 'esperar') programar(negocioId, phone, plan.ms);
      break;
    }
  }
  limpiarProcesados(cRef, now()).catch(() => {});
  return lotes;
}

// Borra ids procesados viejos (la deduplicación solo necesita los recientes).
async function limpiarProcesados(cRef, now) {
  const snap = await cRef.collection('messages').where('status', 'in', ['done', 'failed']).get();
  const viejos = snap.docs.filter((d) => (Number(d.data().receivedAt) || 0) < now - KEEP_DONE_MS).slice(0, 50);
  await Promise.all(viejos.map((d) => d.ref.delete()));
}

/** Una pasada del barrido: retoma conversaciones con pendientes viejos. */
export async function sweepOnce(now = Date.now()) {
  const snap = await db.collection('assistantInbox').where('pendingSince', '<=', now - STALE_MS).limit(50).get();
  let retomadas = 0;
  for (const d of snap.docs) {
    const { negocioId, phone } = d.data();
    if (!negocioId || !phone) continue;
    try {
      await drain(negocioId, phone);
      retomadas += 1;
    } catch (err) {
      logger.error('[inboundQueue] Error en el barrido:', err.message);
    }
  }
  return retomadas;
}

let barrido = null;
/** Arranca el barrido (al iniciar el servidor y cada SWEEP_MS). */
export function startInboxSweeper() {
  if (!inboxEnabled() || barrido) return;
  const correr = () => sweepOnce().catch((err) => logger.error('[inboundQueue] Barrido falló:', err.message));
  setTimeout(correr, 5000).unref?.();
  barrido = setInterval(correr, SWEEP_MS);
  barrido.unref?.();
  logger.info('[inboundQueue] Cola de mensajes de WhatsApp activa.');
}
