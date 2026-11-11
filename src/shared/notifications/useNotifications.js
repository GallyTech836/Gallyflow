// useNotifications.js
//
// Hook para AdminApp y BarberApp (NUNCA para ClienteApp). Se llama una
// sola vez, tras un login exitoso, con los datos del usuario.
//
// Inicializa OneSignal, pide permiso de notificaciones, obtiene el
// subscriptionId, y lo registra en el backend vía notificationApi.

import { useCallback, useEffect, useRef, useState } from 'react';
import OneSignal from 'react-onesignal';
import { registerDevice, unregisterDevice } from './notificationApi';

const ONESIGNAL_APP_ID = 'b9672f3e-256b-4fb9-970d-c016944a94e2';

// iPhone/iPad: Safari solo muestra el aviso de permiso si se pide dentro de
// un toque del usuario. Pedirlo solo al iniciar sesión se ignora sin error.
function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function useNotifications({ uid, rol, negocioId }) {
  const initialized = useRef(false);
  const ready = useRef(false);
  // true -> mostrar el botón "Activar notificaciones" (solo iOS, permiso sin pedir).
  const [needsPermission, setNeedsPermission] = useState(false);

  // Registra este dispositivo en el backend (permiso ya concedido).
  const subscribe = useCallback(async () => {
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
  }, [uid, rol, negocioId]);

  useEffect(() => {
    // No hacer nada si falta algún dato del usuario todavía (ej. mientras
    // carga el login), o si ya se inicializó antes en este montaje.
    if (!uid || !rol || !negocioId || initialized.current) return;
    initialized.current = true;

    async function setup() {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          // Al tocar la notificación: si Nexus ya está abierto (la app
          // instalada o una pestaña del mismo dominio), se usa esa ventana y
          // se navega al link, en vez de abrir una pestaña nueva del navegador.
          notificationClickHandlerMatch: 'origin',
          notificationClickHandlerAction: 'navigate',
        });
        ready.current = true;

        // En Safari normal (sin instalar) iOS no permite notificaciones.
        if (!OneSignal.Notifications.isPushSupported()) return;

        const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
        if (permission === 'default' && isIOS()) {
          // Se pide desde el botón (requestPermission).
          setNeedsPermission(true);
          return;
        }

        if (permission === 'default') {
          await OneSignal.Notifications.requestPermission();
        }
        await subscribe();
      } catch (err) {
        console.error('[useNotifications] Error al configurar notificaciones:', err);
      }
    }

    setup();
  }, [uid, rol, negocioId, subscribe]);

  // Llamar directo desde el onClick (sin await antes): iOS exige el toque.
  const requestPermission = useCallback(() => {
    if (!ready.current) return;
    setNeedsPermission(false);
    OneSignal.Notifications.requestPermission()
      .then(() => {
        if (OneSignal.Notifications.permission) return subscribe();
      })
      .catch((err) => console.error('[useNotifications] Error al pedir permiso:', err));
  }, [subscribe]);

  const dismiss = useCallback(() => setNeedsPermission(false), []);

  return { needsPermission, requestPermission, dismiss };
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

// Al cerrar sesión: este navegador deja de recibir los avisos de ese usuario.
// Se llama ANTES de signOut (necesita el token). Nunca bloquea el cierre de
// sesión: si falla o tarda más de 3 s, se sigue igual.
export async function unregisterThisDevice(uid) {
  if (!uid) return;
  try {
    const oneSignalId = OneSignal.User?.PushSubscription?.id;
    if (!oneSignalId) return;
    await Promise.race([
      unregisterDevice({ uid, oneSignalId }),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch (err) {
    console.warn('[unregisterThisDevice] No se pudo quitar el dispositivo:', err);
  }
}
