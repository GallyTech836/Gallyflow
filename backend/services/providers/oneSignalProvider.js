// services/providers/oneSignalProvider.js
//
// Único archivo que sabe cómo hablar con la REST API de OneSignal.

import { oneSignalConfig } from '../../config/onesignal.js';

/**
 * @param {string} oneSignalId - Subscription ID del dispositivo destino.
 * @param {{ titulo: string, cuerpo: string }} mensaje
 */
export async function send(oneSignalId, mensaje) {
  const response = await fetch(`${oneSignalConfig.apiUrl}?c=push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Las claves nuevas (formato os_v2_app_...) usan el prefijo "Key ",
      // distinto al "Basic" que usaban las claves heredadas.
      Authorization: `Key ${oneSignalConfig.restApiKey}`,
    },
    body: JSON.stringify({
      app_id: oneSignalConfig.appId,
      include_subscription_ids: [oneSignalId],
      headings: { en: mensaje.titulo },
      contents: { en: mensaje.cuerpo },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`[oneSignalProvider] OneSignal respondió ${response.status}: ${JSON.stringify(data.errors || data)}`);
  }

  if (!data.id) {
    // Respuesta válida pero sin destinatario real (ej. el dispositivo se desuscribió).
    throw new Error(`[oneSignalProvider] OneSignal no despachó el mensaje: ${JSON.stringify(data.errors || 'sin detalle')}`);
  }

  return data;
}