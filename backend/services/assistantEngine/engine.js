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
import { db } from '../../config/firebase.js';

const SERVICE_DURATION_DEFAULT = 30;

// Próximos 7 días como opciones de fecha (formato YYYY-MM-DD + etiqueta).
function proximosDias(cantidad = 7) {
  const dias = [];
  const hoy = new Date();
  for (let i = 0; i < cantidad; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const etiqueta = d.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'short' });
    dias.push({ id: iso, label: etiqueta });
  }
  return dias;
}

async function slotsParaFecha(negocioId, profesional, fecha, duracion) {
  const negocioRef = db.collection('negocios').doc(negocioId);
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
  });
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
      const idx = parseInt(texto, 10) - 1;
      const servicio = context.servicios[idx];
      if (!servicio) return responder(`No entendí. \n\n${mensajeServicios(context)}`, conversation);

      conversation = await updateConversation(negocioId, phone, {
        currentFlow: 'choosing_staff',
        selectedService: { serviceId: servicio.id, serviceName: servicio.name, price: servicio.price, duration: servicio.durationMin || SERVICE_DURATION_DEFAULT },
      });
      return responder(mensajeProfesionales(context), conversation);
    }

    case 'choosing_staff': {
      const idx = parseInt(texto, 10) - 1;
      const profesional = context.profesionales[idx];
      if (!profesional) return responder(`No entendí. \n\n${mensajeProfesionales(context)}`, conversation);

      conversation = await updateConversation(negocioId, phone, {
        currentFlow: 'choosing_date',
        selectedStaff: { id: profesional.id, name: profesional.name, branch: profesional.branch || '' },
      });
      return responder(mensajeFechas(), conversation);
    }

    case 'choosing_date': {
      const dias = proximosDias();
      const idx = parseInt(texto, 10) - 1;
      const dia = dias[idx];
      if (!dia) return responder(`No entendí. \n\n${mensajeFechas()}`, conversation);

      const profesional = context.profesionales.find((p) => p.id === conversation.selectedStaff.id);
      const duracion = conversation.selectedService.duration;
      const slots = await slotsParaFecha(negocioId, profesional, dia.id, duracion);

      if (slots.length === 0) {
        return responder(`No hay horarios libres ese día.\n\n${mensajeFechas()}`, conversation);
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
        try {
          const cita = await createAppointment({
            negocioId,
            professionalId: conversation.selectedStaff.id,
            date: conversation.selectedDate,
            time: conversation.selectedTime,
            serviceDuration: conversation.selectedService.duration,
            services: [conversation.selectedService],
            clientName: conversation.clientName,
            clientPhone: phone,
            paymentMethod: 'Por definir',
            bookedBy: 'assistant',
          });
          conversation = await resetConversation(negocioId, phone);
          return responder(`✅ Cita confirmada para el ${cita.date} a las ${cita.time}. ¡Gracias!`, conversation);
        } catch (err) {
          conversation = await updateConversation(negocioId, phone, { currentFlow: 'choosing_date' });
          return responder(`Ese horario ya no está disponible. ${mensajeFechas()}`, conversation);
        }
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
    return `¿Qué servicio deseas?\n\n${listaNumerada(ctx.servicios, (s) => `${s.name} - ${s.price}`)}`;
  }
  function mensajeProfesionales(ctx) {
    return `¿Con quién deseas atenderte?\n\n${listaNumerada(ctx.profesionales, (p) => p.name)}`;
  }
  function mensajeFechas() {
    return `¿Qué día?\n\n${listaNumerada(proximosDias(), (d) => d.label)}`;
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