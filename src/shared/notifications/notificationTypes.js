// Enum de tipos de evento. Solo nombres, sin texto de mensaje —
// los mensajes viven en el backend (notificationService.js) para no
// duplicar texto en 3 apps distintas.

export const NotificationType = {
    RESERVA_CREADA_CLIENTE: 'RESERVA_CREADA_CLIENTE',
    RESERVA_CREADA_ADMIN: 'RESERVA_CREADA_ADMIN',
    RESERVA_CREADA_BARBER: 'RESERVA_CREADA_BARBER',
    RESERVA_CANCELADA: 'RESERVA_CANCELADA',
    RESERVA_MODIFICADA: 'RESERVA_MODIFICADA',
  };