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
      alert('[useNotifications] setup() se está ejecutando');
      try {
        await OneSignal.init({ appId: ONESIGNAL_APP_ID });
        await OneSignal.Notifications.requestPermission();

        const oneSignalId = OneSignal.User.PushSubscription.id;
        if (!oneSignalId) {
          console.warn('[useNotifications] No se obtuvo subscriptionId (¿permiso denegado?).');
          return;
        }

        const result = await registerDevice({ uid, rol, negocioId, oneSignalId });
        if (!result?.ok) {
          console.warn('[useNotifications] El backend no confirmó el registro:', result);
        }
      } carch (err) {
        alert('[useNotifications] ERROR: ' + err.message);
      }
    }

    setup();
  }, [uid, rol, negocioId]);
}