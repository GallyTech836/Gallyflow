// useAdminSession.js
// Después del login del admin (correo + contraseña), abre o confirma su
// sesión del servidor. Si ya tiene 2 abiertas, devuelve status 'limit'
// para que elija cuál cerrar. Si el backend no responde, no bloquea la
// entrada (la sesión se crea en el próximo intento).

import { useCallback, useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { getSessionId, setSessionId, sessionEndMessage } from '../shared/session/sessionStore';
import { startAdminSession, checkSession } from '../shared/session/sessionApi';
import { useSessionGuard } from '../shared/session/useSessionGuard';

export function useAdminSession(user) {
  const [state, setState] = useState({ status: 'idle', sessions: [], message: '' });

  const start = useCallback(async (replaceSid) => {
    setState((s) => ({ ...s, status: 'checking' }));
    try {
      if (!replaceSid && getSessionId()) {
        const c = await checkSession();
        if (c.ok) return setState({ status: 'ready', sessions: [], message: '' });
        setSessionId(null);
      }
      const r = await startAdminSession(replaceSid);
      if (r.ok) return setState({ status: 'ready', sessions: [], message: '' });
      if (r.status === 409) return setState({ status: 'limit', sessions: r.data.sessions || [], message: '' });
      if (r.status === 401 || r.status === 403) {
        await signOut(auth);
        return setState({ status: 'idle', sessions: [], message: 'No se pudo validar tu cuenta. Ingresa de nuevo.' });
      }
      setState({ status: 'ready', sessions: [], message: '' }); // error del servidor: no bloquear
    } catch (_) {
      setState({ status: 'ready', sessions: [], message: '' }); // sin conexión: no bloquear
    }
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
