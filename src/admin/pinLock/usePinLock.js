// usePinLock.js
//
// Un solo desbloqueo para todo AdminApp: si el dueño pone el PIN en
// Barberos, Analítica y el resto de módulos bloqueados quedan abiertos
// mientras dure la sesión (15 min, la da el backend). El mismo token sirve
// para las llamadas de /api/finance.

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getLockedModules, isModuleLocked } from '../../shared/pinLock/pinLockModel';

export function usePinLock(negocioId) {
  const [lockedModules, setLockedModules] = useState(null); // null = cargando
  const [session, setSession] = useState(null); // { token, expiresAt }

  useEffect(() => {
    setSession(null);
    if (!negocioId) return undefined;
    setLockedModules(null);
    return onSnapshot(
      doc(db, 'negocios', negocioId),
      (snap) => setLockedModules(getLockedModules(snap.data() || {})),
      () => setLockedModules([]),
    );
  }, [negocioId]);

  // Al vencer la sesión se vuelve a bloquear solo.
  useEffect(() => {
    if (!session) return undefined;
    const ms = session.expiresAt - Date.now();
    if (ms <= 0) { setSession(null); return undefined; }
    const t = setTimeout(() => setSession(null), ms);
    return () => clearTimeout(t);
  }, [session]);

  const unlock = useCallback((token, minutes = 15) => {
    setSession({ token, expiresAt: Date.now() + minutes * 60 * 1000 });
  }, []);
  const lock = useCallback(() => setSession(null), []);

  const unlocked = !!session && session.expiresAt > Date.now();

  return {
    loading: lockedModules === null,
    lockedModules: lockedModules || [],
    hasLocks: (lockedModules || []).length > 0,
    unlocked,
    token: unlocked ? session.token : null,
    isLocked: (moduleKey) => isModuleLocked(lockedModules, moduleKey, unlocked),
    unlock,
    lock,
  };
}
