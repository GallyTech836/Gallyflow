// services/notificationTemplates.js

export function buildMessage(tipo, data = {}) {
  const cliente = data.clientName ? data.clientName : 'Un cliente';
  const hora = data.time ? ` a las ${data.time}` : '';

  switch (tipo) {
    case 'RESERVA_CREADA_CLIENTE':
      return { titulo: '🔔¡Nueva reserva!', cuerpo: `Tienes una reserva a las ${hora} de ${cliente}.` };
    case 'RESERVA_CREADA_ADMIN':
      return { titulo: '🔔¡Nueva reserva!', cuerpo: `Se registró una reserva a las ${hora} con ${cliente}.` };
    case 'RESERVA_CREADA_BARBER':
      return { titulo: 'Nueva reserva', cuerpo: `Un profesional registró una reserva a las ${hora} con ${cliente}.` };
    case 'RESERVA_CANCELADA':
      return { titulo: 'Reserva cancelada', cuerpo: `Se canceló la reserva de ${cliente} a las ${hora}.` };
    case 'RESERVA_MODIFICADA':
      return { titulo: 'Reserva modificada', cuerpo: `Se modificó la reserva de ${cliente} para las ${hora}.` };
    default:
      return { titulo: 'GallyFlow', cuerpo: 'Tienes una actualización en tus reservas.' };
  }
}