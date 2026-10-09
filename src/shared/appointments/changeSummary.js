// changeSummary.js
//
// Redacta, en español, QUÉ cambió entre dos versiones de una cita, para la
// notificación "Reserva modificada". Función pura: la usan Admin y Barber.

import { getLabel } from './statusModel';
import { GENERIC_TERMS } from '../businessProfiles/businessProfileModel';

const txt = (v) => (v ?? '').toString().trim();

function serviceNames(cita) {
  if (Array.isArray(cita?.services) && cita.services.length > 0) {
    return cita.services.map((s) => txt(s?.serviceName)).filter(Boolean);
  }
  const single = txt(cita?.serviceName || cita?.service);
  return single ? [single] : [];
}

function professionalName(id, professionals, terms) {
  if (!id || id === 'pending') return 'Sin asignar';
  return professionals.find((p) => p?.id === id)?.name || `${terms.g('professional', 'Otro', 'Otra')} ${terms.tl('professional')}`;
}

// terms: createTerms(...) del negocio; por defecto genéricos.
export function describeAppointmentChanges(before, after, { professionals = [], terms = GENERIC_TERMS } = {}) {
  if (!before || !after) return [];
  const { t, g } = terms;
  const out = [];

  if (after.status && before.status !== after.status) {
    out.push(`Estado: ${getLabel(before.status, terms)} → ${getLabel(after.status, terms)}`);
  }

  const bNames = serviceNames(before);
  const aNames = serviceNames(after);
  const added = aNames.filter((n) => !bNames.includes(n));
  const removed = bNames.filter((n) => !aNames.includes(n));
  if (added.length && removed.length) out.push(`${t('service')}: ${bNames.join(' + ')} → ${aNames.join(' + ')}`);
  else if (added.length) out.push(`${t('service')} ${g('service', 'agregado', 'agregada')}: ${added.join(', ')}`);
  else if (removed.length) out.push(`${t('service')} ${g('service', 'quitado', 'quitada')}: ${removed.join(', ')}`);

  if (txt(before.clientName) !== txt(after.clientName) && txt(after.clientName)) {
    out.push(`${t('client')}: ${txt(before.clientName) || `Sin ${terms.tl('client')}`} → ${txt(after.clientName)}`);
  }

  if (txt(before.date) !== txt(after.date) && txt(after.date)) out.push(`Fecha: ${txt(before.date)} → ${txt(after.date)}`);
  if (txt(before.time) !== txt(after.time) && txt(after.time)) out.push(`Hora: ${txt(before.time)} → ${txt(after.time)}`);

  const bPro = before.professionalId || before.barberId || 'pending';
  const aPro = after.professionalId || after.barberId || 'pending';
  if (bPro !== aPro) {
    out.push(`${t('professional')}: ${professionalName(bPro, professionals, terms)} → ${professionalName(aPro, professionals, terms)}`);
  }

  if (before.price !== undefined && after.price !== undefined && Number(before.price) !== Number(after.price)) {
    out.push(`Precio: ${before.price} → ${after.price}`);
  }
  if (txt(after.paymentMethod) && txt(before.paymentMethod) !== txt(after.paymentMethod)) {
    out.push(`Método de pago: ${txt(after.paymentMethod)}`);
  }
  if (txt(before.notes) !== txt(after.notes)) out.push('Notas actualizadas');

  return out;
}
