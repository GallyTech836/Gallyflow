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
import { upsertClientFromPhone, findClientByPhone } from '../appointments/clientRecord.js';
import { reevaluatePending, processPendingCita } from '../appointments/pendingService.js';
import { sendNotification } from '../notificationService.js';
import { logger } from '../../utils/logger.js';
import { db } from '../../config/firebase.js';

const SERVICE_DURATION_DEFAULT = 30;
const TZ = process.env.APP_TIMEZONE || 'America/La_Paz';
const DAY_NAMES_MON_FIRST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_A_MOSTRAR = 7;
const DIAS_A_BUSCAR = 14;
const FLUJOS_CON_LISTA = new Set(['choosing_service', 'choosing_extra_service', 'choosing_staff', 'choosing_date', 'choosing_time']);
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

function precioServicio(s) {
  return `${s.priceVariable === true ? 'Desde Bs ' : 'Bs '}${s.price}`;
}

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
    return responder(prefijo(`Tu conversación anterior quedó sin terminar, empecemos de nuevo.\n\n`, mensajeBienvenida(context)), conversation);
  }

  if (/^(cancelar|salir|reiniciar|menu|menú|0)$/i.test(texto) && conversation.currentFlow !== 'welcome') {
    conversation = await resetConversation(negocioId, phone);
    return responder(mensajeBienvenida(context), conversation);
  }

  // "Más opciones" en las listas de WhatsApp (máx. 10 filas por lista).
  if (/^(mas|más)$/i.test(texto) && FLUJOS_CON_LISTA.has(conversation.currentFlow)) {
    conversation = await updateConversation(negocioId, phone, {
      listPage: paginaActual(conversation) + 1,
      listPageFlow: conversation.currentFlow,
    });
    return responder(menuDelPaso(), conversation);
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
      if (!indices) return responder(prefijo(`No entendí. \n\n`, mensajeServicios(context)), conversation);

      const elegidos = indices.map((i) => servicios[i]);
      if (profesionalesPara(context, elegidos.map((s) => s.id)).length === 0) {
        return responder(prefijo(`Ningún profesional realiza todos esos servicios juntos. Elige de nuevo.\n\n`, mensajeServicios(context)), conversation);
      }
      conversation = await updateConversation(negocioId, phone, { selectedServices: elegidos.map(aServicioCita) });
      return ofrecerAgregarOContinuar();
    }

    // ¿Agregar otro servicio o continuar?
    case 'adding_service': {
      if (/^agregar$|agregar|otro/i.test(texto)) {
        conversation = await updateConversation(negocioId, phone, { currentFlow: 'choosing_extra_service' });
        return responder(mensajeServiciosExtra(), conversation);
      }
      if (/^continuar$|continuar|^no$|listo/i.test(texto)) {
        return irAProfesionales();
      }
      return responder(prefijo('No entendí.', mensajeAgregarOContinuar()), conversation);
    }

    case 'choosing_extra_service': {
      const servicios = serviciosOfrecidos(context);
      const idx = parseInt(texto, 10) - 1;
      const extra = serviciosExtraCompatibles().find((s) => s.id === servicios[idx]?.id);
      if (!extra) return responder(prefijo('No entendí.', mensajeServiciosExtra()), conversation);

      conversation = await updateConversation(negocioId, phone, {
        selectedServices: [...serviciosDe(conversation), aServicioCita(extra)],
      });
      return ofrecerAgregarOContinuar();
    }

    case 'choosing_staff': {
      const pros = (conversation.staffOptionsIds || [])
        .map((id) => context.profesionales.find((p) => p.id === id))
        .filter(Boolean);
      const idx = parseInt(texto, 10) - 1;
      const opciones = opcionesCualquiera(pros);
      const profesional = pros[idx];
      const cualquiera = opciones[idx - pros.length] || (opciones.length === 1 && /cualquier/i.test(texto) ? opciones[0] : null);
      if (!profesional && !cualquiera) return responder(prefijo(`No entendí. \n\n`, mensajeProfesionales(pros)), conversation);

      const selectedStaff = profesional
        ? { id: profesional.id, name: profesional.name, branch: profesional.branch || '' }
        : { id: PENDING_ID, name: cualquiera.label, branch: cualquiera.branch, candidateIds: cualquiera.candidateIds };

      const dias = diasParaConversacion(context, { ...conversation, selectedStaff });
      if (dias.length === 0) {
        return responder(prefijo(`${selectedStaff.name} no tiene días disponibles próximamente. Elige otro:\n\n`, mensajeProfesionales(pros)), conversation);
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
      if (!dia) return responder(prefijo(`No entendí. \n\n`, mensajeFechas(dias)), conversation);

      const slots = await slotsParaFecha(context, prosElegidos(context, conversation), dia.id, totalDuracion(conversation));
      if (slots.length === 0) {
        return responder(prefijo(`No hay horarios libres ese día.\n\n`, mensajeFechas(dias)), conversation);
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
      if (!hora) return responder(prefijo(`No entendí. \n\n`, mensajeHoras(slots)), conversation);

      // Cliente ya conocido (reservó antes por WhatsApp o está en Clientes): no se pregunta el nombre.
      const nombreConocido = await nombreDelCliente();
      if (nombreConocido) {
        conversation = await updateConversation(negocioId, phone, {
          currentFlow: 'confirming',
          selectedTime: hora,
          clientName: nombreConocido,
        });
        return responder(mensajeResumen(conversation), conversation);
      }

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
      if (/^nombre$|cambiar nombre/i.test(texto)) {
        conversation = await updateConversation(negocioId, phone, { currentFlow: 'awaiting_name' });
        return responder('¿A nombre de quién hago la reserva?', conversation);
      }
      if (/^2$/i.test(texto)) {
        conversation = await resetConversation(negocioId, phone);
        return responder('Reserva cancelada. Escribe cuando quieras volver a empezar.', conversation);
      }
      return responder(prefijo(`No entendí. \n\n`, mensajeResumen(conversation)), conversation);
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
      return responder(prefijo(`Ese horario ya no está disponible. `, mensajeFechas(dias)), conversation);
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

  function aServicioCita(s) {
    return { serviceId: s.id, serviceName: s.name, price: s.price, duration: duracionServicio(s) };
  }

  // Servicios que todavía se pueden sumar: no elegidos y con al menos un
  // profesional que haga TODOS (los elegidos + este).
  function serviciosExtraCompatibles() {
    const elegidosIds = serviciosDe(conversation).map((s) => s.serviceId);
    return serviciosOfrecidos(context).filter(
      (s) => !elegidosIds.includes(s.id) && profesionalesPara(context, [...elegidosIds, s.id]).length > 0
    );
  }

  async function ofrecerAgregarOContinuar() {
    if (serviciosExtraCompatibles().length === 0) return irAProfesionales();
    conversation = await updateConversation(negocioId, phone, { currentFlow: 'adding_service' });
    return responder(mensajeAgregarOContinuar(), conversation);
  }

  async function irAProfesionales() {
    const pros = profesionalesPara(context, serviciosDe(conversation).map((s) => s.serviceId));
    conversation = await updateConversation(negocioId, phone, {
      currentFlow: 'choosing_staff',
      staffOptionsIds: pros.map((p) => p.id),
    });
    return responder(mensajeProfesionales(pros), conversation);
  }

  async function nombreDelCliente() {
    const valido = (n) => n && String(n).trim() && !/^cliente whatsapp$/i.test(String(n).trim());
    if (valido(conversation.clientName)) return conversation.clientName.trim();
    const cliente = await findClientByPhone(negocioId, phone);
    return valido(cliente?.name) ? cliente.name.trim() : null;
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

  function paginaActual(conv = conversation) {
    return conv.listPageFlow === conv.currentFlow ? Number(conv.listPage) || 0 : 0;
  }

  // Vuelve a armar la lista del paso actual (para "Más opciones").
  function menuDelPaso() {
    switch (conversation.currentFlow) {
      case 'choosing_service':
        return mensajeServicios(context);
      case 'choosing_extra_service':
        return mensajeServiciosExtra();
      case 'choosing_staff':
        return mensajeProfesionales(
          (conversation.staffOptionsIds || []).map((id) => context.profesionales.find((p) => p.id === id)).filter(Boolean)
        );
      case 'choosing_date':
        return mensajeFechas(conversation.dateOptionsCache || []);
      case 'choosing_time':
        return mensajeHoras(conversation.availableSlotsCache || []);
      default:
        return mensajeBienvenida(context);
    }
  }

  function mensajeBienvenida(ctx) {
    const cuerpo = `Hola 👋 Soy el asistente de ${ctx.businessName}. ¿En qué te ayudo?`;
    return menuBotones({
      texto: `Hola 👋 Soy el asistente de ${ctx.businessName}.\n\n1. Agendar una cita\n2. Hablar con alguien`,
      cuerpo,
      botones: [{ id: '1', title: 'Agendar cita' }, { id: '2', title: 'Hablar con alguien' }],
    });
  }
  function mensajeServicios(ctx) {
    const servicios = serviciosOfrecidos(ctx);
    if (servicios.length === 0) return 'Por ahora no hay servicios disponibles para reservar.';
    const lista = listaNumerada(servicios, (s) => `${s.name} - ${precioServicio(s)}`);
    return menuLista({
      texto: `¿Qué servicio deseas?\n\n${lista}`,
      cuerpo: '¿Qué servicio deseas?',
      boton: 'Ver servicios',
      items: servicios.map((s, i) => ({ id: String(i + 1), title: s.name, description: `${precioServicio(s)} · ${duracionServicio(s)} min` })),
      page: paginaActual(),
    });
  }
  // Solo los que se pueden sumar; el id es la posición en la lista completa de servicios.
  function mensajeServiciosExtra() {
    const todos = serviciosOfrecidos(context);
    const extras = serviciosExtraCompatibles();
    return menuLista({
      texto: `¿Qué servicio agregas?\n\n${extras.map((s) => `${todos.indexOf(s) + 1}. ${s.name} - ${precioServicio(s)}`).join('\n')}`,
      cuerpo: `Elegiste: ${nombresServicios(conversation)}.\n¿Qué servicio agregas?`,
      boton: 'Ver servicios',
      items: extras.map((s) => ({ id: String(todos.indexOf(s) + 1), title: s.name, description: `${precioServicio(s)} · ${duracionServicio(s)} min` })),
      page: paginaActual(),
    });
  }
  function mensajeAgregarOContinuar() {
    const cuerpo = `Elegiste: ${nombresServicios(conversation)}.\n¿Quieres agregar otro servicio?`;
    return menuBotones({
      texto: `${cuerpo}\n\nEscribe "agregar" o "continuar".`,
      cuerpo,
      botones: [{ id: 'agregar', title: 'Agregar otro' }, { id: 'continuar', title: 'Continuar' }],
    });
  }
  function mensajeProfesionales(pros) {
    const opciones = opcionesCualquiera(pros);
    const items = [...pros.map((p) => ({ title: p.name })), ...opciones.map((o) => ({ title: o.label, description: 'El primero disponible' }))];
    return menuLista({
      texto: `¿Con quién deseas atenderte?\n\n${listaNumerada(items, (i) => i.title)}`,
      cuerpo: '¿Con quién deseas atenderte?',
      boton: 'Ver profesionales',
      items,
      page: paginaActual(),
    });
  }
  function mensajeFechas(dias) {
    return menuLista({
      texto: `¿Qué día?\n\n${listaNumerada(dias, (d) => d.label)}`,
      cuerpo: '¿Qué día?',
      boton: 'Ver días',
      items: dias.map((d) => ({ title: d.label })),
      page: paginaActual(),
    });
  }
  function mensajeHoras(slots) {
    return menuLista({
      texto: `¿Qué horario?\n\n${listaNumerada(slots, (h) => h)}`,
      cuerpo: '¿Qué horario?',
      boton: 'Ver horarios',
      items: slots.map((h) => ({ title: h })),
      page: paginaActual(),
    });
  }
  function mensajeResumen(conv) {
    const resumen = `Confirma tu cita:\n${nombresServicios(conv)} con ${conv.selectedStaff.name}\n${fechaLegible(conv.selectedDate)} (${conv.selectedDate}) a las ${conv.selectedTime}\nA nombre de: ${conv.clientName}`;
    return menuBotones({
      texto: `${resumen}\n\n1. Confirmar\n2. Cancelar\n(Escribe "nombre" para cambiar el nombre)`,
      cuerpo: resumen,
      botones: [{ id: '1', title: 'Confirmar' }, { id: 'nombre', title: 'Cambiar nombre' }, { id: '2', title: 'Cancelar' }],
    });
  }
}

function listaNumerada(items, getLabel) {
  return items.map((it, i) => `${i + 1}. ${getLabel(it)}`).join('\n');
}

// ───────────────────────── Mensajes interactivos ─────────────────────────
// Cada mensaje tiene `text` (respaldo / ruta de prueba) y, si aplica,
// `interactive` (botones o lista de WhatsApp). Los IDs de las opciones son
// los mismos números que se escribirían a mano ("1", "2", ...), así el motor
// entiende igual un toque en la lista que un número escrito.

const MAX_FILAS = 10; // límite de Meta por lista
const POR_PAGINA = 9; // + 1 fila "Más opciones" cuando no entran todas

const recortar = (str, max) => {
  const t = String(str ?? '');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function menuLista({ texto, cuerpo, boton, items, page = 0 }) {
  if (!items.length) return { text: texto };
  const paginar = items.length > MAX_FILAS;
  const paginas = paginar ? Math.ceil(items.length / POR_PAGINA) : 1;
  const p = ((page % paginas) + paginas) % paginas;
  const desde = paginar ? p * POR_PAGINA : 0;
  const visibles = paginar ? items.slice(desde, desde + POR_PAGINA) : items;

  const rows = visibles.map((it, i) => ({
    id: it.id ?? String(desde + i + 1),
    title: recortar(it.title, 24),
    ...(it.description ? { description: recortar(it.description, 72) } : {}),
  }));
  if (paginar) {
    rows.push({ id: 'mas', title: 'Más opciones →', description: `Página ${p + 1} de ${paginas}` });
  }

  return {
    text: texto,
    interactive: {
      type: 'list',
      body: { text: recortar(cuerpo, 1024) },
      action: { button: recortar(boton, 20), sections: [{ title: 'Opciones', rows }] },
    },
  };
}

function menuBotones({ texto, cuerpo, botones }) {
  return {
    text: texto,
    interactive: {
      type: 'button',
      body: { text: recortar(cuerpo, 1024) },
      action: {
        buttons: botones.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: recortar(b.title, 20) } })),
      },
    },
  };
}

// Antepone un aviso ("No entendí.", etc.) tanto al texto como al cuerpo interactivo.
function prefijo(aviso, mensaje) {
  const m = typeof mensaje === 'string' ? { text: mensaje } : mensaje;
  const a = aviso.trim();
  return {
    text: `${a}\n\n${m.text}`,
    ...(m.interactive
      ? { interactive: { ...m.interactive, body: { text: recortar(`${a}\n\n${m.interactive.body.text}`, 1024) } } }
      : {}),
  };
}

function responder(mensaje, conversation) {
  if (mensaje && typeof mensaje === 'object') {
    return { replyText: mensaje.text, interactive: mensaje.interactive || null, conversation };
  }
  return { replyText: mensaje, interactive: null, conversation };
}
