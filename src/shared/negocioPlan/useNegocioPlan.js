import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';

const EMPTY_FEATURES = {};

/**
 * Dado un negocioId, resuelve en tiempo real qué plan tiene asignado
 * y qué funciones/límites incluye ese plan (leído de la colección
 * `planes`, la misma que administra el Super Admin). Dos pasos
 * encadenados: primero se escucha el negocio para saber su `plan`
 * (el ID del plan), después se escucha ese plan en sí — si cambias
 * algo desde el Super Admin, se refleja solo, sin refrescar.
 *
 * Si el negocio no tiene plan asignado, o el plan fue borrado,
 * `features` queda vacío — usa hasFeature()/getFeatureLimit() de abajo,
 * que ya tratan eso como "sin acceso" en vez de tronar.
 */
export function useNegocioPlan(negocioId) {
  const [planId, setPlanId] = useState(null);
  const [planData, setPlanData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!negocioId) { setLoading(false); return; }
    const ref = doc(db, 'negocios', negocioId);
    const unsub = onSnapshot(ref, (snap) => {
      setPlanId(snap.exists() ? (snap.data().plan || null) : null);
    });
    return () => unsub();
  }, [negocioId]);

  useEffect(() => {
    if (!planId) {
      setPlanData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'planes', planId);
    const unsub = onSnapshot(ref, (snap) => {
      setPlanData(snap.exists() ? snap.data() : null);
      setLoading(false);
    });
    return () => unsub();
  }, [planId]);

  const features = planData?.features || EMPTY_FEATURES;

  return { planId, planName: planData?.name || null, features, loading };
}

/** true si el plan incluye esa función (booleana simple, o limitable activada). */
export function hasFeature(features, key) {
  const val = features?.[key];
  if (val && typeof val === 'object') return !!val.enabled;
  return !!val;
}

/** número de límite de una función limitable (staff/sucursales), o null si no aplica. */
export function getFeatureLimit(features, key) {
  const val = features?.[key];
  if (val && typeof val === 'object' && typeof val.limit === 'number') return val.limit;
  return null;
}