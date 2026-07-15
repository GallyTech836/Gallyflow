// services/notificationTemplates.js
//
// Único lugar con el texto de los mensajes push. Así el mismo evento
// genera el mismo mensaje sin importar qué app lo disparó.

export function buildMessage(tipo, data = {}) {
    switch (tipo) {
      case 'RESERVA_CREADA_CLIENTE':
        return { titulo: 'Nueva reserva', cuerpo: 'Un cliente creó una nueva reserva.' };
      case 'RESERVA_CREADA_ADMIN':
        return { titulo: 'Nueva reserva', cuerpo: 'Se registró una nueva reserva desde el panel de administración.' };
      case 'RESERVA_CREADA_BARBER':
        return { titulo: 'Nueva reserva', cuerpo: 'Un profesional registró una nueva reserva.' };
      case 'RESERVA_CANCELADA':
        return { titulo: 'Reserva cancelada', cuerpo: 'Una reserva fue cancelada.' };
      case 'RESERVA_MODIFICADA':
        return { titulo: 'Reserva modificada', cuerpo: 'Una reserva fue modificada.' };
      default:
        return { titulo: 'GallyFlow', cuerpo: 'Tienes una actualización en tus reservas.' };
    }
  }