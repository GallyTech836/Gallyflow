import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { computeEffectiveStatus, isBlockedStatus } from '../capabilities/capabilityModel';

/**
 * Escucha en tiempo real el campo `status` del negocio. Si el Super
 * Admin suspende un negocio mientras alguien lo tiene abierto, se
 * refleja solo, sin necesidad de refrescar la página.
 *
 * Negocios sin `status` todavía (creados antes de esta función, o por
 * auto-registro orgánico) se tratan como 'active' — nunca bloqueamos
 * por default, solo cuando el campo dice explícitamente lo contrario.
 *
 * El criterio (suspendido / prueba vencida / suscripción vencida) vive en
 * capabilityModel.computeEffectiveStatus, el mismo que usan Super Admin y
 * el backend.
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
      if (!snap.exists()) {
        setStatus('active');
      } else {
        const data = snap.data();
        setStatus(computeEffectiveStatus(data.status || 'active', data.subscriptionEnd || null, data.trialEnd || null));
      }
      setLoading(false);
    });
    return () => unsub();
  }, [negocioId]);

  const isBlocked = isBlockedStatus(status);

  return { status, isBlocked, loading };
}
