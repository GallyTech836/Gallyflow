// usePromotions.js — Promociones del negocio en tiempo real y sus escrituras.
// Las escribe solo el admin del negocio (reglas de Firestore: promociones,
// lectura pública porque el link de reservas las muestra).

import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

const col = (negocioId) => collection(db, 'negocios', negocioId, 'promociones');

/** Lista de promociones (todas: activas, programadas, pausadas y vencidas). */
export function usePromotions(negocioId, enabled = true) {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!negocioId || !enabled) { setLoading(false); return undefined; }
    setLoading(true);
    const unsub = onSnapshot(
      col(negocioId),
      (snap) => {
        setPromotions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setError('');
        setLoading(false);
      },
      (err) => {
        console.error('[promociones]', err);
        setError('No se pudieron cargar las promociones.');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [negocioId, enabled]);

  return { promotions, loading, error };
}

export async function createPromotion(negocioId, data) {
  const now = serverTimestamp();
  return addDoc(col(negocioId), { ...data, createdAt: now, updatedAt: now });
}

export async function updatePromotion(negocioId, id, data) {
  return updateDoc(doc(db, 'negocios', negocioId, 'promociones', id), { ...data, updatedAt: serverTimestamp() });
}

export async function setPromotionActive(negocioId, id, active) {
  return updateDoc(doc(db, 'negocios', negocioId, 'promociones', id), { active: !!active, updatedAt: serverTimestamp() });
}

export async function deletePromotion(negocioId, id) {
  return deleteDoc(doc(db, 'negocios', negocioId, 'promociones', id));
}

/**
 * Sucursales del negocio ({ id, name }), solo para resolver en qué sucursal
 * vale una promoción. Se lee solo si `enabled` (alguna promo es por sucursal).
 */
export function usePromotionBranches(negocioId, enabled = true) {
  const [branches, setBranches] = useState([]);
  useEffect(() => {
    if (!negocioId || !enabled) return undefined;
    const unsub = onSnapshot(
      collection(db, 'negocios', negocioId, 'sucursales'),
      (snap) => setBranches(snap.docs.map((d) => ({ id: d.id, name: d.data()?.name || '' }))),
      (err) => console.error('[promociones] sucursales:', err),
    );
    return () => unsub();
  }, [negocioId, enabled]);
  return branches;
}
