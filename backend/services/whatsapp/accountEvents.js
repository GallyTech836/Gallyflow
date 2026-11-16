// accountEvents.js
//
// Eventos de cuenta y de número que manda YCloud (todo lo que NO es un
// mensaje): desconexiones, restricciones, cambios de calidad, de nombre...
//
//  1. Se guarda SIEMPRE el payload completo en whatsappEvents/{id del evento}
//     (deduplicado: si YCloud reintenta, no se guarda dos veces).
//  2. Se asocia al negocio por wabaId o por el número de teléfono.
//  3. Si es una desconexión o una restricción, se marca la cuenta en
//     whatsappAccounts (status) y se avisa por push a soporte.
//
// Tipos de YCloud (docs: whatsapp-business-account-updated-webhook-examples):
//   whatsapp.business_account.deleted   -> la WABA se desconectó/eliminó
//   whatsapp.business_account.updated   -> updateEvent: ACCOUNT_RESTRICTION,
//                                          ACCOUNT_VIOLATION, DISABLED_UPDATE...
//   whatsapp.business_account.reviewed  -> revisión aprobada/rechazada
//   whatsapp.phone_number.deleted       -> se eliminó el número
//   whatsapp.phone_number.quality_updated / name_updated / ...

import crypto from 'crypto';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';

const UPDATE_GRAVES = new Set(['ACCOUNT_RESTRICTION', 'ACCOUNT_VIOLATION', 'DISABLED_UPDATE']);

const soloDigitos = (n) => String(n || '').replace(/\D/g, '');

/**
 * Gravedad del evento:
 *   'desconectado' -> el bot deja de funcionar (cuenta o número eliminados)
 *   'restriccion'  -> Meta restringió, sancionó o deshabilitó la cuenta
 *   'calidad'      -> la calidad del número bajó a amarillo/rojo
 *   'info'         -> solo se registra
 */
export function clasificarEvento(evento = {}) {
  const type = String(evento.type || '');
  if (type === 'whatsapp.business_account.deleted' || type === 'whatsapp.phone_number.deleted') return 'desconectado';
  if (type === 'whatsapp.business_account.updated') {
    const update = String(evento.whatsappBusinessAccount?.updateEvent || evento.updateEvent || '').toUpperCase();
    return UPDATE_GRAVES.has(update) ? 'restriccion' : 'info';
  }
  if (type === 'whatsapp.phone_number.quality_updated') {
    const calidad = String(evento.whatsappPhoneNumber?.qualityRating || '').toUpperCase();
    return calidad === 'YELLOW' || calidad === 'RED' ? 'calidad' : 'info';
  }
  return 'info';
}

/** wabaId, id y número del teléfono, vengan donde vengan en el payload. */
export function extraerIds(evento = {}) {
  const waba = evento.whatsappBusinessAccount || {};
  const num = evento.whatsappPhoneNumber || {};
  const wabaId = waba.id || num.wabaId || evento.wabaId || null;
  const phone = num.phoneNumber || evento.phoneNumber || null;
  return {
    wabaId: wabaId ? String(wabaId) : null,
    phoneNumberId: num.id ? String(num.id) : null,
    phone: phone ? `+${soloDigitos(phone)}` : null,
  };
}

/** Motivo legible para el aviso. */
export function motivoLegible(evento = {}) {
  const waba = evento.whatsappBusinessAccount || {};
  const partes = [];
  if (waba.removedReason) partes.push(`motivo: ${waba.removedReason}`);
  if (waba.removedInitiatedBy) partes.push(`iniciado por: ${waba.removedInitiatedBy}`);
  if (waba.updateEvent) partes.push(waba.updateEvent);
  if (waba.violationType) partes.push(`infracción: ${waba.violationType}`);
  if (waba.banState) partes.push(`estado: ${waba.banState}`);
  const calidad = evento.whatsappPhoneNumber?.qualityRating;
  if (calidad) partes.push(`calidad: ${calidad}`);
  return partes.join(' · ') || String(evento.type || 'evento');
}

/** Cuentas de whatsappAccounts a las que pertenece el evento. */
async function cuentasDelEvento({ wabaId, phone }) {
  const encontradas = new Map();
  if (phone) {
    const id = `ycloud_${soloDigitos(phone)}`;
    const snap = await db.collection('whatsappAccounts').doc(id).get();
    if (snap.exists) encontradas.set(id, snap.data());
  }
  if (wabaId) {
    const snap = await db.collection('whatsappAccounts').where('wabaId', '==', wabaId).get();
    snap.docs.forEach((d) => encontradas.set(d.id, d.data()));
  }
  return [...encontradas.entries()].map(([id, data]) => ({ id, ...data }));
}

