// anticipoService.js — Anticipos por QR.
//
// Flujo:
//   1. Reserva del link público: si el negocio tiene la capacidad 'anticipos' y
//      la configuración lista, la cita se crea 'pending' con deposit.awaiting y
//      un vencimiento (createAppointment). Ocupa el horario hasta que vence.
//   2. El cliente paga con el QR del negocio y avisa por WhatsApp.
//   3. El dueño confirma en el modal de la reserva -> deposit.paid, cita 'confirmed'.
//      O la rechaza -> cita cancelada, horario libre.
//   2b. Si el cliente toca "Ya pagué" (reportPaid), el horario se guarda
//      verifyMinutes más para que el dueño confirme, y al dueño le llega un aviso.
//   4. Si no se confirma a tiempo, la cita se cancela sola: el revisor
//      (sweepHolds, cada minuto, con la colección anticipoHolds) o cuando
//      alguien mira horarios, reserva o abre la agenda (expireHolds).
//   5. Si una cita con anticipo pagado se cancela (o el cliente no vino), el
//      dueño decide: devolverlo (refunded) o quedárselo (retained = ingreso).
//
// Los campos deposit.* los escribe solo el backend.

import { db } from '../../config/firebase.js';
import * as capabilities from '../capabilities/capabilityService.js';
import * as whatsappProvider from '../providers/whatsappProvider.js';
import { normalizeAnticipoConfig, anticipoReady, holdExpired, DEPOSIT_STATUS } from './anticipoModel.js';
import { sendNotification } from '../notificationService.js';
import { logger } from '../../utils/logger.js';
import { crearVoz } from '../assistantEngine/personalidad.js';

