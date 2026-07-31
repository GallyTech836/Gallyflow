// services/providers/oneSignalProvider.js
//
// Único archivo que sabe cómo hablar con la REST API de OneSignal.

import { oneSignalConfig } from '../../config/onesignal.js';

/**
 * @param {string} oneSignalId - Subscription ID del dispositivo destino.
 * @param {{ titulo: string, cuerpo: string }} mensaje
 */
export async function send(oneSignalId, mensaje, url) {
  const body = {
    app_id: oneSignalConfig.appId,
    include_subscription_ids: [oneSignalId],
    headings: { en: mensaje.titulo },
    contents: { en: mensaje.cuerpo },
  };

  if (url) {
    body.url = url;
  }

  const response = await fetch(`${oneSignalConfig.apiUrl}?c=push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${oneSignalConfig.restApiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`[oneSignalProvider] OneSignal respondió ${response.status}: ${JSON.stringify(data.errors || data)}`);
  }

  if (!data.id) {
    throw new Error(`[oneSignalProvider] OneSignal no despachó el mensaje: ${JSON.stringify(data.errors || 'sin detalle')}`);
  }

  return data;
}