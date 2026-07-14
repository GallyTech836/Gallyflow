import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[useAuth] Iniciando onAuthStateChanged...');

    const unsub = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        console.log('[useAuth] Firebase respondió:', firebaseUser?.email || 'sin usuario');
        setUser(firebaseUser);
        setLoading(false);
      },
      (err) => {
        console.error('[useAuth] Error en onAuthStateChanged:', err);
        setError('Error de conexión con Firebase');
        setLoading(false);
      }
    );

    // Timeout de seguridad: si Firebase no responde en 5s, seguir adelante
    const timer = setTimeout(() => {
      console.log('[useAuth] Timeout - forzando loading=false');
      setLoading(false);
    }, 5000);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  async function login(email, password) {
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // ✅ NO llamar setUser aquí. onAuthStateChanged lo maneja solo.
      // ✅ NO llamar setLoading(false) aquí. onAuthStateChanged lo hace.
    } catch (err) {
      console.log('Error login:', err.code, err.message);
      setError('Correo o contraseña incorrectos.');
      setLoading(false); // Solo en error, porque onAuthStateChanged no dispara si falla
    }
  }

  async function logout() {
    await signOut(auth);
    setUser(null);
    setError('');
  }

  return { user, error, loading, login, logout };
}