// engine.js
//
// Orquestador del Assistant Engine. Fase 1: guiado por opciones, sin IA.
// Cada llamada recibe un mensaje (texto plano por ahora: "1", "2", etc. o
// palabras clave), avanza el estado guardado en Firestore, y devuelve una
// respuesta lista para mandar por WhatsApp (eso se conecta en el módulo
// siguiente — acá no se toca WhatsApp todavía).

import { getBusinessContext } from '../appointments/businessContext.js';
import { getAvailableSlots } from '../appointments/availability.js';
import { createAppointment } from '../appointments/createAppointment.js';
import { getOrCreateConversation, updateConversation, resetConversation } from '../appointments/conversationState.js';
import { professionalCanDo } from '../appointments/pendingModel.js';
import { upsertClientFromPhone } from '../appointments/clientRecord.js';
import { reevaluatePending } from '../appointments/pendingService.js';
import { sendNotification } from '../notificationService.js';
import { logger } from '../../utils/logger.js';
import { db } from '../../config/firebase.js';

const SERVICE_DURATION_DEFAULT = 30;
const TZ = process.env.APP_TIMEZONE || 'America/La_Paz';
const DAY_NAMES_MON_FIRST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_A_MOSTRAR = 7;
const DIAS_A_BUSCAR = 14;

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

function profesionalesPara(ctx, serviceId) {
  return ctx.profesionales.filter((p) => professionalCanDo(p, [serviceId]));
}

// Próximos días en que: el negocio abre, el profesional trabaja y el servicio se ofrece.
function proximosDias(ctx, profesional, servicio) {
  const schedule = ctx.businessSettings?.schedule || [];
  const base = ahoraNegocio();
  const dias = [];
  for (let i = 0; i < DIAS_A_BUSCAR && dias.length < DIAS_A_MOSTRAR; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12);
    const dayName = DAY_NAMES_MON_FIRST[(d.getDay() + 6) % 7];

    const negocioDia = schedule.find((x) => x?.day === dayName);
    if (negocioDia && negocioDia.status !== 'Disponible') continue;
    const proDia = (profesional?.availability || []).find((x) => x?.day === dayName);
    if (!proDia || proDia.status !== 'Disponible') continue;
    if (servicio?.availableDays?.length && !servicio.availableDays.includes(dayName)) continue;

    const etiqueta = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'short' });
    dias.push({ id: isoLocal(d), label: etiqueta });
  }
  return dias;
}

async function slotsParaFecha(ctx, profesional, fecha, duracion) {
  const negocioRef = db.collection('negocios').doc(ctx.negocioId);
  const [citasSnap, bloqueosSnap] = await Promise.all([
    negocioRef.collection('citas').where('date', '==', fecha).get(),
    negocioRef.collection('horariosBloqueados').where('date', '==', fecha).get(),
  ]);
  return getAvailableSlots({
    fecha,
    serviceDuration: duracion,
    profesional,
    citasDelNegocio: citasSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    bloqueos: bloqueosSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    businessSchedule: ctx.businessSettings?.schedule || [],
    aplicarAnticipacion: true,
    minAdvanceMinutes: ctx.businessSettings?.minAdvanceMinutes || 0,
    ahora: ahoraNegocio(),
  });
}

// Avisos después de crear la cita (no bloquean la respuesta al cliente).
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

function listaNumerada(items, getLabel) {
  return items.map((it, i) => `${i + 1}. ${getLabel(it)}`).join('\n');
}

