// subscriptionNoticeModel.js — Aviso de vencimiento de suscripción / prueba.
//
// Funciones puras (sin Firestore). Usa el mismo criterio de día que
// computeEffectiveStatus: días calendario en hora de La Paz y el día del
// vencimiento todavía está activo (= 0 días restantes).
//
// Tramos:
//   faltan 7 o 6 días  => tramo '7'
//   faltan 5 a 0 días  => tramo '5'
//   más de 7, sin fecha o negocio bloqueado => sin aviso
//
// Lo aceptado se guarda por período (tipo + fecha de vencimiento), así que al
// renovar (fecha nueva) los avisos vuelven a salir solos.

import {
  computeEffectiveStatus, isBlockedStatus, laPazDateKey, expiryDateKey,
} from '../capabilities/capabilityModel.js';

export const TRAMOS = ['7', '5'];

/** Días entre dos días "AAAA-MM-DD" (to - from). */
export function daysBetween(fromKey, toKey) {
  const toUtc = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / 864e5);
}

export function tramoForDays(dias) {
  if (dias === 7 || dias === 6) return '7';
  if (dias >= 0 && dias <= 5) return '5';
  return null;
}

/** Período que manda: en prueba, trialEnd; si no, subscriptionEnd. */
export function noticePeriod(negocio) {
  const tipo = (negocio?.status || 'active') === 'trial' ? 'trial' : 'subscription';
  const fechaVencimiento = expiryDateKey(tipo === 'trial' ? negocio?.trialEnd : negocio?.subscriptionEnd);
  return fechaVencimiento ? { tipo, fechaVencimiento } : null;
}

export function periodDocId({ tipo, fechaVencimiento }) {
  return `${tipo}_${fechaVencimiento}`;
}

/**
 * Tramo vigente hoy, sin mirar lo ya aceptado.
 * Devuelve { tramo, diasRestantes, tipo, fechaVencimiento } o null.
 */
export function currentTramo(negocio, now = new Date()) {
  if (!negocio) return null;
  const effective = computeEffectiveStatus(negocio.status, negocio.subscriptionEnd || null, negocio.trialEnd || null, now);
  if (isBlockedStatus(effective)) return null;
  const period = noticePeriod(negocio);
  if (!period) return null;
  const diasRestantes = daysBetween(laPazDateKey(now), period.fechaVencimiento);
  const tramo = tramoForDays(diasRestantes);
  if (!tramo) return null;
  return { tramo, diasRestantes, ...period };
}

/**
 * Aviso a mostrar hoy. `registro` = documento de avisosVencimiento del período
 * (o null). Si el tramo vigente ya fue aceptado, no hay aviso. Si se saltó el
 * 7 y ya está en el 5, solo sale el 5.
 */
export function computeNotice(negocio, registro, now = new Date()) {
  const cur = currentTramo(negocio, now);
  if (!cur) return { show: false };
  if (registro?.[`aviso${cur.tramo}`]) return { show: false };
  return { show: true, ...cur };
}

/** "59170000000" — solo dígitos, con código de país. */
export function normalizeWhatsapp(raw) {
  if (raw == null) return '';
  return String(raw).trim().replace(/^\+/, '').replace(/[\s-]/g, '');
}

export function isValidWhatsapp(digits) {
  return digits === '' || /^\d{8,15}$/.test(digits);
}

export function buildWhatsappUrl(numero, nombreNegocio) {
  if (!numero) return null;
  const texto = `Hola, soy de ${nombreNegocio}. Quiero renovar mi suscripción de Nexus.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export function businessNameOf(negocio, fallback = '') {
  return negocio?.heroConfig?.businessName || negocio?.nombre || negocio?.name || fallback;
}
