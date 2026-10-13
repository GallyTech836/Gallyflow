import { useState } from 'react';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { BASE_URL } from '../shared/notifications/notificationApi';

// Clave de localStorage donde vive la sesión del barbero. Se guarda sin el
// campo `password` (no hace falta después del login, y no tiene sentido
// dejarlo dando vueltas en el navegador).
const SESSION_KEY = 'gallyflow_barber_session';

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
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
  // Al montar, si ya había una sesión guardada, arranca logueado
  // directamente en vez de pedir usuario/contraseña de nuevo.
  const [barberUser, setBarberUser] = useState(() => readStoredSession());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

    // El backend valida usuario + contraseña (hash) y devuelve un token de
  // Firebase. La contraseña nunca se consulta desde el navegador.
  async function loginBarber(username, password) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(BASE_URL + '/auth/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        setError(res.status === 429 ? (data.error || 'Demasiados intentos. Espera unos minutos.') : 'Usuario o contraseña incorrectos.');
        setLoading(false);
        return;
      }
      await signInWithCustomToken(auth, data.token);
      setBarberUser(data.user);
      persistSession(data.user);
    } catch (err) {
      console.error('Error al autenticar barber:', err);
      setError('No se pudo iniciar sesión. Revisa tu conexión.');
    }
    setLoading(false);
  }

  function logoutBarber() {
    setBarberUser(null);
    persistSession(null);
    setError('');
    signOut(auth).catch(() => {});
  }

  return { barberUser, error, loading, loginBarber, logoutBarber };
}