// businessInfoModel.js
//
// Funciones puras (sin React ni Firebase) para la página pública
// «Más información del negocio». Solo ordenan y filtran los datos que
// ClienteApp YA cargó del negocio (servicios, profesionales, sucursales,
// horario); no hacen lecturas nuevas ni inventan datos.

import { getServiceAssignment } from '../shared/servicePricing/professionalPricing.js';
import { buildWhatsAppUrl } from '../shared/location/whatsappLink.js';
import { DEFAULT_HERO_CONFIG } from '../shared/heroConfig/heroConfigModel.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_CORTOS = { Lunes: 'Lun', Martes: 'Mar', Miércoles: 'Mié', Jueves: 'Jue', Viernes: 'Vie', Sábado: 'Sáb', Domingo: 'Dom' };

const esReal = (p) => !!p && !p.isPending && p.id !== 'pending' && p.active !== false;
const hace = (p, serviceId) => !!getServiceAssignment(p, serviceId);
const tieneServicios = (p) => Array.isArray(p?.services) && p.services.length > 0;

/**
 * Profesionales a mostrar: activos y con al menos un servicio asignado
 * (los que se pueden reservar). En el link personal (?pro=ID), solo ese.
 */
export function visibleProfessionals(professionals = [], { personalPro = null } = {}) {
  if (personalPro) return [personalPro].filter(esReal);
  return (professionals || []).filter((p) => esReal(p) && tieneServicios(p));
}

/**
 * Servicios a mostrar: los que realmente se pueden reservar, es decir, que
 * al menos un profesional visible realiza (mismo criterio que la reserva y
 * el asistente de WhatsApp). Si el negocio aún no tiene profesionales con
 * servicios, se muestran todos (igual que el flujo de reserva "Pendiente").
 */
export function visibleServices(services = [], professionals = []) {
  const pros = (professionals || []).filter(esReal);
  if (pros.length === 0 || !pros.some(tieneServicios)) return [...(services || [])];
  return (services || []).filter((s) => pros.some((p) => hace(p, s.id)));
}

/** Descripción del negocio: el eslogan, salvo que sea el texto genérico por defecto. */
export function businessDescription(heroConfig) {
  const slogan = String(heroConfig?.slogan || '').trim();
  if (!slogan || slogan === DEFAULT_HERO_CONFIG.slogan) return '';
  return slogan;
}

function textoDia(d) {
  if (!d || d.status !== 'Disponible') return 'Cerrado';
  return `${d.start || '00:00'} – ${d.end || '23:59'}`;
}

/**
 * Horario general (businessSettings.schedule) en filas agrupadas:
 * [{ days: 'Lun a Vie', hours: '09:00 – 19:00' }, ...].
 * [] si no está configurado (todo 00:00–23:59, que es el valor por defecto).
 */
export function scheduleRows(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) return [];
  const porDia = DIAS.map((day) => schedule.find((d) => d?.day === day) || null);
  const sinConfigurar = porDia.every((d) => !d || (d.status === 'Disponible' && (d.start || '00:00') === '00:00' && (d.end || '23:59') === '23:59'));
  if (sinConfigurar) return [];
  const grupos = [];
  porDia.forEach((d, i) => {
    if (!d) return;
    const hours = textoDia(d);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.hours === hours && ultimo.hasta === i - 1) ultimo.hasta = i;
    else grupos.push({ desde: i, hasta: i, hours });
  });
  return grupos.map((g) => ({
    days: g.desde === g.hasta ? DIAS_CORTOS[DIAS[g.desde]] : `${DIAS_CORTOS[DIAS[g.desde]]} a ${DIAS_CORTOS[DIAS[g.hasta]]}`,
    hours: g.hours,
  }));
}

/**
 * Sucursales a mostrar. En el link personal, la del profesional (si se
 * encuentra); si no, todas las activas.
 */
export function visibleBranches(branches = [], { personalPro = null } = {}) {
  const activas = (branches || []).filter((b) => b && b.active !== false);
  if (personalPro?.branch) {
    const propia = activas.filter((b) => b.id === personalPro.branch || b.name === personalPro.branch);
    if (propia.length) return propia;
  }
  return activas;
}

/**
 * Contactos de WhatsApp válidos (uno por número distinto), tomados del
 * teléfono de cada sucursal. Nunca de otro negocio: solo de `branches`.
 */
export function whatsappContacts(branches = []) {
  const vistos = new Set();
  const out = [];
  for (const b of branches || []) {
    const url = buildWhatsAppUrl(b?.phone);
    if (!url) continue;
    const numero = url.replace(/\?.*$/, '');
    if (vistos.has(numero)) continue;
    vistos.add(numero);
    out.push({ branchId: b.id, branchName: b.name || '', phone: b.phone });
  }
  return out;
}

/** Nombre de la sucursal de un profesional (solo si el negocio tiene varias). */
export function professionalBranchLabel(professional, branches = []) {
  if ((branches || []).length < 2 || !professional?.branch) return '';
  const b = branches.find((x) => x.id === professional.branch || x.name === professional.branch);
  return b?.name || '';
}
