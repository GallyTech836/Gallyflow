// useSessionGuard.js
// Revisa con el backend que la sesión siga activa: al abrir la app, al volver
// a la pestaña y cada 5 minutos. Solo llama onInvalid si el servidor dice
// explícitamente que se cerró, venció o no es válida (ver sessionRules).
// Sin conexión, sin token, 5xx o 401 sin código: no hace nada (reintenta después).

import { useEffect, useRef } from 'react';
import { checkSession } from './sessionApi';
import { guardDecision } from './sessionRules';
import { auth } from '../../firebase/config';

const INTERVALO_MS = 5 * 60 * 1000;

export function useSessionGuard(enabled, onInvalid) {
  const onInvalidRef = useRef(onInvalid);
  onInvalidRef.current = onInvalid;

  useEffect(() => {
    if (!enabled) return undefined;
    let activo = true;

    const revisar = async () => {
      if (document.visibilityState !== 'visible') return;
      // Sin usuario de Firebase (todavía restaurando) no se puede validar:
      // se espera al próximo intento en vez de dar la sesión por inválida.
      if (!auth.currentUser) return;
      try {
        const r = await checkSession();
        if (activo && guardDecision(r) === 'end') onInvalidRef.current(r.data?.code);
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
