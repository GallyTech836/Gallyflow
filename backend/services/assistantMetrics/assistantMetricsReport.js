// assistantMetricsReport.js
//
// Arma lo que muestra Super Admin en "Asistente WhatsApp / Consumo".
// Solo LEE: uso/{AAAA-MM} (contadores) y citas del mes. No modifica datos
// históricos. Lo anterior a la fecha de inicio de medición se informa aparte
// como "pruebas" y no entra en las métricas.

import { db } from '../../config/firebase.js';
import { invalidateNegocioAccess } from '../capabilities/capabilityService.js';
import {
  CATEGORIAS, dayKey, normalizeConfig, trackingState, isValidDate,
} from './assistantMetrics.js';

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MESES_HISTORIAL = 12;

export class MetricsError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const isValidMonth = (mes) => MES_RE.test(String(mes || ''));

function ultimoDiaDelMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(dias).padStart(2, '0')}`;
}

function fechasEntre(desde, hasta) {
  const out = [];
  const d = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  while (d <= fin) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const redondear = (v, dec = 1) => Math.round(v * 10 ** dec) / 10 ** dec;

/**
 * Qué parte del mes cuenta como consumo real:
 *   'ninguno'  -> sin fecha de inicio, o empieza después de este mes (todo es prueba)
 *   'completo' -> la medición empezó antes o el primer día del mes
 *   'parcial'  -> la fecha de inicio cae dentro del mes
 */
export function alcanceDelMes(mes, startDate) {
  const primerDia = `${mes}-01`;
  const ultimoDia = ultimoDiaDelMes(mes);
  if (!startDate || startDate > ultimoDia) return { alcance: 'ninguno', desde: null, primerDia, ultimoDia };
  if (startDate <= primerDia) return { alcance: 'completo', desde: primerDia, primerDia, ultimoDia };
  return { alcance: 'parcial', desde: startDate, primerDia, ultimoDia };
}

/** Métricas que salen solo del documento de uso (sin citas). */
export function resumenDeUso(mes, uso = {}, startDate) {
  const { alcance, desde, primerDia, ultimoDia } = alcanceDelMes(mes, startDate);
  const asis = uso.asistente || {};
  const dias = asis.dias || {};
  const real = (fecha) => alcance !== 'ninguno' && fecha >= desde;

  const porDia = Object.entries(dias)
    .filter(([dd]) => /^\d{2}$/.test(dd))
    .map(([dd, v]) => ({ fecha: `${mes}-${dd}`, ...v }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const totalMes = num(uso.whatsappMensajes);
  const enviadosDiariosReales = porDia.filter((d) => real(d.fecha)).reduce((a, d) => a + num(d.enviados), 0);
  let enviados = 0;
  let fuenteEnviados = null;
  if (alcance === 'completo') { enviados = totalMes; fuenteEnviados = 'mensual'; }
  if (alcance === 'parcial') { enviados = enviadosDiariosReales; fuenteEnviados = 'diario'; }
  const enviadosPruebas = Math.max(0, totalMes - enviados);

  const entrantes = porDia.filter((d) => real(d.fecha)).reduce((a, d) => a + num(d.entrantes), 0);
  const entrantesDesde = porDia.find((d) => real(d.fecha) && num(d.entrantes) > 0)?.fecha || null;
  const diarioDesde = porDia.find((d) => num(d.enviados) > 0 || num(d.entrantes) > 0)?.fecha || null;

  const conversaciones = Object.fromEntries(CATEGORIAS.map((c) => [c, 0]));
  for (const d of porDia.filter((x) => real(x.fecha))) {
    for (const c of CATEGORIAS) conversaciones[c] += num(d.conversaciones?.[c]);
  }
  for (const c of CATEGORIAS) conversaciones[c] = Math.max(0, conversaciones[c]);
  const totalConv = CATEGORIAS.reduce((a, c) => a + conversaciones[c], 0);

  return {
    alcance, desde, primerDia, ultimoDia, porDia,
    mensajes: {
      enviados, entrantes, interacciones: enviados + entrantes,
      enviadosPruebas, totalMes, fuenteEnviados, entrantesDesde, diarioDesde,
      rechazados: num(uso.rechazados?.whatsappMensajes),
    },
    conversaciones: { ...conversaciones, total: totalConv, sinReserva: totalConv - conversaciones.reserva },
  };
}

async function leerNegocio(negocioId) {
  const snap = await db.collection('negocios').doc(String(negocioId)).get();
  if (!snap.exists) throw new MetricsError(404, 'Negocio no encontrado.');
  return snap.data();
}

/** Reservas del mes (por fecha de la cita): totales y por el asistente. */
async function reservasDelMes(negocioId, desde, hasta, startDate) {
  const snap = await db.collection('negocios').doc(String(negocioId)).collection('citas')
    .where('date', '>=', desde)
    .where('date', '<=', hasta)
    .get();
  let total = 0;
  let asistente = 0;
  snap.docs.forEach((d) => {
    const c = d.data();
    // Registros de Nexus Control y citas canceladas no son reservas.
    if (c.origin === 'registro' || c.status === 'cancelled') return;
    total += 1;
    if (c.bookedBy !== 'assistant') return;
    // Reserva por WhatsApp hecha durante las pruebas (antes del inicio) para un
    // día posterior: no cuenta como consumo real.
    const creada = c.createdAt ? dayKey(new Date(c.createdAt)) : null;
    if (startDate && creada && creada < startDate) return;
    asistente += 1;
  });
  return { total, asistente, porcentaje: total ? redondear((asistente / total) * 100) : null };
}

/** Informe de un mes para Super Admin. */
export async function buildMonthReport(negocioId, mes, { hoy = dayKey() } = {}) {
  if (!isValidMonth(mes)) throw new MetricsError(400, 'Mes inválido (usa AAAA-MM).');
  const negocio = await leerNegocio(negocioId);
  const config = normalizeConfig(negocio.assistantMetrics);
  const usoSnap = await db.collection('negocios').doc(String(negocioId)).collection('uso').doc(mes).get();
  const r = resumenDeUso(mes, usoSnap.exists ? usoSnap.data() : {}, config.startDate);

  // Con alcance "ninguno" se muestran igual las reservas del mes, marcadas como pruebas.
  const desdeReservas = r.alcance === 'ninguno' ? r.primerDia : r.desde;
  const reservas = await reservasDelMes(negocioId, desdeReservas, r.ultimoDia, r.alcance === 'ninguno' ? null : config.startDate);

  const hasta = r.ultimoDia < hoy ? r.ultimoDia : hoy;
  const diasMedidos = r.alcance === 'ninguno' || r.desde > hasta ? 0 : fechasEntre(r.desde, hasta).length;
  const porFecha = Object.fromEntries(r.porDia.map((d) => [d.fecha, d]));
  const diario = r.primerDia > hasta ? [] : fechasEntre(r.primerDia, hasta).map((fecha) => ({
    fecha,
    enviados: num(porFecha[fecha]?.enviados),
    entrantes: num(porFecha[fecha]?.entrantes),
    real: r.alcance !== 'ninguno' && fecha >= r.desde,
  }));

  const medible = r.alcance !== 'ninguno';
  return {
    negocioId,
    mes,
    hoy,
    config,
    estado: trackingState(config, hoy),
    alcance: r.alcance,
    desde: r.desde,
    mensajes: r.mensajes,
    conversaciones: r.conversaciones,
    reservas,
    promedioEnviadosPorReserva: medible && reservas.asistente ? redondear(r.mensajes.enviados / reservas.asistente, 2) : null,
    promedioDiarioEnviados: diasMedidos ? redondear(r.mensajes.enviados / diasMedidos) : null,
    diasMedidos,
    diario,
  };
}

/** Últimos meses con uso registrado (sin leer citas). */
export async function buildHistory(negocioId, { hoy = dayKey() } = {}) {
  const negocio = await leerNegocio(negocioId);
  const config = normalizeConfig(negocio.assistantMetrics);
  const snap = await db.collection('negocios').doc(String(negocioId)).collection('uso').get();
  const meses = snap.docs
    .filter((d) => isValidMonth(d.id) && d.id <= hoy.slice(0, 7))
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, MESES_HISTORIAL)
    .map((d) => {
      const r = resumenDeUso(d.id, d.data(), config.startDate);
      return {
        mes: d.id,
        alcance: r.alcance,
        enviados: r.mensajes.enviados,
        enviadosPruebas: r.mensajes.enviadosPruebas,
        entrantes: r.mensajes.entrantes,
        conversaciones: r.conversaciones.total,
        conReserva: r.conversaciones.reserva,
      };
    });
  return { negocioId, config, estado: trackingState(config, hoy), meses };
}

/**
 * Super Admin cambia la fecha de inicio y/o pausa el seguimiento.
 * body: { startDate?: 'AAAA-MM-DD' | null, enabled?: boolean }
 * No borra ni recalcula datos: solo cambia desde cuándo se consideran reales.
 */
export async function setTrackingConfig(negocioId, body = {}, actorEmail = null, { hoy = dayKey() } = {}) {
  const ref = db.collection('negocios').doc(String(negocioId));
  const negocio = await leerNegocio(negocioId);
  const actual = normalizeConfig(negocio.assistantMetrics);
  const next = { ...actual };

  if (Object.prototype.hasOwnProperty.call(body, 'startDate')) {
    if (body.startDate !== null && !isValidDate(body.startDate)) {
      throw new MetricsError(400, 'Fecha de inicio inválida (usa AAAA-MM-DD).');
    }
    next.startDate = body.startDate;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'enabled')) {
    if (typeof body.enabled !== 'boolean') throw new MetricsError(400, 'enabled debe ser true o false.');
    next.enabled = body.enabled;
  }

  await ref.update({
    assistantMetrics: {
      startDate: next.startDate,
      enabled: next.enabled,
      updatedAt: new Date().toISOString(),
      updatedBy: actorEmail || null,
    },
  });
  invalidateNegocioAccess(String(negocioId)); // el webhook ve el cambio al instante
  return { config: next, estado: trackingState(next, hoy), antes: actual };
}
