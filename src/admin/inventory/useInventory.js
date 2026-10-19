import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { monthRange } from './inventoryModel';

/** Productos del negocio en tiempo real (ordenados por nombre). */
export function useProducts(negocioId) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!negocioId) return undefined;
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'negocios', negocioId, 'productos'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
        setProducts(list);
        setLoading(false);
      },
      (err) => { console.error('[inventario] productos:', err); setLoading(false); },
    );
    return () => unsub();
  }, [negocioId]);
  return { products, loading };
}

/** Ventas de un mes ('AAAA-MM'), más recientes primero. Solo lee si `enabled`. */
export function useSales(negocioId, month, enabled = true) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!negocioId || !enabled) return undefined;
    setLoading(true);
    const { start, end } = monthRange(month);
    // Rango sobre un solo campo: no necesita índice compuesto.
    const q = query(
      collection(db, 'negocios', negocioId, 'ventas'),
      where('date', '>=', start),
      where('date', '<=', end),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setSales(list);
        setLoading(false);
      },
      (err) => { console.error('[inventario] ventas:', err); setLoading(false); },
    );
    return () => unsub();
  }, [negocioId, month, enabled]);
  return { sales, loading };
}

/** Últimos movimientos de stock. Solo lee si `enabled`. */
export function useMovements(negocioId, enabled = true, max = 100) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!negocioId || !enabled) return undefined;
    setLoading(true);
    const q = query(collection(db, 'negocios', negocioId, 'movimientosInventario'), orderBy('createdAt', 'desc'), limit(max));
    const unsub = onSnapshot(
      q,
      (snap) => { setMovements(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error('[inventario] movimientos:', err); setLoading(false); },
    );
    return () => unsub();
  }, [negocioId, enabled, max]);
  return { movements, loading };
}
