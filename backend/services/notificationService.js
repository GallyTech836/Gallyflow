import * as oneSignalProvider from './providers/oneSignalProvider.js';
import * as whatsappProvider from './providers/whatsappProvider.js';
import * as emailProvider from './providers/emailProvider.js';

const PROVIDERS = {
  push: oneSignalProvider,
  whatsapp: whatsappProvider,
  email: emailProvider,
};

export async function sendNotification({ tipo, negocioId, data, actorUid }) {
  // TODO (Fase 3): getRecipients + armar mensaje + PROVIDERS.push.send(...)
  throw new Error('[notificationService] Envío de notificaciones no implementado todavía (Fase 3).');
}

export async function getRecipients(negocioId, roles, options = {}) {
  // TODO (Fase 3): query a `usuarios` por negocioId + rol, excluyendo options.excludeUid
  throw new Error('[notificationService] getRecipients no implementado todavía (Fase 3).');
}