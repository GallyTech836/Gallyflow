// useNotifications.js
//
// Hook para AdminApp y BarberApp (NUNCA para ClienteApp). Se llama una
// sola vez, tras un login exitoso, con los datos del usuario.
//
// Inicializa OneSignal, pide permiso de notificaciones, obtiene el
// subscriptionId, y lo registra en el backend vía notificationApi.

import { useEffect, useRef } from 'react';
import OneSignal from 'react-onesignal';
import { registerDevice } from './notificationApi';

const ONESIGNAL_APP_ID = 'b9672f3e-256b-4fb9-970d-c016944a94e2';

export function useNotifications({ uid, rol, negocioId }) {
  const initialized = useRef(false);

  useEffect(() => {
    // No hacer nada si falta algún dato del usuario todavía (ej. mientras
    // carga el login), o si ya se inicializó antes en este montaje.
    if (!uid || !rol || !negocioId || initialized.current) return;
    initialized.current = true;

    async function setup() {
      try {
        await OneSignal.init({ appId: ONESIGNAL_APP_ID });
        await OneSignal.Notifications.requestPermission();

        // Si el permiso está dado pero la suscripción quedó desactivada
        // (opt-out), se reactiva.
        if (OneSignal.Notifications.permission && !OneSignal.User.PushSubscription.optedIn) {
          await OneSignal.User.PushSubscription.optIn();
        }

        // Al aceptar el permiso por primera vez, OneSignal crea la suscripción
        // unos segundos después: esperamos el ID en vez de rendirnos.
        const oneSignalId = await waitForSubscriptionId();
        if (!oneSignalId) {
          console.warn('[useNotifications] No se obtuvo subscriptionId (¿permiso denegado?).');
          return;
        }

        const result = await registerDevice({ uid, rol, negocioId, oneSignalId });
        if (!result?.ok) {
          console.warn('[useNotifications] El backend no confirmó el registro:', result);
        }
      } catch (err) {
        console.error('[useNotifications] Error al configurar notificaciones:', err);
      }
    }

    setup();
  }, [uid, rol, negocioId]);
}

function waitForSubscriptionId(timeoutMs = 15000) {
  const current = OneSignal.User.PushSubscription.id;
  if (current) return Promise.resolve(current);
  return new Promise((resolve) => {
    const onChange = (event) => {
      const id = event?.current?.id;
      if (id) finish(id);
    };
    const timer = setTimeout(() => finish(OneSignal.User.PushSubscription.id || null), timeoutMs);
    function finish(id) {
      clearTimeout(timer);
      OneSignal.User.PushSubscription.removeEventListener('change', onChange);
      resolve(id);
    }
    OneSignal.User.PushSubscription.addEventListener('change', onChange);
  });
}
