// services/notificationTemplates.js

export function buildMessage(tipo, data = {}) {
  const cliente = data.clientName ? data.clientName : 'Un cliente';
  const hora = data.time ? ` a las ${data.time}` : '';

  switch (tipo) {
    case 'RESERVA_CREADA_CLIENTE':
      return { titulo: '🔔¡Nueva reserva!', cuerpo: `Tienes una reserva${hora} de ${cliente}.` };
    case 'RESERVA_CREADA_ADMIN':
      return { titulo: '🔔¡Nueva reserva!', cuerpo: `Se registró una reserva${hora} con ${cliente}.` };
    case 'RESERVA_CREADA_BARBER':
      return { titulo: '🔔¡Nueva reserva!', cuerpo: `Un profesional registró una reserva${hora} con ${cliente}.` };
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
        titulo: `⏰ Tu cita es en ${data.minutes || 30} min`,
        cuerpo: `${data.serviceName || 'Servicio'}${data.time ? ` · ${data.time}` : ''}\nCliente: ${cliente}`,
      };
    case 'RESERVA_PENDIENTE':
      return {
        titulo: '🔔 Nueva reserva pendiente',
        cuerpo: `${data.serviceName || 'Servicio'}${data.time ? ` · ${data.time}` : ''}\nEsta reserva aún no tiene profesional asignado.`,
      };
    case 'RESERVA_PENDIENTE_ASIGNADA':
      return {
        titulo: '✅ Reserva asignada',
        cuerpo: `${data.serviceName || 'Servicio'}${data.time ? ` · ${data.time}` : ''}\nSe te asignó la reserva de ${cliente}.`,
      };
    case 'RESERVA_CONFIRMADA_CLIENTE':
      return { titulo: '✅ ¡Reserva confirmada!', cuerpo: `Tu cita${hora} quedó agendada. ¡Te esperamos!` };
    default:
      return { titulo: 'GallyFlow', cuerpo: 'Tienes una actualización en tus reservas.' };
  }
}