// Firestore no acepta undefined: el JSON de ida y vuelta los elimina.
const limpio = (v) => JSON.parse(JSON.stringify(v ?? {}));

/**
 * Registra un evento de cuenta. `alertar(info)` se llama solo para eventos
 * graves y solo la primera vez que llega ese evento.
 * Devuelve { duplicate, severidad, negocioIds }.
 */
export async function registrarEventoCuenta(evento = {}, { alertar = async () => {}, ahora = new Date() } = {}) {
  const severidad = clasificarEvento(evento);
  const ids = extraerIds(evento);
  const cuentas = await cuentasDelEvento(ids);
  const negocioIds = [...new Set(cuentas.map((c) => c.negocioId).filter(Boolean))];
  const fecha = ahora.toISOString();

  const docId = evento.id
    ? String(evento.id).replace(/\//g, '_')
    : crypto.createHash('sha256').update(JSON.stringify(evento)).digest('hex').slice(0, 32);

  try {
    await db.collection('whatsappEvents').doc(docId).create({
      provider: 'ycloud',
      type: String(evento.type || 'desconocido'),
      severidad,
      receivedAt: fecha,
      eventTime: evento.createTime || null,
      wabaId: ids.wabaId,
      phoneNumberId: ids.phoneNumberId,
      phone: ids.phone,
      negocioIds,
      cuentaIds: cuentas.map((c) => c.id),
      motivo: motivoLegible(evento),
      payload: limpio(evento),
    });
  } catch (err) {
    // ALREADY_EXISTS: YCloud reintentó un evento que ya se registró.
    if (err?.code === 6 || /already exists|ALREADY_EXISTS/i.test(err?.message || '')) {
      return { duplicate: true, severidad, negocioIds };
    }
    throw err;
  }

  logger.info(`[waEvents] ${evento.type} (${severidad}) waba=${ids.wabaId || '-'} negocios=${negocioIds.join(',') || 'ninguno'}`);

  if (severidad === 'info') return { duplicate: false, severidad, negocioIds };

  // Desconexión/restricción: queda marcado en la cuenta (lo ve Super Admin).
  // La calidad solo se registra en la cuenta, sin cambiar el estado.
  await Promise.all(cuentas.map((c) => db.collection('whatsappAccounts').doc(c.id).update(
    severidad === 'calidad'
      ? { quality: evento.whatsappPhoneNumber?.qualityRating || null, qualityAt: fecha }
      : { status: severidad === 'desconectado' ? 'disconnected' : 'restricted', statusReason: motivoLegible(evento), statusAt: fecha, statusEventType: String(evento.type || '') },
  ).catch((err) => logger.warn(`[waEvents] No se pudo marcar ${c.id}:`, err.message))));

  try {
    await alertar({ severidad, type: evento.type, motivo: motivoLegible(evento), cuentas, wabaId: ids.wabaId, phone: ids.phone });
  } catch (err) {
    logger.error('[waEvents] No se pudo enviar el aviso:', err.message);
  }
  return { duplicate: false, severidad, negocioIds };
}

/**
 * Llega un mensaje (del cliente o eco de la app) por una cuenta YCloud:
 *  - si estaba marcada como desconectada, se limpia (volvió a funcionar);
 *  - si no tenía wabaId, se guarda (para asociar eventos futuros).
 * Como máximo una lectura por cuenta cada 10 min.
 */
const REVISION_MS = 10 * 60 * 1000;
const revisadas = new Map();
export async function notarActividadCuenta(cuentaId, { wabaId } = {}, ahora = Date.now()) {
  if (!cuentaId || ahora - (revisadas.get(cuentaId) || 0) < REVISION_MS) return;
  revisadas.set(cuentaId, ahora);
  const ref = db.collection('whatsappAccounts').doc(cuentaId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const d = snap.data() || {};
  const cambios = {};
  if (d.status) Object.assign(cambios, { status: null, statusReason: null, statusAt: new Date(ahora).toISOString(), statusEventType: null });
  if (wabaId && !d.wabaId) cambios.wabaId = String(wabaId);
  if (Object.keys(cambios).length) {
    await ref.update(cambios);
    if (d.status) logger.info(`[waEvents] ${cuentaId} volvió a recibir mensajes: se quita "${d.status}".`);
  }
}

/** Solo para pruebas. */
export function _resetRevisadas() { revisadas.clear(); }
