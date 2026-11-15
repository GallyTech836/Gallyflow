// services/notificationTemplates.js
//
// `terms`: terminología del negocio (createTerms). Sin negocio -> genéricos.

import { GENERIC_TERMS } from './businessProfiles/businessProfileModel.js';

export function buildMessage(tipo, data = {}, terms = GENERIC_TERMS) {
  const { t, tl, g } = terms;
  const cliente = data.clientName ? data.clientName : `${g('client', 'Un', 'Una')} ${tl('client')}`;
  const servicio = data.serviceName || t('service');
  const hora = data.time ? ` a las ${data.time}` : '';

  // Anticipos: "mié 18 nov" para que se sepa de qué día es la reserva.
  const dia = (() => {
    if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return '';
    const f = new Date(`${data.date}T12:00:00Z`);
    const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return ` el ${dias[f.getUTCDay()]} ${f.getUTCDate()} ${meses[f.getUTCMonth()]}`;
  })();
  const monto = Number(data.amount) > 0 ? ` de Bs ${Number(data.amount)}` : '';
  const porConfirmar = data.porConfirmar === true ? '\nPor confirmar: espera el anticipo.' : '';

  switch (tipo) {
    // Reserva del link público que pide anticipo: todavía no está confirmada.
    case 'RESERVA_POR_CONFIRMAR':
      return { titulo: '⏳ Reserva por confirmar', cuerpo: `${cliente} reservó${dia}${hora}. Se confirma cuando llegue el anticipo${monto}.` };
    case 'ANTICIPO_REPORTADO':
      if (data.comprobante === true) {
        return { titulo: '🧾 Llegó el comprobante del anticipo', cuerpo: `${cliente} envió el comprobante del anticipo${monto} de la reserva${dia}${hora}. Revísalo y confírmalo en la app.` };
      }
      return { titulo: '💸 Dice que ya pagó el anticipo', cuerpo: `${cliente} avisó que pagó el anticipo${monto} de la reserva${dia}${hora}. Revísalo y confírmalo.` };
    case 'ANTICIPO_CONFIRMADO':
      return { titulo: '✅ Reserva confirmada', cuerpo: `Llegó el anticipo de ${cliente}: la reserva${dia}${hora} está confirmada.` };
    case 'ANTICIPO_RECHAZADO':
      return { titulo: '🔔 Reserva cancelada', cuerpo: `Se canceló la reserva${dia}${hora} de ${cliente}: no llegó el anticipo.` };
    case 'ANTICIPO_VENCIDO':
      return { titulo: '🔔 Reserva cancelada', cuerpo: `${cliente} no pagó el anticipo a tiempo: se liberó el horario${dia}${hora}.` };
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
        cuerpo: `${servicio}${data.time ? ` · ${data.time}` : ''}\nEsta reserva aún no tiene ${tl('professional')} ${g('professional', 'asignado', 'asignada')}.${porConfirmar}`,
      };
    case 'RESERVA_PENDIENTE_ASIGNADA':
      return {
        titulo: '✅ Reserva asignada',
        cuerpo: `${servicio}${data.time ? ` · ${data.time}` : ''}\nSe te asignó la reserva de ${cliente}.${porConfirmar}`,
      };
    case 'SERVICIO_REGISTRADO': {
      // Registro de servicio (Nexus Control). byRole = quién lo registró:
      // 'barber' -> avisa a los admins; 'admin' -> avisa al profesional.
      const precio = Number.isFinite(Number(data.price)) && data.price !== null && data.price !== '' ? ` · Bs ${Number(data.price)}` : '';
      const fecha = data.dateLabel ? ` del ${data.dateLabel}` : '';
      const titulo = `✅ ${t('service')} ${g('service', 'registrado', 'registrada')}`;
      if (data.byRole === 'admin') {
        return { titulo, cuerpo: `Se registró ${servicio}${fecha} a tu nombre${precio}.` };
      }
      const quien = data.professionalName || `${g('professional', 'Un', 'Una')} ${tl('professional')}`;
      return { titulo, cuerpo: `${quien} registró ${servicio}${fecha}${precio}.` };
    }
    case 'RESERVA_CONFIRMADA_CLIENTE':
      return { titulo: '✅ ¡Reserva confirmada!', cuerpo: `Tu ${tl('appointment')}${hora} ${g('appointment', 'quedó agendado', 'quedó agendada')}. ¡Te esperamos!` };
    default:
      return { titulo: 'GallyFlow', cuerpo: 'Tienes una actualización en tus reservas.' };
  }
}