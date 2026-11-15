// useAwaitingDeposits.js — Reservas que esperan el anticipo (todas, de cualquier día).
// Una sola consulta en vivo por igualdad sobre deposit.status (índice automático).
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';

export function useAwaitingDeposits(negocioId, enabled) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!enabled || !negocioId) { setList([]); return undefined; }
    const q = query(collection(db, 'negocios', negocioId, 'citas'), where('deposit.status', '==', 'awaiting'));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.status === 'pending');
      rows.sort((a, b) => String(a.deposit?.expiresAt || '').localeCompare(String(b.deposit?.expiresAt || '')));
      setList(rows);
    }, () => setList([]));
    return unsub;
  }, [negocioId, enabled]);
  return list;
}
