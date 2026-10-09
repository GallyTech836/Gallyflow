// services/notificationTemplates.js
//
// `terms`: terminología del negocio (createTerms). Sin negocio -> genéricos.

import { GENERIC_TERMS } from './businessProfiles/businessProfileModel.js';

export function buildMessage(tipo, data = {}, terms = GENERIC_TERMS) {
  const { t, tl, g } = terms;
  const cliente = data.clientName ? data.clientName : `${g('client', 'Un', 'Una')} ${tl('client')}`;
  const servicio = data.serviceName || t('service');
  const hora = data.time ? ` a las ${data.time}` : '';

  switch (tipo) {
    case 'RESERVA_CREADA_CLIENTE':
      return { titulo: '🔔¡Nueva reserva!', cuerpo: `Tienes una reserva${hora} de ${cliente}.` };
    case 'RESERVA_CREADA_ADMIN':
      return { titulo: '🔔¡Nueva reserva!', cuerpo: `Se registró una reserva${hora} con ${cliente}.` };
    case 'RESERVA_CREADA_BARBER':
      return { titulo: '🔔¡Nueva reserva!', cuerpo: `${g('professional', 'Un', 'Una')} ${tl('professional')} registró una reserva${hora} con ${cliente}.` };
      case 'CLIENTE_QUIERE_HABLAR':
        return { titulo: `💬 ${g('client', 'Un', 'Una')} ${tl('client')} quiere hablar`, cuerpo: `${cliente}${data.clientPhone ? ` (${data.clientPhone})` : ''} pidió hablar con alguien por WhatsApp.` };
      case 'RESERVA_CANCELADA':
      return { titulo: '🔔¡Reserva cancelada!', cuerpo: `Se canceló la reserva de ${cliente}${hora}.` };
    case 'RESERVA_MODIFICADA': {
      // data.changes = lista de cambios ya redactados por el frontend
      // (estado, servicios, cliente, hora, profesional...). Sin lista, mensaje genérico.
      const cambios = Array.isArray(data.changes) ? data.changes.filter(Boolean) : [];
      if (cambios.length === 0) {
        return { titulo: '🔔¡Reserva modificada!', cuerpo: `Se modificó la reserva de ${cliente}${hora}.` };
      }
      const visibles = cambios.slice(0, 4).map((c) => `• ${c}`);
      if (cambios.length > 4) visibles.push(`• y ${cambios.length - 4} cambio(s) más`);
      return { titulo: '🔔¡Reserva modificada!', cuerpo: `Reserva de ${cliente}${hora}\n${visibles.join('\n')}` };
    }
    case 'RECORDATORIO_CITA':
      return {
        titulo: `⏰ Tu ${tl('appointment')} es en ${data.minutes || 30} min`,
        cuerpo: `${servicio}${data.time ? ` · ${data.time}` : ''}\n${t('client')}: ${cliente}`,
      };
    case 'RESERVA_PENDIENTE':
      return {
        titulo: '🔔 Nueva reserva pendiente',
        cuerpo: `${servicio}${data.time ? ` · ${data.time}` : ''}\nEsta reserva aún no tiene ${tl('professional')} ${g('professional', 'asignado', 'asignada')}.`,
      };
    case 'RESERVA_PENDIENTE_ASIGNADA':
      return {
        titulo: '✅ Reserva asignada',
        cuerpo: `${servicio}${data.time ? ` · ${data.time}` : ''}\nSe te asignó la reserva de ${cliente}.`,
      };
    case 'RESERVA_CONFIRMADA_CLIENTE':
      return { titulo: '✅ ¡Reserva confirmada!', cuerpo: `Tu ${tl('appointment')}${hora} ${g('appointment', 'quedó agendado', 'quedó agendada')}. ¡Te esperamos!` };
    default:
      return { titulo: 'GallyFlow', cuerpo: 'Tienes una actualización en tus reservas.' };
  }
}