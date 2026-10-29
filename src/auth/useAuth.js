import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { endSession } from '../shared/session/sessionApi';
import { markFreshLogin, consumeFreshLogin } from '../shared/session/sessionStore';
import { watchAuthRestore } from './authRestore';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Firebase no restauró el usuario a tiempo: "No se pudo conectar" (no el login).
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => watchAuthRestore({
    subscribe: (onUser, onError) => onAuthStateChanged(auth, onUser, onError),
    onChange: (state) => {
      if (state.status === 'unreachable') {
        setUnreachable(true);
        return;
      }
      setUnreachable(false);
      setUser(state.user);
      setLoading(false);
    },
  }), []);

  async function login(email, password) {
    setLoading(true);
    setError('');
    try {
      // La sesión del servidor que haya quedado guardada se reemplaza por la nueva.
      markFreshLogin();
      await signInWithEmailAndPassword(auth, email, password);
      // ✅ NO llamar setUser aquí. onAuthStateChanged lo maneja solo.
      // ✅ NO llamar setLoading(false) aquí. onAuthStateChanged lo hace.
    } catch (err) {
      console.log('Error login:', err.code, err.message);
      consumeFreshLogin();
      setError('Correo o contraseña incorrectos.');
      setLoading(false); // Solo en error, porque onAuthStateChanged no dispara si falla
    }
  }

  async function logout() {
    await endSession();
    await signOut(auth);
    setUser(null);
    setError('');
  }

  // Reintentar: recargar la página para que Firebase vuelva a intentar.
  function retry() {
    window.location.reload();
  }

  return { user, error, loading, unreachable, login, logout, retry };
}
