// subscriptionNoticeService.js — Lecturas/escrituras del aviso de vencimiento.
//
// negocios/{id}/avisosVencimiento/{tipo}_{fechaVencimiento}:
//   { tipo, fechaVencimiento, aviso7: {...} | null, aviso5: {...} | null }
// Solo el backend escribe esta colección (Admin SDK).
// plataforma/soporte: { whatsapp } — número de soporte de Nexus.

import { db } from '../../config/firebase.js';
import {
  computeNotice, currentTramo, periodDocId, buildWhatsappUrl, businessNameOf,
  normalizeWhatsapp, isValidWhatsapp,
} from './subscriptionNoticeModel.js';

export class NoticeError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const soporteRef = () => db.collection('plataforma').doc('soporte');
const avisosCol = (negocioId) => db.collection('negocios').doc(negocioId).collection('avisosVencimiento');

export async function getSoporteWhatsapp() {
  const snap = await soporteRef().get();
  return (snap.exists && snap.data()?.whatsapp) || '';
}

export async function setSoporteWhatsapp(raw, actorEmail) {
  if (raw != null && typeof raw !== 'string' && typeof raw !== 'number') {
    throw new NoticeError(400, 'Número inválido.', 'INVALID_WHATSAPP');
  }
  const whatsapp = normalizeWhatsapp(raw);
  if (!isValidWhatsapp(whatsapp)) {
    throw new NoticeError(400, 'Usa solo dígitos con código de país (ej. 59170000000).', 'INVALID_WHATSAPP');
  }
  await soporteRef().set({ whatsapp, updatedAt: new Date().toISOString(), updatedBy: actorEmail || null }, { merge: true });
  return { whatsapp };
}

/** GET /api/subscription-notice */
export async function getNotice(negocioId, negocio, now = new Date()) {
  const cur = currentTramo(negocio, now);
  if (!cur) return { show: false };
  const regSnap = await avisosCol(negocioId).doc(periodDocId(cur)).get();
  const notice = computeNotice(negocio, regSnap.exists ? regSnap.data() : null, now);
  if (!notice.show) return { show: false };
  const numero = await getSoporteWhatsapp();
  return {
    show: true,
    tramo: notice.tramo,
    diasRestantes: notice.diasRestantes,
    tipo: notice.tipo,
    fechaVencimiento: notice.fechaVencimiento,
    whatsappUrl: buildWhatsappUrl(numero, businessNameOf(negocio, negocioId)),
  };
}

/**
 * POST /api/subscription-notice/ack — el backend recalcula todo. Solo acepta
 * el tramo vigente del período actual. Idempotente.
 */
export async function ackNotice(negocioId, negocio, { tramo, fechaVencimiento } = {}, actor = {}, now = new Date()) {
  const cur = currentTramo(negocio, now);
  if (!cur || String(tramo) !== cur.tramo || fechaVencimiento !== cur.fechaVencimiento) {
    throw new NoticeError(409, 'El aviso ya no corresponde al período actual.', 'NOTICE_STALE');
  }
  const ref = avisosCol(negocioId).doc(periodDocId(cur));
  const key = `aviso${cur.tramo}`;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : {};
    if (prev[key]) return { ok: true, already: true };
    tx.set(ref, {
      tipo: cur.tipo,
      fechaVencimiento: cur.fechaVencimiento,
      aviso7: prev.aviso7 || null,
      aviso5: prev.aviso5 || null,
      [key]: { aceptadoAt: now.toISOString(), diasRestantes: cur.diasRestantes, email: actor.email || null },
    });
    // TODO (fuera de alcance por ahora): notificación push al Super Admin
    // avisando que este negocio aceptó el aviso (negocioId, tramo, diasRestantes).
    return { ok: true, already: false };
  });
}

function toIso(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

function normalizeAviso(a) {
  if (!a) return null;
  return { aceptadoAt: toIso(a.aceptadoAt), diasRestantes: a.diasRestantes ?? null, email: a.email || null };
}

/** GET /api/superadmin/negocios/:id/avisos-vencimiento */
export async function listNoticePeriods(negocioId) {
  const negocioSnap = await db.collection('negocios').doc(negocioId).get();
  if (!negocioSnap.exists) throw new NoticeError(404, 'Negocio no encontrado.', 'NOT_FOUND');
  const snap = await avisosCol(negocioId).get();
  const periodos = snap.docs
    .map((d) => d.data())
    .filter((p) => p?.fechaVencimiento)
    .map((p) => ({
      tipo: p.tipo === 'trial' ? 'trial' : 'subscription',
      fechaVencimiento: p.fechaVencimiento,
      aviso7: normalizeAviso(p.aviso7),
      aviso5: normalizeAviso(p.aviso5),
    }))
    .sort((a, b) => (b.fechaVencimiento.localeCompare(a.fechaVencimiento)) || a.tipo.localeCompare(b.tipo));
  return { periodos };
}
