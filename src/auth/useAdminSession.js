// useAdminSession.js
// Después del login del admin (correo + contraseña), abre o confirma su
// sesión del servidor. Si ya tiene 2 abiertas, devuelve status 'limit'
// para que elija cuál cerrar. Si el backend no responde, no bloquea la
// entrada (la sesión se crea en el próximo intento).
// La sesión guardada solo se descarta si el servidor lo dice (sessionRules).

import { useCallback, useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { getSessionId, setSessionId, sessionEndMessage, consumeFreshLogin } from '../shared/session/sessionStore';
import { restoreDecision, startDecision } from '../shared/session/sessionRules';
import { startAdminSession, checkSession } from '../shared/session/sessionApi';
import { useSessionGuard } from '../shared/session/useSessionGuard';

export function useAdminSession(user) {
  const [state, setState] = useState({ status: 'idle', sessions: [], message: '' });

  const start = useCallback(async (replaceSid) => {
    setState((s) => ({ ...s, status: 'checking' }));
    const ready = () => setState({ status: 'ready', sessions: [], message: '' });
    // Recién entró con correo y contraseña: la sesión guardada (si quedó una)
    // se reemplaza por la nueva, sin revisarla.
    const fresh = consumeFreshLogin();
    let replace = replaceSid;
    if (!replace && getSessionId()) {
      if (fresh) {
        replace = getSessionId();
      } else {
        let c = null;
        try { c = await checkSession(); } catch { /* sin conexión o sin token */ }
        const d = restoreDecision(c);
        if (d === 'ready' || d === 'keep') return ready(); // 'keep': el guard reintenta
        if (d === 'end') {
          setSessionId(null);
          await signOut(auth);
          return setState({ status: 'idle', sessions: [], message: sessionEndMessage(c.data.code) });
        }
        // 'renew': el servidor no la reconoce; se abre una nueva.
      }
      setSessionId(null);
    }
    let r = null;
    try { r = await startAdminSession(replace); } catch { /* sin conexión o sin token */ }
    const d = startDecision(r);
    if (d === 'limit') return setState({ status: 'limit', sessions: r.data.sessions || [], message: '' });
    if (d === 'signout') {
      await signOut(auth);
      return setState({ status: 'idle', sessions: [], message: 'No se pudo validar tu cuenta. Ingresa de nuevo.' });
    }
    ready(); // 'ready', o 'retry': no bloquear (la sesión se abre en el próximo intento)
  }, []);

  useEffect(() => {
    if (user) start();
    else setState((s) => ({ ...s, status: 'idle', sessions: [] }));
  }, [user, start]);

  const cancel = useCallback(async () => {
    await signOut(auth);
    setState({ status: 'idle', sessions: [], message: '' });
  }, []);

  // Si la sesión se cierra desde otro dispositivo o vence: salir.
  useSessionGuard(state.status === 'ready' && !!user && !!getSessionId(), async (code) => {
    setSessionId(null);
    await signOut(auth);
    setState({ status: 'idle', sessions: [], message: sessionEndMessage(code) });
  });

  return { ...state, replace: start, cancel };
}
