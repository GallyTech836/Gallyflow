// useSessionGuard.js
// Revisa con el backend que la sesión siga activa: al abrir la app, al volver
// a la pestaña y cada 5 minutos. Si fue cerrada o venció, llama onInvalid.
// Sin conexión no hace nada (vuelve a intentar después).

import { useEffect, useRef } from 'react';
import { checkSession } from './sessionApi';

const INTERVALO_MS = 5 * 60 * 1000;

export function useSessionGuard(enabled, onInvalid) {
  const onInvalidRef = useRef(onInvalid);
  onInvalidRef.current = onInvalid;

  useEffect(() => {
    if (!enabled) return undefined;
    let activo = true;

    const revisar = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await checkSession();
        if (activo && r.status === 401) onInvalidRef.current(r.data?.code);
      } catch (_) { /* sin conexión */ }
    };

    revisar();
    const id = setInterval(revisar, INTERVALO_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      activo = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [enabled]);
}
