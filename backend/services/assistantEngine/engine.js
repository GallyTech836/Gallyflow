// engine.js
//
// Orquestador del Assistant Engine. Fase 1: guiado por opciones, sin IA.
// Cada llamada recibe un mensaje de texto ("1", "2", "1,3", palabras clave),
// avanza el estado guardado en Firestore (assistantConversations) y devuelve
// la respuesta lista para mandar por WhatsApp.
//
// Flujos:
//   Agendar: servicio(s) → profesional (o "cualquiera" = Pendiente) → día → hora → nombre → confirmar
//   Hablar con alguien: avisa a los admins y el bot se calla en ese chat
//   (HUMAN_HANDOFF_MS) para que una persona responda; "menu" lo reactiva.

import { getBusinessContext } from '../appointments/businessContext.js';
import { getAvailableSlots } from '../appointments/availability.js';
import { createAppointment, createPendingAppointment } from '../appointments/createAppointment.js';
import { getOrCreateConversation, updateConversation, resetConversation } from '../appointments/conversationState.js';
import { professionalCanDo, PENDING_ID } from '../appointments/pendingModel.js';
import { upsertClientFromPhone } from '../appointments/clientRecord.js';
import { reevaluatePending, processPendingCita } from '../appointments/pendingService.js';
import { sendNotification } from '../notificationService.js';
import { logger } from '../../utils/logger.js';
import { db } from '../../config/firebase.js';

const SERVICE_DURATION_DEFAULT = 30;
const TZ = process.env.APP_TIMEZONE || 'America/La_Paz';
const DAY_NAMES_MON_FIRST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_A_MOSTRAR = 7;
const DIAS_A_BUSCAR = 14;
const CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min sin responder => se reinicia
const HUMAN_HANDOFF_MS = 2 * 60 * 60 * 1000; // 2 h en que el bot no responde tras pedir hablar con alguien

// ───────────────────────── Fecha/hora del negocio ─────────────────────────

// Railway corre en UTC: este Date "local" tiene la fecha/hora del negocio,
// que es lo que esperan getAvailableSlots (getHours/getDate) y proximosDias.
function ahoraNegocio() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return new Date(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
}

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fechaLegible(fechaIso) {
  const hoy = isoLocal(ahoraNegocio());
  const manana = isoLocal(new Date(ahoraNegocio().getTime() + 86400000));
  if (fechaIso === hoy) return 'hoy';
  if (fechaIso === manana) return 'mañana';
  return new Date(fechaIso + 'T12:00:00').toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'short' });
}

// ───────────────────────── Servicios y profesionales ─────────────────────────

function duracionServicio(servicio) {
  return Number(servicio?.duration) || Number(servicio?.durationMin) || SERVICE_DURATION_DEFAULT;
}

// Mismo orden que el front (compareServicios): primero `order`, luego createdAt.
function ordenServicios(a, b) {
  const ao = Number.isFinite(a?.order) ? a.order : null;
  const bo = Number.isFinite(b?.order) ? b.order : null;
  if (ao !== null && bo !== null) return ao - bo;
  if (ao !== null) return -1;
  if (bo !== null) return 1;
  return (a?.createdAt || 0) - (b?.createdAt || 0);
}

// Servicios que al menos un profesional activo realiza.
function serviciosOfrecidos(ctx) {
  return [...ctx.servicios]
    .sort(ordenServicios)
    .filter((s) => ctx.profesionales.some((p) => professionalCanDo(p, [s.id])));
}

// Profesionales que hacen TODOS los servicios elegidos.
function profesionalesPara(ctx, serviceIds) {
  return ctx.profesionales.filter((p) => professionalCanDo(p, serviceIds));
}

// "1,3" / "1 y 3" / "1 3" -> [0, 2] (índices únicos). null si alguno no existe.
function parsearIndices(texto, total) {
  const nums = (texto.match(/\d+/g) || []).map((n) => parseInt(n, 10) - 1);
  const unicos = [...new Set(nums)];
  if (unicos.length === 0 || unicos.some((i) => i < 0 || i >= total)) return null;
  return unicos;
}

// Conversaciones creadas antes de los servicios múltiples guardaban selectedService.
function serviciosDe(conv) {
  if (Array.isArray(conv.selectedServices) && conv.selectedServices.length) return conv.selectedServices;
  return conv.selectedService ? [conv.selectedService] : [];
}

function totalDuracion(conv) {
  return serviciosDe(conv).reduce((acc, s) => acc + (Number(s.duration) || SERVICE_DURATION_DEFAULT), 0);
}

