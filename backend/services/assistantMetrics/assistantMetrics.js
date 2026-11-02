// assistantMetrics.js
//
// Métricas del Asistente de WhatsApp para Super Admin (Asistente WhatsApp / Consumo).
//
// Qué se reutiliza (ya existía):
//   negocios/{id}/uso/{AAAA-MM}.whatsappMensajes  -> salientes enviados con éxito (total del mes)
//   negocios/{id}/citas.bookedBy == 'assistant'   -> reservas hechas por el bot
//
// Qué se registra nuevo, en el MISMO documento de uso del mes:
//   asistente.entrantes                      -> mensajes del cliente (sin duplicados)
//   asistente.conversaciones.{categoria}     -> una sesión = una conversación
//   asistente.dias.{DD}.{entrantes|enviados|conversaciones.{categoria}}
//
// Sesión de conversación: mensajes del mismo cliente con menos de 30 min entre
// uno y otro (el mismo tiempo con que el bot reinicia una conversación). Cada
// sesión está siempre en UNA sola categoría, según lo que pasó en ella:
//   reserva > reprogramacion > humano > abandonada > consulta
// Una sesión "termina sin reserva" cuando pasan 30 min desde el último mensaje
// del cliente sin que se confirme una reserva. Mientras está abierta, su
// categoría puede cambiar (ej. de "abandonada" a "reserva").
//
// El estado de cada sesión se guarda en negocios/{id}/asistenteSesiones/{hash}:
// el id es un hash del celular (no se guarda el número) y solo tiene los
// últimos ids de mensaje (para no contar dos veces un webhook repetido) y la
// sesión abierta.
//
// Seguimiento por negocio: negocios/{id}.assistantMetrics = { startDate, enabled }.
// enabled === false -> no se registra nada nuevo aquí (el contador
// whatsappMensajes sigue igual porque lo usan los límites del plan).

import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { getNegocioAccess } from '../capabilities/capabilityService.js';

const TZ = process.env.APP_TIMEZONE || 'America/La_Paz';

export const SESSION_GAP_MS = 30 * 60 * 1000;
const IDS_GUARDADOS = 30;

export const CATEGORIAS = ['reserva', 'reprogramacion', 'humano', 'abandonada', 'consulta'];

// Pasos del flujo de agendar: si la sesión pasó por alguno, ya intentó reservar.
export const FLUJOS_DE_RESERVA = new Set([
  'choosing_service', 'choosing_extra_service', 'choosing_staff', 'choosing_date',
  'choosing_time', 'awaiting_name', 'confirming',
]);

// ───────────────────────── Fechas (zona del negocio) ─────────────────────────

/** "2026-11-01" en la zona del negocio. */
export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export const periodOf = (fecha) => String(fecha).slice(0, 7);
const diaDe = (fecha) => String(fecha).slice(8, 10);

// ───────────────────────── Configuración por negocio ─────────────────────────

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s) {
  if (!FECHA_RE.test(String(s || ''))) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** { enabled, startDate } con valores por defecto (seguimiento activo, sin fecha). */
export function normalizeConfig(raw) {
  return {
    enabled: raw?.enabled !== false,
    startDate: isValidDate(raw?.startDate) ? raw.startDate : null,
  };
}

/**
 * 'pausado'  -> seguimiento apagado
 * 'pruebas'  -> sin fecha de inicio, o la fecha todavía no llegó
 * 'medicion' -> midiendo consumo real
 */
export function trackingState(config, hoy = dayKey()) {
  const c = normalizeConfig(config);
  if (!c.enabled) return 'pausado';
  if (!c.startDate || c.startDate > hoy) return 'pruebas';
  return 'medicion';
}

async function seguimientoActivo(negocioId) {
  try {
    const access = await getNegocioAccess(String(negocioId)); // caché de 60 s
    return normalizeConfig(access?.assistantMetrics).enabled;
  } catch {
    return true; // ante la duda se registra: es solo estadística
  }
}

// ───────────────────────── Categoría de una sesión ─────────────────────────

export function categoriaDe(flags = {}) {
  if (flags.reserva) return 'reserva';
  if (flags.reprogramacion) return 'reprogramacion';
  if (flags.humano) return 'humano';
  if (flags.intento) return 'abandonada';
  return 'consulta';
}

// ───────────────────────── Referencias ─────────────────────────

function usageRef(negocioId, period) {
  return db.collection('negocios').doc(String(negocioId)).collection('uso').doc(period);
}

/** Id de la sesión: hash del negocio + celular. No se guarda el número. */
export function sessionDocId(negocioId, phone) {
  const digitos = String(phone || '').replace(/\D/g, '');
  return crypto.createHash('sha256').update(`${negocioId}:${digitos}`).digest('hex').slice(0, 32);
}

function sessionRef(negocioId, phone) {
  return db.collection('negocios').doc(String(negocioId)).collection('asistenteSesiones').doc(sessionDocId(negocioId, phone));
}

const esObjetoPlano = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

// Une mapas anidados (solo objetos planos; los FieldValue se copian tal cual).
function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = esObjetoPlano(v) && esObjetoPlano(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

// Incrementos anidados para set(..., { merge: true }).
function incEntrante(fecha) {
  return { asistente: { entrantes: FieldValue.increment(1), dias: { [diaDe(fecha)]: { entrantes: FieldValue.increment(1) } } } };
}

function incCategoria(fecha, categoria, n) {
  return {
    asistente: {
      conversaciones: { [categoria]: FieldValue.increment(n) },
      dias: { [diaDe(fecha)]: { conversaciones: { [categoria]: FieldValue.increment(n) } } },
    },
  };
}

// ───────────────────────── Registro ─────────────────────────

/**
 * Mensaje ENTRANTE del cliente. Sin duplicados: si el mismo messageId ya se
 * registró (Meta/YCloud reintentan el webhook), no suma nada.
 * Abre una sesión nueva si no hay una abierta (30 min).
 * Devuelve { counted, duplicate, nuevaSesion }.
 */
export async function recordInbound({ negocioId, phone, messageId, now = new Date() }) {
  if (!negocioId || !phone) return { counted: false };
  if (!(await seguimientoActivo(negocioId))) return { counted: false, paused: true };

  const ref = sessionRef(negocioId, phone);
  const ahoraMs = now.getTime();
  const hoy = dayKey(now);
  const id = messageId ? String(messageId) : null;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const ids = Array.isArray(data.ids) ? data.ids : [];
    if (id && ids.includes(id)) return { counted: false, duplicate: true };

    const abierta = data.sesion && ahoraMs - (Date.parse(data.sesion.ultimo) || 0) < SESSION_GAP_MS;
    const sesion = abierta
      ? { ...data.sesion, ultimo: now.toISOString() }
      : { inicio: hoy, ultimo: now.toISOString(), flags: {}, categoria: 'consulta' };

    // Entrante del día y, si la sesión es nueva, una conversación más (empieza
    // como "consulta"). Mismo documento: una sola escritura.
    const inc = abierta ? incEntrante(hoy) : deepMerge(incEntrante(hoy), incCategoria(hoy, 'consulta', 1));
    tx.set(usageRef(negocioId, periodOf(hoy)), inc, { merge: true });
    tx.set(ref, { ids: id ? [...ids, id].slice(-IDS_GUARDADOS) : ids, sesion });
    return { counted: true, duplicate: false, nuevaSesion: !abierta };
  });
}

