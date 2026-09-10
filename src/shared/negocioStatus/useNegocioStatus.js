import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';

/**
 * Escucha en tiempo real el campo `status` del negocio. Si el Super
 * Admin suspende un negocio mientras alguien lo tiene abierto, se
 * refleja solo, sin necesidad de refrescar la página.
 *
 * Negocios sin `status` todavía (creados antes de esta función, o por
 * auto-registro orgánico) se tratan como 'active' — nunca bloqueamos
 * por default, solo cuando el campo dice explícitamente lo contrario.
 */
export function useNegocioStatus(negocioId) {
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!negocioId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'negocios', negocioId);
    const unsub = onSnapshot(ref, (snap) => {
      setStatus(snap.exists() ? (snap.data().status || 'active') : 'active');
      setLoading(false);
    });
    return () => unsub();
  }, [negocioId]);

  const isBlocked = status === 'suspended' || status === 'expired';

  return { status, isBlocked, loading };
}