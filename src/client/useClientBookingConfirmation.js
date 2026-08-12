// useClientBookingConfirmation.js
//
// Envío de push de confirmación AL PROPIO CLIENTE, justo después de crear
// su reserva en ClienteApp. Completamente independiente de
// shared/notifications/useNotifications.js (ese hook es solo para
// AdminApp/BarberApp — ver su comentario "NUNCA para ClienteApp").
//
// No registra nada en Firestore ni en `usuarios`: usa el subscriptionId de
// OneSignal de esta sesión del navegador y le manda el push directo vía
// notifyDirect(). Si el cliente no da permiso, o el push falla por
// cualquier razón, no se interrumpe ni se reintenta el flujo de reserva —
// la reserva ya quedó guardada en Firestore de todos modos, esto es solo
// un extra.

import OneSignal from 'react-onesignal';
import { notifyDirect, NotificationType } from '../shared/notifications';

const ONESIGNAL_APP_ID = 'b9672f3e-256b-4fb9-970d-c016944a94e2';

// Módulo-level: ClienteApp permite reservar varias veces en la misma
// sesión (resetBooking vuelve al paso 0 sin recargar la página), así que
// el init de OneSignal debe ocurrir una sola vez por carga de página, no
// una vez por reserva.
let initPromise = null;

function ensureOneSignalInit() {
  if (!initPromise) {
    initPromise = OneSignal.init({ appId: ONESIGNAL_APP_ID }).catch((err) => {
      // Si el init falla, se limpia la promesa para poder reintentar en la
      // próxima reserva de la misma sesión en vez de quedar bloqueado.
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/**
 * Llamar (sin await, "fire and forget") justo después de guardar la
 * reserva del cliente en Firestore. No debe bloquear la transición a la
 * pantalla de éxito: pedir permiso de notificaciones puede tardar o
 * mostrar un diálogo del navegador.
 * @param {{ time?: string }} data - mismos datos que usa buildMessage() en el backend.
 */
export async function confirmBookingToClient(data) {
  try {
    await ensureOneSignalInit();
    await OneSignal.Notifications.requestPermission();

    const oneSignalId = OneSignal.User.PushSubscription.id;
    if (!oneSignalId) {
      // Permiso denegado o navegador sin soporte: la reserva ya está
      // confirmada visualmente en SuccessStep, esto es solo un extra.
      return;
    }

    await notifyDirect(oneSignalId, NotificationType.RESERVA_CONFIRMADA_CLIENTE, data);
  } catch (err) {
    console.warn('[confirmBookingToClient] No se pudo enviar la confirmación push:', err);
  }
}