// anticipoService.js — Anticipos por QR.
//
// Flujo:
//   1. Reserva del link público: si el negocio tiene la capacidad 'anticipos' y
//      la configuración lista, la cita se crea 'pending' con deposit.awaiting y
//      un vencimiento (createAppointment). Ocupa el horario hasta que vence.
//   2. El cliente paga con el QR del negocio y avisa por WhatsApp.
//   3. El dueño confirma en el modal de la reserva -> deposit.paid, cita 'confirmed'.
//      O la rechaza -> cita cancelada, horario libre.
//   4. Si no se confirma a tiempo, la cita se cancela sola (expireHolds) la
//      próxima vez que alguien mira horarios, reserva o abre la agenda.
//   5. Si una cita con anticipo pagado se cancela (o el cliente no vino), el
//      dueño decide: devolverlo (refunded) o quedárselo (retained = ingreso).
//
// Los campos deposit.* los escribe solo el backend.

import { db } from '../../config/firebase.js';
import { checkCapability } from '../capabilities/capabilityService.js';
import { normalizeAnticipoConfig, anticipoReady, holdExpired, DEPOSIT_STATUS } from './anticipoModel.js';
import { sendNotification } from '../notificationService.js';
import { logger } from '../../utils/logger.js';

/**
 * Aviso push del anticipo (best-effort: si falla, la operación ya quedó hecha).
 *   ANTICIPO_CONFIRMADO / ANTICIPO_RECHAZADO -> al profesional (el dueño lo hizo)
 *   ANTICIPO_VENCIDO                         -> al dueño y al profesional
 */
async function avisar(tipo, negocioId, cita, { actorUid = null, soloProfesional = false } = {}) {
  const pro = cita.professionalId || cita.barberId;
  const conPro = pro && pro !== 'pending';
  if (soloProfesional && !conPro) return;
  try {
    await sendNotification({
      tipo,
      negocioId,
      data: { clientName: cita.clientName, time: cita.time, date: cita.date, amount: cita.deposit?.amount },
      actorUid,
      ...(conPro ? { targetProfessionalId: pro } : {}),
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
const actorInfo = (actor) => ({ uid: actor?.uid || null, email: actor?.email || null });

/** Configuración de anticipos lista para usar, o null si el negocio no pide anticipos. */
export async function getAnticipoConfig(negocioId, negocioData = null) {
  const data = negocioData || (await negRef(negocioId).get()).data() || {};
  const bs = data.businessSettings || {};
  if (bs.anticipos?.enabled !== true) return null;
  const cap = await checkCapability(negocioId, 'anticipos', { checkLimit: false });
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
  await Promise.all(hechas.map((c) => avisar('ANTICIPO_VENCIDO', negocioId, c)));
  return hechas.length;
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
    if (_cita) await avisar('ANTICIPO_CONFIRMADO', negocioId, _cita, { actorUid: actor?.uid, soloProfesional: true });
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
    if (_cita) await avisar('ANTICIPO_RECHAZADO', negocioId, _cita, { actorUid: actor?.uid, soloProfesional: true });
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