function nombresServicios(conv) {
  return serviciosDe(conv).map((s) => s.serviceName).join(' + ');
}

// Profesionales a considerar según lo elegido: uno concreto, o todos los
// candidatos si eligió "cualquier profesional".
function prosElegidos(ctx, conv) {
  const staff = conv.selectedStaff;
  if (!staff) return [];
  const ids = staff.id === PENDING_ID ? staff.candidateIds || [] : [staff.id];
  return ids.map((id) => ctx.profesionales.find((p) => p.id === id)).filter(Boolean);
}

// Opciones "Cualquier profesional": una por sucursal con 2+ profesionales que
// hacen los servicios. La cita Pendiente se guarda con esa sucursal (la agenda
// de AdminApp filtra por sucursal) y solo compiten candidatos de esa sucursal.
function opcionesCualquiera(pros) {
  const porSucursal = new Map();
  for (const p of pros) {
    const b = p.branch || '';
    if (!porSucursal.has(b)) porSucursal.set(b, []);
    porSucursal.get(b).push(p.id);
  }
  const grupos = [...porSucursal.entries()].filter(([, ids]) => ids.length > 1);
  return grupos.map(([branch, ids]) => ({
    branch,
    candidateIds: ids,
    label: grupos.length > 1 && branch ? `Cualquier profesional (${branch})` : 'Cualquier profesional',
  }));
}

// ───────────────────────── Días y horas ─────────────────────────

// Próximos días en que: el negocio abre, al menos uno de `pros` trabaja y
// TODOS los servicios se ofrecen ese día.
function proximosDias(ctx, pros, servicios) {
  const schedule = ctx.businessSettings?.schedule || [];
  const base = ahoraNegocio();
  const dias = [];
  for (let i = 0; i < DIAS_A_BUSCAR && dias.length < DIAS_A_MOSTRAR; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12);
    const dayName = DAY_NAMES_MON_FIRST[(d.getDay() + 6) % 7];

    const negocioDia = schedule.find((x) => x?.day === dayName);
    if (negocioDia && negocioDia.status !== 'Disponible') continue;
    const algunoTrabaja = pros.some((p) => {
      const proDia = (p?.availability || []).find((x) => x?.day === dayName);
      return proDia && proDia.status === 'Disponible';
    });
    if (!algunoTrabaja) continue;
    const serviciosOk = servicios.every((s) => !s?.availableDays?.length || s.availableDays.includes(dayName));
    if (!serviciosOk) continue;

    const etiqueta = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'short' });
    dias.push({ id: isoLocal(d), label: etiqueta });
  }
  return dias;
}

function diasParaConversacion(ctx, conv) {
  const ids = serviciosDe(conv).map((s) => s.serviceId);
  const servicios = ids.map((id) => ctx.servicios.find((s) => s.id === id)).filter(Boolean);
  return proximosDias(ctx, prosElegidos(ctx, conv), servicios);
}

// Horas libres: de un profesional, o la unión de los candidatos (Pendiente).
async function slotsParaFecha(ctx, pros, fecha, duracion) {
  const negocioRef = db.collection('negocios').doc(ctx.negocioId);
  const [citasSnap, bloqueosSnap] = await Promise.all([
    negocioRef.collection('citas').where('date', '==', fecha).get(),
    negocioRef.collection('horariosBloqueados').where('date', '==', fecha).get(),
  ]);
  const citas = citasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const bloqueos = bloqueosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const ahora = ahoraNegocio();

  const todas = new Set();
  for (const profesional of pros) {
    getAvailableSlots({
      fecha,
      serviceDuration: duracion,
      profesional,
      citasDelNegocio: citas,
      bloqueos,
      businessSchedule: ctx.businessSettings?.schedule || [],
      aplicarAnticipacion: true,
      minAdvanceMinutes: ctx.businessSettings?.minAdvanceMinutes || 0,
      ahora,
    }).forEach((h) => todas.add(h));
  }
  return [...todas].sort();
}

// ───────────────────────── Avisos ─────────────────────────

// Cita con profesional: push al profesional + reevaluar Pendientes del día.
function avisarNuevaCita(negocioId, cita) {
  sendNotification({
    tipo: 'RESERVA_CREADA_CLIENTE',
    negocioId,
    data: { clientName: cita.clientName, time: cita.time },
    targetProfessionalId: cita.professionalId,
  }).catch((err) => logger.warn('[assistantEngine] Push falló:', err.message));

  // Este profesional se ocupó: alguna Pendiente puede quedar con un único candidato.
  reevaluatePending({ negocioId, date: cita.date })
    .catch((err) => logger.warn('[assistantEngine] reevaluatePending falló:', err.message));
}

