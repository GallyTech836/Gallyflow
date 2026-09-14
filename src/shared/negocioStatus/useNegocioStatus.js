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
// Idéntico criterio al del panel Super Admin (src/data/useBusinesses.js):
// si ya pasó subscriptionEnd, se trata como vencido automáticamente sin
// depender de ningún cron — se recalcula cada vez que se lee el negocio.
function computeEffectiveStatus(status, subscriptionEnd) {
  if (status === 'suspended') return 'suspended';
  if (subscriptionEnd) {
    const end = new Date(subscriptionEnd);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (end < today) return 'expired';
  }
  return status;
}

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
      if (!snap.exists()) {
        setStatus('active');
      } else {
        const data = snap.data();
        setStatus(computeEffectiveStatus(data.status || 'active', data.subscriptionEnd || null));
      }
      setLoading(false);
    });
    return () => unsub();
  }, [negocioId]);

  const isBlocked = status === 'suspended' || status === 'expired';

  return { status, isBlocked, loading };
}