// ───────────── Mensaje al cliente por WhatsApp (reservas del asistente) ─────────────

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function diaLargo(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '';
  const f = new Date(`${date}T12:00:00Z`);
  return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()} ${MESES[f.getUTCMonth()]}`;
}

const CLAVE = { ANTICIPO_CONFIRMADO: 'confirmado', ANTICIPO_RECHAZADO: 'rechazado', ANTICIPO_VENCIDO: 'vencido' };

/** Mensaje al cliente con el tono de la personalidad del asistente (assistantConfig.personalidad). */
export function mensajeCliente(tipo, cita, personalidad = null) {
  if (!CLAVE[tipo]) return '';
  const cuando = `${diaLargo(cita.date)} a las ${cita.time}`;
  const monto = cita.deposit?.amount ? ` de Bs ${cita.deposit.amount}` : '';
  return crearVoz(personalidad).anticipo(CLAVE[tipo], { monto, cuando });
}

/** Cuenta de WhatsApp del negocio para escribirle al cliente (la de su sucursal si hay varias). */
async function cuentaWhatsApp(negocioId, branch) {
  const snap = await db.collection('whatsappAccounts').where('negocioId', '==', negocioId).get();
  const cuentas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const c = cuentas.find((x) => branch && x.branch === branch) || cuentas[0];
  if (c) return { phoneNumberId: c.id, token: c.token || null, provider: c.provider || 'meta', from: c.phone || null };
  const neg = (await negRef(negocioId).get()).data() || {};
  return neg.whatsappPhoneNumberId ? { phoneNumberId: neg.whatsappPhoneNumberId, token: null, provider: 'meta', from: null } : null;
}

/**
 * Si la reserva se hizo por el asistente, le escribe al cliente cómo quedó.
 * Dentro de las 24 h desde su último mensaje, WhatsApp permite el mensaje libre.
 */
async function avisarCliente(tipo, negocioId, cita) {
  if (cita.bookedBy !== 'assistant' || !cita.clientPhone || cita.clientPhone === 'No especificado') return;
  if (!CLAVE[tipo]) return;
  try {
    const neg = (await negRef(negocioId).get()).data() || {};
    const texto = mensajeCliente(tipo, cita, neg.assistantConfig?.personalidad);
    const permiso = await capabilities.checkCapability(negocioId, 'asistenteWhatsapp');
    if (!permiso.allowed) return;
    const envio = await cuentaWhatsApp(negocioId, cita.branch);
    if (!envio) return;
    await whatsappProvider.send(cita.clientPhone, texto, envio);
    // Cuenta como mensaje enviado (consumo del plan), igual que las respuestas del bot.
    await Promise.all([
      capabilities.incrementUsage?.(negocioId, 'whatsappMensajes', 1),
      capabilities.incrementClientUsage?.(negocioId, cita.clientPhone),
    ]).catch(() => {});
  } catch (err) {
    logger.warn('[anticipos] mensaje al cliente falló:', err.message);
  }
}

/**
 * Aviso push del anticipo (best-effort: si falla, la operación ya quedó hecha).
 *   ANTICIPO_CONFIRMADO / ANTICIPO_RECHAZADO -> al profesional (el dueño lo hizo)
 *   ANTICIPO_VENCIDO                         -> al dueño y al profesional
 */
async function avisar(tipo, negocioId, cita, { actorUid = null, soloProfesional = false, comprobante = false } = {}) {
  const pro = cita.professionalId || cita.barberId;
  const conPro = pro && pro !== 'pending' && tipo !== 'ANTICIPO_REPORTADO'; // "ya pagué": solo al dueño
  if (soloProfesional && !conPro) return;
  try {
    await sendNotification({
      tipo,
      negocioId,
      data: { clientName: cita.clientName, time: cita.time, date: cita.date, amount: cita.deposit?.amount, ...(comprobante ? { comprobante: true } : {}) },
      actorUid,
      ...(conPro ? { targetProfessionalId: pro } : { targetProfessionalIds: tipo === 'ANTICIPO_REPORTADO' ? [] : undefined }),
      ...(soloProfesional ? { onlyTargetProfessional: true } : {}),
    });
  } catch (err) {
    logger.warn('[anticipos] aviso falló:', err.message);
  }
}

export class AnticipoError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const negRef = (id) => db.collection('negocios').doc(id);
// anticipoHolds/{negocioId_citaId} = { negocioId, citaId, expiresAt }: solo backend.
const holdRef = (negocioId, citaId) => db.collection('anticipoHolds').doc(`${negocioId}_${citaId}`);
const dropHold = (negocioId, citaId) => holdRef(negocioId, citaId).delete().catch(() => {});
const actorInfo = (actor) => ({ uid: actor?.uid || null, email: actor?.email || null });

/** Configuración de anticipos lista para usar, o null si el negocio no pide anticipos. */
export async function getAnticipoConfig(negocioId, negocioData = null) {
  const data = negocioData || (await negRef(negocioId).get()).data() || {};
  const bs = data.businessSettings || {};
  if (bs.anticipos?.enabled !== true) return null;
  const cap = await capabilities.checkCapability(negocioId, 'anticipos', { checkLimit: false });
  if (!cap.allowed) return null;
  const cfg = normalizeAnticipoConfig(bs.anticipos, bs.paymentMethods || []);
  return anticipoReady(cfg) ? cfg : null;
}

/**
 * Cancela las reservas que esperaban anticipo y vencieron (libera el horario).
 * Barato: una consulta por igualdad sobre deposit.status.
 */
export async function expireHolds(negocioId, nowMs = Date.now()) {
  const snap = await negRef(negocioId).collection('citas').where('deposit.status', '==', DEPOSIT_STATUS.AWAITING).get();
  const vencidas = snap.docs.filter((d) => holdExpired({ id: d.id, ...d.data() }, nowMs));
  if (!vencidas.length) return 0;
  const at = new Date(nowMs).toISOString();
  const canceladas = await Promise.all(vencidas.map((d) => db.runTransaction(async (tx) => {
    const s = await tx.get(d.ref);
    const c = s.data();
    if (!holdExpired({ id: s.id, ...c }, nowMs)) return null; // alguien la confirmó justo ahora
    tx.update(d.ref, {
      status: 'cancelled', cancelledBy: 'system', cancelledReason: 'anticipo_vencido', cancelledAt: at, updatedAt: at,
      deposit: { ...c.deposit, status: DEPOSIT_STATUS.EXPIRED, resolvedAt: at },
    });
    return c;
  })));
  const hechas = canceladas.filter(Boolean);
  vencidas.forEach((d) => dropHold(negocioId, d.id));
  await Promise.all(hechas.map((c) => Promise.all([avisar('ANTICIPO_VENCIDO', negocioId, c), avisarCliente('ANTICIPO_VENCIDO', negocioId, c)])));
  return hechas.length;
}

/**
 * Revisor (cada minuto, desde server.js): cancela apenas vencen las reservas
 * que esperaban anticipo, en todos los negocios, y avisa. Lee solo
 * anticipoHolds vencidos (índice de un campo, automático).
 */
export async function sweepHolds(nowMs = Date.now()) {
  const snap = await db.collection('anticipoHolds').where('expiresAt', '<=', new Date(nowMs).toISOString()).limit(200).get();
  if (snap.empty) return 0;
  const negocios = [...new Set(snap.docs.map((d) => d.data().negocioId).filter(Boolean))];
  let total = 0;
  for (const n of negocios) total += await expireHolds(n, nowMs).catch((err) => { logger.warn('[anticipos] revisor:', err.message); return 0; });
  await Promise.all(snap.docs.map((d) => d.ref.delete().catch(() => {})));
  return total;
}

export function startAnticipoSweeper(everyMs = 60 * 1000) {
  if (process.env.ANTICIPOS_SWEEPER === 'false') return;
  setInterval(() => { sweepHolds().catch((err) => logger.warn('[anticipos] revisor:', err.message)); }, everyMs);
}

/**
 * El cliente avisa que ya pagó (botón "Ya pagué" de la página de pago).
 * Público, pero solo sirve una vez, para una reserva que todavía espera el
 * anticipo y sin vencer. Alarga el vencimiento verifyMinutes y avisa al dueño.
 */
export async function reportPaid(negocioId, citaId, { receipt = null } = {}) {
  const cfg = await getAnticipoConfig(negocioId);
  const extra = (cfg?.verifyMinutes || 120) * 60000;
  const now = Date.now();
  const at = new Date(now).toISOString();
  const r = await withCita(negocioId, citaId, (tx, ref, c) => {
    const d = c.deposit;
    if (!d || d.status !== DEPOSIT_STATUS.AWAITING || c.status !== 'pending') throw new AnticipoError(409, 'Esta reserva ya no espera el anticipo.', 'NOT_AWAITING');
    if (!d.reportedAt && holdExpired(c, now)) throw new AnticipoError(409, 'Se acabó el tiempo para pagar y el horario se liberó.', 'EXPIRED');
    // Comprobante (foto o PDF por WhatsApp): se guarda aunque ya hubiera avisado antes.
    // Sin url (número con Meta directo): queda la hora en que llegó, para que el dueño lo busque en el chat.
    const conComprobante = receipt ? { ...(receipt.url ? { receiptUrl: receipt.url } : {}), receiptType: receipt.type || 'image', receiptAt: at } : {};
    if (d.reportedAt && !receipt) return { expiresAt: d.expiresAt, reportedAt: d.reportedAt };
    const deposit = d.reportedAt
      ? { ...d, ...conComprobante }
      : { ...d, ...conComprobante, reportedAt: at, expiresAt: new Date(now + extra).toISOString() };
    tx.update(ref, { deposit, updatedAt: at });
    if (!d.reportedAt) tx.set(holdRef(negocioId, ref.id), { negocioId, citaId: ref.id, expiresAt: deposit.expiresAt });
    return { expiresAt: deposit.expiresAt, reportedAt: deposit.reportedAt, _cita: { ...c, deposit }, _primero: !d.reportedAt };
  });
  const { _cita, _primero, ...out } = r;
  // Aviso al dueño: la primera vez, o cuando llega el comprobante.
  if (_cita && (_primero || receipt)) await avisar('ANTICIPO_REPORTADO', negocioId, _cita, { comprobante: !!receipt });
  return out;
}

async function withCita(negocioId, citaId, fn) {
  const ref = negRef(negocioId).collection('citas').doc(String(citaId || ''));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AnticipoError(404, 'Esa reserva no existe.', 'NOT_FOUND');
    return fn(tx, ref, { id: snap.id, ...snap.data() });
  });
}

/** El dueño confirma que llegó el anticipo: la reserva queda confirmada. */
export async function confirmDeposit(negocioId, citaId, { actor }) {
  const at = new Date().toISOString();
  return withCita(negocioId, citaId, (tx, ref, c) => {
    const d = c.deposit;
    if (!d) throw new AnticipoError(409, 'Esta reserva no pide anticipo.', 'NO_DEPOSIT');
    if (d.status === DEPOSIT_STATUS.PAID) return { status: c.status, deposit: d }; // doble clic
    if (d.status !== DEPOSIT_STATUS.AWAITING || c.status !== 'pending') {
      throw new AnticipoError(409, 'Esta reserva ya no espera el anticipo.', 'NOT_AWAITING');
    }
    if (holdExpired(c)) {
      throw new AnticipoError(409, 'La reserva venció y el horario ya se liberó. Si el cliente pagó, crea la cita de nuevo.', 'EXPIRED');
    }
    const deposit = { ...d, status: DEPOSIT_STATUS.PAID, paidAt: at, verifiedBy: actorInfo(actor) };
    tx.update(ref, { status: 'confirmed', deposit, updatedAt: at });
    return { status: 'confirmed', deposit, _cita: { ...c, deposit } };
  }).then(async ({ _cita, ...r }) => {
    dropHold(negocioId, citaId);
    if (_cita) await Promise.all([avisar('ANTICIPO_CONFIRMADO', negocioId, _cita, { actorUid: actor?.uid, soloProfesional: true }), avisarCliente('ANTICIPO_CONFIRMADO', negocioId, _cita)]);
    return r;
  });
}

/** El dueño rechaza: no llegó el pago. La reserva se cancela y el horario queda libre. */
export async function rejectDeposit(negocioId, citaId, { actor }) {
  const at = new Date().toISOString();
  return withCita(negocioId, citaId, (tx, ref, c) => {
    const d = c.deposit;
    if (!d || d.status !== DEPOSIT_STATUS.AWAITING) throw new AnticipoError(409, 'Esta reserva ya no espera el anticipo.', 'NOT_AWAITING');
    const deposit = { ...d, status: DEPOSIT_STATUS.REJECTED, resolvedAt: at, resolvedBy: actorInfo(actor) };
    tx.update(ref, { status: 'cancelled', cancelledBy: 'admin', cancelledReason: 'anticipo_rechazado', cancelledAt: at, deposit, updatedAt: at });
    return { status: 'cancelled', deposit, _cita: { ...c, deposit } };
  }).then(async ({ _cita, ...r }) => {
    dropHold(negocioId, citaId);
    if (_cita) await Promise.all([avisar('ANTICIPO_RECHAZADO', negocioId, _cita, { actorUid: actor?.uid, soloProfesional: true }), avisarCliente('ANTICIPO_RECHAZADO', negocioId, _cita)]);
    return r;
  });
}

/**
 * Cita cancelada (o el cliente no vino) con el anticipo pagado: el dueño decide.
 *   refund  se le devuelve al cliente (sale de la cuenta donde entró)
 *   retain  el negocio se lo queda: cuenta como ingreso, sin comisión
 */
export async function resolveDeposit(negocioId, citaId, { decision, actor }) {
  if (!['refund', 'retain'].includes(decision)) throw new AnticipoError(400, 'Elige si lo devuelves o te lo quedas.', 'DECISION');
  const at = new Date().toISOString();
  return withCita(negocioId, citaId, (tx, ref, c) => {
    const d = c.deposit;
    const final = decision === 'refund' ? DEPOSIT_STATUS.REFUNDED : DEPOSIT_STATUS.RETAINED;
    if (d?.status === final) return { status: c.status, deposit: d };
    if (!d || d.status !== DEPOSIT_STATUS.PAID) throw new AnticipoError(409, 'Esta reserva no tiene un anticipo pagado.', 'NOT_PAID');
    if (c.status !== 'cancelled') throw new AnticipoError(409, 'Primero cancela la reserva.', 'NOT_CANCELLED');
    const deposit = { ...d, status: final, resolvedAt: at, resolvedBy: actorInfo(actor) };
    tx.update(ref, { deposit, updatedAt: at });
    return { status: c.status, deposit };
  });
}

/**
 * El cliente cancela por WhatsApp una reserva que espera el anticipo.
 * Solo si es suya (mismo teléfono). Libera el horario y avisa al dueño.
 */
export async function cancelByClient(negocioId, citaId, phone) {
  const at = new Date().toISOString();
  const r = await withCita(negocioId, citaId, (tx, ref, c) => {
    if (String(c.clientPhone || '') !== String(phone || '')) throw new AnticipoError(404, 'Esa reserva no existe.', 'NOT_FOUND');
    const d = c.deposit;
    if (!d || d.status !== DEPOSIT_STATUS.AWAITING || c.status !== 'pending') throw new AnticipoError(409, 'Esa reserva ya no espera el anticipo.', 'NOT_AWAITING');
    const deposit = { ...d, status: DEPOSIT_STATUS.EXPIRED, resolvedAt: at };
    tx.update(ref, { status: 'cancelled', cancelledBy: 'client', cancelledVia: 'whatsapp', cancelledReason: 'cliente_cancelo', cancelledAt: at, deposit, updatedAt: at });
    return { ...c, deposit };
  });
  dropHold(negocioId, citaId);
  try {
    const pro = r.professionalId || r.barberId;
    await sendNotification({
      tipo: 'RESERVA_CANCELADA', negocioId, data: { clientName: r.clientName, time: r.time },
      ...(pro && pro !== 'pending' ? { targetProfessionalId: pro } : {}),
    });
  } catch (err) { logger.warn('[anticipos] aviso falló:', err.message); }
  return r;
}

/** Reserva de este teléfono que espera el anticipo (la más reciente), o null. */
export async function findAwaitingByPhone(negocioId, phone) {
  const snap = await negRef(negocioId).collection('citas').where('deposit.status', '==', DEPOSIT_STATUS.AWAITING).get();
  const mias = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.status === 'pending' && String(c.clientPhone || '') === String(phone || '') && !holdExpired(c))
    .sort((a, b) => String(b.deposit?.createdAt || '').localeCompare(String(a.deposit?.createdAt || '')));
  return mias[0] || null;
}