export async function assistantEngine({ negocioId, phone, message, messageId }) {
  const context = await getBusinessContext(negocioId);
  let conversation = await getOrCreateConversation(negocioId, phone);

  // Meta puede reentregar el mismo mensaje más de una vez; sin esto se
  // procesaría dos veces y se mandarían respuestas cruzadas/duplicadas.
  if (messageId && conversation.lastMessageId === messageId) {
    return { replyText: null, conversation };
  }
  if (messageId) {
    conversation = await updateConversation(negocioId, phone, { lastMessageId: messageId });
  }

  const texto = (message || '').trim();

  if (/^(cancelar|salir|reiniciar)$/i.test(texto)) {
    conversation = await resetConversation(negocioId, phone);
    return responder(`Listo, empecemos de nuevo.\n\n${mensajeBienvenida(context)}`, conversation);
  }

  switch (conversation.currentFlow) {
    case 'welcome': {
      if (/^1$|agendar/i.test(texto) || texto === '') {
        conversation = await updateConversation(negocioId, phone, { currentFlow: 'choosing_service' });
        return responder(mensajeServicios(context), conversation);
      }
      return responder(mensajeBienvenida(context), conversation);
    }

    case 'choosing_service': {
      const servicios = serviciosOfrecidos(context);
      const idx = parseInt(texto, 10) - 1;
      const servicio = servicios[idx];
      if (!servicio) return responder(`No entendí. \n\n${mensajeServicios(context)}`, conversation);

      const pros = profesionalesPara(context, servicio.id);
      conversation = await updateConversation(negocioId, phone, {
        currentFlow: 'choosing_staff',
        selectedService: { serviceId: servicio.id, serviceName: servicio.name, price: servicio.price, duration: duracionServicio(servicio) },
        staffOptionsIds: pros.map((p) => p.id),
      });
      return responder(mensajeProfesionales(pros), conversation);
    }

    case 'choosing_staff': {
      const pros = (conversation.staffOptionsIds || [])
        .map((id) => context.profesionales.find((p) => p.id === id))
        .filter(Boolean);
      const idx = parseInt(texto, 10) - 1;
      const profesional = pros[idx];
      if (!profesional) return responder(`No entendí. \n\n${mensajeProfesionales(pros)}`, conversation);

      const servicio = context.servicios.find((s) => s.id === conversation.selectedService?.serviceId);
      const dias = proximosDias(context, profesional, servicio);
      if (dias.length === 0) {
        return responder(`${profesional.name} no tiene días disponibles próximamente. Elige otro:\n\n${mensajeProfesionales(pros)}`, conversation);
      }

      conversation = await updateConversation(negocioId, phone, {
        currentFlow: 'choosing_date',
        selectedStaff: { id: profesional.id, name: profesional.name, branch: profesional.branch || '' },
        dateOptionsCache: dias,
      });
      return responder(mensajeFechas(dias), conversation);
    }

    case 'choosing_date': {
      const dias = conversation.dateOptionsCache || [];
      const idx = parseInt(texto, 10) - 1;
      const dia = dias[idx];
      if (!dia) return responder(`No entendí. \n\n${mensajeFechas(dias)}`, conversation);

      const profesional = context.profesionales.find((p) => p.id === conversation.selectedStaff.id);
      const duracion = conversation.selectedService.duration;
      const slots = await slotsParaFecha(context, profesional, dia.id, duracion);

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
      if (/^1$|confirmar|si|sí/i.test(texto)) {
        let cita;
        try {
          const clientId = await upsertClientFromPhone({
            negocioId,
            phone,
            name: conversation.clientName,
            date: conversation.selectedDate,
            serviceName: conversation.selectedService.serviceName,
          });
          cita = await createAppointment({
            negocioId,
            professionalId: conversation.selectedStaff.id,
            date: conversation.selectedDate,
            time: conversation.selectedTime,
            serviceDuration: conversation.selectedService.duration,
            services: [conversation.selectedService],
            clientName: conversation.clientName,
            clientPhone: phone,
            clientId,
            branch: conversation.selectedStaff.branch || '',
            paymentMethod: 'Por definir',
            bookedBy: 'assistant',
          });
        } catch (err) {
          logger.warn('[assistantEngine] createAppointment falló:', err.message);
          const profesional = context.profesionales.find((p) => p.id === conversation.selectedStaff.id);
          const servicio = context.servicios.find((s) => s.id === conversation.selectedService?.serviceId);
          const dias = proximosDias(context, profesional, servicio);
          conversation = await updateConversation(negocioId, phone, { currentFlow: 'choosing_date', dateOptionsCache: dias });
          return responder(`Ese horario ya no está disponible. ${mensajeFechas(dias)}`, conversation);
        }
        avisarNuevaCita(negocioId, cita);
        conversation = await resetConversation(negocioId, phone);
        return responder(`✅ Cita confirmada para el ${cita.date} a las ${cita.time}. ¡Gracias!`, conversation);
      }
      if (/^2$|cancelar/i.test(texto)) {
        conversation = await resetConversation(negocioId, phone);
        return responder('Reserva cancelada. ¿Necesitas algo más?', conversation);
      }
      return responder(`No entendí. \n\n${mensajeResumen(conversation)}`, conversation);
    }

    default: {
      conversation = await resetConversation(negocioId, phone);
      return responder(mensajeBienvenida(context), conversation);
    }
  }

  function mensajeBienvenida(ctx) {
    return `Hola 👋 Soy el asistente de ${ctx.businessName}.\n\n1. Agendar una cita`;
  }
  function mensajeServicios(ctx) {
    const servicios = serviciosOfrecidos(ctx);
    if (servicios.length === 0) return 'Por ahora no hay servicios disponibles para reservar.';
    return `¿Qué servicio deseas?\n\n${listaNumerada(servicios, (s) => `${s.name} - ${s.priceVariable === true ? 'Desde Bs ' : 'Bs '}${s.price}`)}`;
  }
  function mensajeProfesionales(pros) {
    return `¿Con quién deseas atenderte?\n\n${listaNumerada(pros, (p) => p.name)}`;
  }
  function mensajeFechas(dias) {
    return `¿Qué día?\n\n${listaNumerada(dias, (d) => d.label)}`;
  }
  function mensajeHoras(slots) {
    return `¿Qué horario?\n\n${listaNumerada(slots, (h) => h)}`;
  }
  function mensajeResumen(conv) {
    return `Confirma tu cita:\n${conv.selectedService.serviceName} con ${conv.selectedStaff.name}\n${conv.selectedDate} a las ${conv.selectedTime}\nA nombre de: ${conv.clientName}\n\n1. Confirmar\n2. Cancelar`;
  }
}

function responder(replyText, conversation) {
  return { replyText, conversation };
}