// Cita Pendiente: el backend asigna (si hay un único candidato) o avisa a los
// candidatos. Si falla, se avisa solo a los admins (igual que ClienteApp).
async function procesarPendiente(negocioId, cita) {
  try {
    return await processPendingCita({ negocioId, citaId: cita.id });
  } catch (err) {
    logger.warn('[assistantEngine] processPendingCita falló:', err.message);
    sendNotification({
      tipo: 'RESERVA_CREADA_CLIENTE',
      negocioId,
      data: { clientName: cita.clientName, time: cita.time },
      targetProfessionalIds: [],
    }).catch(() => {});
    return null;
  }
}

// Aviso a los admins de que un cliente pidió hablar con alguien.
function avisarContacto(negocioId, phone, clientName) {
  sendNotification({
    tipo: 'CLIENTE_QUIERE_HABLAR',
    negocioId,
    data: { clientName, clientPhone: `+${phone}` },
    targetProfessionalIds: [], // solo admins
  }).catch((err) => logger.warn('[assistantEngine] Push contacto falló:', err.message));
}

// ───────────────────────── Motor ─────────────────────────

export async function assistantEngine({ negocioId, phone, message, messageId }) {
  const context = await getBusinessContext(negocioId);

  // Negocio suspendido/vencido o asistente apagado: no se toman reservas.
  if (context.isBlocked || !context.assistantEnabled) {
    return { replyText: `Por ahora ${context.businessName} no está recibiendo reservas por WhatsApp.`, conversation: null };
  }

  let conversation = await getOrCreateConversation(negocioId, phone);

  // Meta puede reentregar el mismo mensaje más de una vez; sin esto se
  // procesaría dos veces y se mandarían respuestas cruzadas/duplicadas.
  if (messageId && conversation.lastMessageId === messageId) {
    return { replyText: null, conversation };
  }

  const texto = (message || '').trim();

  // Modo "hablar con alguien": el bot no contesta mientras dure, salvo que el
  // cliente escriba "menu". Al vencer, el chat vuelve al bot normalmente.
  if (conversation.currentFlow === 'human') {
    const hasta = Date.parse(conversation.humanUntil || '') || 0;
    const vuelveAlBot = /^(menu|menú)$/i.test(texto);
    if (Date.now() < hasta && !vuelveAlBot) {
      if (messageId) await updateConversation(negocioId, phone, { lastMessageId: messageId });
      return { replyText: null, conversation };
    }
    conversation = await resetConversation(negocioId, phone);
    if (vuelveAlBot) {
      if (messageId) await updateConversation(negocioId, phone, { lastMessageId: messageId });
      return responder(mensajeBienvenida(context), conversation);
    }
  }

  // Se mide ANTES de guardar lastMessageId (eso actualiza updatedAt).
  const ultimaActividad = Date.parse(conversation.updatedAt || '') || 0;
  const expirada = conversation.currentFlow !== 'welcome' && Date.now() - ultimaActividad > CONVERSATION_TIMEOUT_MS;

  if (messageId) {
    conversation = await updateConversation(negocioId, phone, { lastMessageId: messageId });
  }

  if (expirada) {
    conversation = await resetConversation(negocioId, phone);
    return responder(`Tu conversación anterior quedó sin terminar, empecemos de nuevo.\n\n${mensajeBienvenida(context)}`, conversation);
  }

  if (/^(cancelar|salir|reiniciar|menu|menú|0)$/i.test(texto) && conversation.currentFlow !== 'welcome') {
    conversation = await resetConversation(negocioId, phone);
    return responder(mensajeBienvenida(context), conversation);
  }

  switch (conversation.currentFlow) {
    case 'welcome': {
      if (/^2$|hablar|persona|humano|asesor|ayuda/i.test(texto)) {
        return hablarConAlguien();
      }
      if (/^1$|agendar|reservar/i.test(texto)) {
        conversation = await updateConversation(negocioId, phone, { currentFlow: 'choosing_service' });
        return responder(mensajeServicios(context), conversation);
      }
      return responder(mensajeBienvenida(context), conversation);
    }

    // ── Agendar ──

    case 'choosing_service': {
      const servicios = serviciosOfrecidos(context);
      const indices = parsearIndices(texto, servicios.length);
      if (!indices) return responder(`No entendí. \n\n${mensajeServicios(context)}`, conversation);

      const elegidos = indices.map((i) => servicios[i]);
      const pros = profesionalesPara(context, elegidos.map((s) => s.id));
      if (pros.length === 0) {
        return responder(`Ningún profesional realiza todos esos servicios juntos. Elige de nuevo.\n\n${mensajeServicios(context)}`, conversation);
      }

      conversation = await updateConversation(negocioId, phone, {
        currentFlow: 'choosing_staff',
        selectedServices: elegidos.map((s) => ({ serviceId: s.id, serviceName: s.name, price: s.price, duration: duracionServicio(s) })),
        staffOptionsIds: pros.map((p) => p.id),
      });
      return responder(mensajeProfesionales(pros), conversation);
    }

    case 'choosing_staff': {
      const pros = (conversation.staffOptionsIds || [])
        .map((id) => context.profesionales.find((p) => p.id === id))
        .filter(Boolean);
      const idx = parseInt(texto, 10) - 1;
      const opciones = opcionesCualquiera(pros);
      const profesional = pros[idx];
      const cualquiera = opciones[idx - pros.length] || (opciones.length === 1 && /cualquier/i.test(texto) ? opciones[0] : null);
      if (!profesional && !cualquiera) return responder(`No entendí. \n\n${mensajeProfesionales(pros)}`, conversation);

      const selectedStaff = profesional
        ? { id: profesional.id, name: profesional.name, branch: profesional.branch || '' }
        : { id: PENDING_ID, name: cualquiera.label, branch: cualquiera.branch, candidateIds: cualquiera.candidateIds };

      const dias = diasParaConversacion(context, { ...conversation, selectedStaff });
      if (dias.length === 0) {
        return responder(`${selectedStaff.name} no tiene días disponibles próximamente. Elige otro:\n\n${mensajeProfesionales(pros)}`, conversation);
      }

      conversation = await updateConversation(negocioId, phone, {
        currentFlow: 'choosing_date',
        selectedStaff,
        dateOptionsCache: dias,
      });
      return responder(mensajeFechas(dias), conversation);
    }

    case 'choosing_date': {
      const dias = conversation.dateOptionsCache || [];
      const idx = parseInt(texto, 10) - 1;
      const dia = dias[idx];
      if (!dia) return responder(`No entendí. \n\n${mensajeFechas(dias)}`, conversation);

      const slots = await slotsParaFecha(context, prosElegidos(context, conversation), dia.id, totalDuracion(conversation));
      if (slots.length === 0) {
        return responder(`No hay horarios libres ese día.\n\n${mensajeFechas(dias)}`, conversation);
      }

      conversation = await updateConversation(negocioId, phone, {
        currentFlow: 'choosing_time',
        selectedDate: dia.id,
        availableSlotsCache: slots,
      });
      return responder(mensajeHoras(slots), conversation);
    }

    case 'choosing_time': {
      const slots = conversation.availableSlotsCache || [];
      const idx = parseInt(texto, 10) - 1;
      const hora = slots[idx];
      if (!hora) return responder(`No entendí. \n\n${mensajeHoras(slots)}`, conversation);

      conversation = await updateConversation(negocioId, phone, {
        currentFlow: 'awaiting_name',
        selectedTime: hora,
      });
      return responder('¿A nombre de quién hago la reserva?', conversation);
    }

    case 'awaiting_name': {
      if (!texto) return responder('¿A nombre de quién hago la reserva?', conversation);

      conversation = await updateConversation(negocioId, phone, {
        currentFlow: 'confirming',
        clientName: texto,
      });
      return responder(mensajeResumen(conversation), conversation);
    }

    case 'confirming': {
      if (/^1$|confirmar|^si$|^sí$/i.test(texto)) {
        return confirmarReserva();
      }
      if (/^2$/i.test(texto)) {
        conversation = await resetConversation(negocioId, phone);
        return responder('Reserva cancelada. Escribe cuando quieras volver a empezar.', conversation);
      }
      return responder(`No entendí. \n\n${mensajeResumen(conversation)}`, conversation);
    }

    default: {
      conversation = await resetConversation(negocioId, phone);
      return responder(mensajeBienvenida(context), conversation);
    }
  }

  // ── Acciones ──

  async function confirmarReserva() {
    const conv = conversation;
    const services = serviciosDe(conv);
    const esPendiente = conv.selectedStaff?.id === PENDING_ID;
    let cita;
    try {
      const clientId = await upsertClientFromPhone({
        negocioId,
        phone,
        name: conv.clientName,
        date: conv.selectedDate,
        serviceName: services[0]?.serviceName,
      });
      const datos = {
        negocioId,
        date: conv.selectedDate,
        time: conv.selectedTime,
        serviceDuration: totalDuracion(conv),
        services,
        clientName: conv.clientName,
        clientPhone: phone,
        clientId,
        paymentMethod: 'Por definir',
        bookedBy: 'assistant',
      };
      cita = esPendiente
        ? await createPendingAppointment({ ...datos, branch: conv.selectedStaff.branch || '', candidateIds: conv.selectedStaff.candidateIds })
        : await createAppointment({ ...datos, professionalId: conv.selectedStaff.id, branch: conv.selectedStaff.branch || '' });
    } catch (err) {
      logger.warn('[assistantEngine] crear cita falló:', err.message);
      const dias = diasParaConversacion(context, conv);
      conversation = await updateConversation(negocioId, phone, { currentFlow: 'choosing_date', dateOptionsCache: dias });
      return responder(`Ese horario ya no está disponible. ${mensajeFechas(dias)}`, conversation);
    }

    let conQuien = '';
    if (esPendiente) {
      const r = await procesarPendiente(negocioId, cita);
      const asignado = r?.professionalId && context.profesionales.find((p) => p.id === r.professionalId);
      conQuien = asignado ? ` con ${asignado.name}` : '';
    } else {
      avisarNuevaCita(negocioId, cita);
      conQuien = ` con ${conv.selectedStaff.name}`;
    }

    const notaPendiente = esPendiente && !conQuien ? '\nEn breve el negocio te asignará un profesional.' : '';
    conversation = await resetConversation(negocioId, phone);
    return responder(`✅ Cita confirmada para ${fechaLegible(cita.date)} (${cita.date}) a las ${cita.time}${conQuien}. ¡Gracias!${notaPendiente}`, conversation);
  }

  async function hablarConAlguien() {
    avisarContacto(negocioId, phone, conversation.clientName);
    conversation = await updateConversation(negocioId, phone, {
      currentFlow: 'human',
      humanUntil: new Date(Date.now() + HUMAN_HANDOFF_MS).toISOString(),
    });
    return responder('Listo, le avisé al equipo. Una persona te responderá por aquí en breve. 🙌\n\n(Si quieres volver al asistente, escribe "menu".)', conversation);
  }

  // ── Mensajes ──

  function mensajeBienvenida(ctx) {
    return `Hola 👋 Soy el asistente de ${ctx.businessName}.\n\n1. Agendar una cita\n2. Hablar con alguien`;
  }
  function mensajeServicios(ctx) {
    const servicios = serviciosOfrecidos(ctx);
    if (servicios.length === 0) return 'Por ahora no hay servicios disponibles para reservar.';
    const lista = listaNumerada(servicios, (s) => `${s.name} - ${s.priceVariable === true ? 'Desde Bs ' : 'Bs '}${s.price}`);
    const ayuda = servicios.length > 1 ? '\n\nPuedes elegir varios separados por coma (ej: 1,3).' : '';
    return `¿Qué servicio deseas?\n\n${lista}${ayuda}`;
  }
  function mensajeProfesionales(pros) {
    const lista = listaNumerada(pros, (p) => p.name);
    const extra = opcionesCualquiera(pros).map((o, i) => `\n${pros.length + i + 1}. ${o.label}`).join('');
    return `¿Con quién deseas atenderte?\n\n${lista}${extra}`;
  }
  function mensajeFechas(dias) {
    return `¿Qué día?\n\n${listaNumerada(dias, (d) => d.label)}`;
  }
  function mensajeHoras(slots) {
    return `¿Qué horario?\n\n${listaNumerada(slots, (h) => h)}`;
  }
  function mensajeResumen(conv) {
    return `Confirma tu cita:\n${nombresServicios(conv)} con ${conv.selectedStaff.name}\n${fechaLegible(conv.selectedDate)} (${conv.selectedDate}) a las ${conv.selectedTime}\nA nombre de: ${conv.clientName}\n\n1. Confirmar\n2. Cancelar`;
  }
}

function listaNumerada(items, getLabel) {
  return items.map((it, i) => `${i + 1}. ${getLabel(it)}`).join('\n');
}

function responder(replyText, conversation) {
  return { replyText, conversation };
}
