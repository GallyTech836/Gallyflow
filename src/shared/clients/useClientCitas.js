import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { citaBelongsToClient, isRealPhone } from './clientHistoryModel';

// Lectura puntual (NO listener, NO colección completa) de las citas de UN
// cliente. Son consultas de igualdad sobre un solo campo: Firestore las
// resuelve con los índices automáticos, no hace falta crear índices nuevos.
const MAX_PER_QUERY = 300;

export function useClientCitas(negocioId, client) {
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const clientId = client?.id;
  const clientName = client?.name;
  const clientPhone = client?.phone;

  useEffect(() => {
    if (!negocioId || !clientId) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    const ref = collection(db, 'negocios', negocioId, 'citas');
    const filters = [['clientId', clientId]];
    if (clientName) filters.push(['clientName', clientName]);
    if (isRealPhone(clientPhone)) {
      const digits = String(clientPhone).replace(/\D/g, '');
      [...new Set([clientPhone, digits, digits.slice(-8)])].filter(Boolean).forEach((v) => filters.push(['clientPhone', v]));
    }

    Promise.all(filters.map(([field, value]) => getDocs(query(ref, where(field, '==', value), limit(MAX_PER_QUERY)))))
      .then((snaps) => {
        if (cancelled) return;
        const byId = new Map();
        snaps.forEach((snap) => snap.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() })));
        const mine = [...byId.values()].filter((c) => citaBelongsToClient(c, { id: clientId, name: clientName, phone: clientPhone }));
        setCitas(mine);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'No se pudo cargar el historial.');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [negocioId, clientId, clientName, clientPhone, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { citas, loading, error, reload };
}
