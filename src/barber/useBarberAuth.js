import { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

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

  async function loginBarber(username, password) {
    setLoading(true);
    setError('');
    try {
      const ref = collection(db, 'usuarios');
      const q = query(
        ref,
        where('username', '==', username.trim()),
        where('password', '==', password),
        where('rol', '==', 'barber')
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setError('Usuario o contraseña incorrectos.');
        setLoading(false);
        return;
      }

      const doc = snap.docs[0];
      const user = { id: doc.id, ...doc.data() };
      setBarberUser(user);
      persistSession(user);
    } catch (err) {
      console.error('Error al autenticar barber:', err);
      setError('Usuario o contraseña incorrectos.');
    }
    setLoading(false);
  }

  function logoutBarber() {
    setBarberUser(null);
    persistSession(null);
    setError('');
  }

  return { barberUser, error, loading, loginBarber, logoutBarber };
}