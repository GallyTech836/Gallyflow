import { useRef, useState } from 'react';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { BASE_URL } from '../shared/notifications/notificationApi';
import { getSessionId, setSessionId } from '../shared/session/sessionStore';
import { endSession } from '../shared/session/sessionApi';

// Datos del profesional para mostrar la app (no es la prueba de la sesión:
// la sesión real la valida el backend con el token de Firebase + sesión).
const SESSION_KEY = 'gallyflow_barber_session';

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const user = raw ? JSON.parse(raw) : null;
    // Sesiones de antes de la etapa 3 (sin sesión del servidor): volver a entrar.
    if (user && !getSessionId()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

function persistSession(user) {
  try {
    if (user) {
      const { password, ...safeUser } = user;
      localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (err) {
    console.error('No se pudo guardar la sesión del barbero:', err);
  }
}

export function useBarberAuth() {
  const [barberUser, setBarberUser] = useState(() => readStoredSession());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Si ya hay 2 sesiones abiertas: lista para elegir cuál cerrar.
  const [sessionLimit, setSessionLimit] = useState(null);
  const pendiente = useRef(null); // { username, password } solo mientras elige

  // El backend valida usuario + contraseña (hash), abre la sesión del
  // servidor y devuelve un token de Firebase.
  async function loginBarber(username, password, replaceSid) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(BASE_URL + '/auth/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, ...(replaceSid ? { replaceSid } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.code === 'SESSION_LIMIT') {
        pendiente.current = { username, password };
        setSessionLimit(data.sessions || []);
        setLoading(false);
        return;
      }
      if (!res.ok || !data.token) {
        setError(res.status === 429 ? (data.error || 'Demasiados intentos. Espera unos minutos.') : 'Usuario o contraseña incorrectos.');
        setLoading(false);
        return;
      }
      pendiente.current = null;
      setSessionLimit(null);
      setSessionId(data.sid);
      await signInWithCustomToken(auth, data.token);
      setBarberUser(data.user);
      persistSession(data.user);
    } catch (err) {
      console.error('Error al autenticar barber:', err);
      setError('No se pudo iniciar sesión. Revisa tu conexión.');
    }
    setLoading(false);
  }

  // Cerrar una de las 2 sesiones abiertas y entrar.
  async function chooseSessionToClose(sid) {
    if (!pendiente.current) return;
    const { username, password } = pendiente.current;
    await loginBarber(username, password, sid);
  }

  function cancelSessionLimit() {
    pendiente.current = null;
    setSessionLimit(null);
  }

  // message: texto opcional para mostrar en el login (ej. sesión cerrada).
  async function logoutBarber(message) {
    setBarberUser(null);
    persistSession(null);
    setError(typeof message === 'string' ? message : '');
    await endSession();
    signOut(auth).catch(() => {});
  }

  return {
    barberUser, error, loading, loginBarber, logoutBarber,
    sessionLimit, chooseSessionToClose, cancelSessionLimit,
  };
}