/**
 * Lo que pasó en la conversación después de la respuesta del bot:
 *   flow  -> paso en que quedó (currentFlow)
 *   event -> 'reserva' | 'reprogramacion' | 'humano' (o null)
 * Si la sesión cambia de categoría, se mueve de una a otra (resta y suma) en
 * el día en que empezó la sesión: cada sesión cuenta una sola vez.
 */
export async function recordConversationEvent({ negocioId, phone, flow = null, event = null, now = new Date() }) {
  if (!negocioId || !phone) return { changed: false };
  const intento = !!flow && FLUJOS_DE_RESERVA.has(flow);
  if (!intento && !event && flow !== 'human') return { changed: false };
  if (!(await seguimientoActivo(negocioId))) return { changed: false, paused: true };

  const ref = sessionRef(negocioId, phone);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const sesion = snap.exists ? snap.data().sesion : null;
    // Sin sesión abierta no se inventa una (ej. el dueño respondió desde la app
    // a un cliente que no escribió en los últimos 30 min).
    if (!sesion || now.getTime() - (Date.parse(sesion.ultimo) || 0) >= SESSION_GAP_MS) return { changed: false };

    const flags = { ...(sesion.flags || {}) };
    if (intento) flags.intento = true;
    if (event === 'reserva') flags.reserva = true;
    if (event === 'reprogramacion') flags.reprogramacion = true;
    if (event === 'humano' || flow === 'human') flags.humano = true;

    const antes = sesion.categoria || categoriaDe(sesion.flags);
    const despues = categoriaDe(flags);
    const mismosFlags = JSON.stringify(flags) === JSON.stringify(sesion.flags || {});
    if (mismosFlags && antes === despues) return { changed: false };

    if (antes !== despues) {
      const fecha = sesion.inicio;
      tx.set(usageRef(negocioId, periodOf(fecha)), {
        asistente: {
          conversaciones: { [antes]: FieldValue.increment(-1), [despues]: FieldValue.increment(1) },
          dias: { [diaDe(fecha)]: { conversaciones: { [antes]: FieldValue.increment(-1), [despues]: FieldValue.increment(1) } } },
        },
      }, { merge: true });
    }
    tx.update(ref, { sesion: { ...sesion, flags, categoria: despues } });
    return { changed: antes !== despues, antes, despues };
  });
}

/**
 * Mensaje SALIENTE enviado con éxito: solo el desglose diario. El total del
 * mes ya lo suma incrementUsage('whatsappMensajes') en el webhook.
 */
export async function recordOutboundDaily({ negocioId, now = new Date() }) {
  if (!negocioId) return;
  if (!(await seguimientoActivo(negocioId))) return;
  const hoy = dayKey(now);
  await usageRef(negocioId, periodOf(hoy)).set(
    { asistente: { dias: { [diaDe(hoy)]: { enviados: FieldValue.increment(1) } } } },
    { merge: true },
  );
}

/** Nunca lanza: las métricas no deben cortar la respuesta del bot. */
export function safe(promise, ctx) {
  return Promise.resolve(promise).catch((err) => {
    logger.warn(`[assistantMetrics] ${ctx}:`, err.message);
    return null;
  });
}
