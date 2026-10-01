import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { DEFAULT_BUSINESS_SETTINGS, normalizeBusinessSettings } from './businessSettingsModel';

/**
 * Lee negocios/{negocioId}.businessSettings en tiempo real. Usado por el
 * formulario de Admin (Negocio) y por ClienteApp (para calcular horarios
 * disponibles respetando el horario del negocio y la anticipación mínima).
 * Sin datos guardados todavía, devuelve los valores por defecto (sin
 * restricción), igual que useHeroConfig hace con heroConfig.
 */
export function useBusinessSettings(negocioId) {
  const [businessSettings, setBusinessSettings] = useState(DEFAULT_BUSINESS_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!negocioId) {
      setBusinessSettings(DEFAULT_BUSINESS_SETTINGS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'negocios', negocioId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const raw = snap.exists() ? snap.data()?.businessSettings : null;
        setBusinessSettings(normalizeBusinessSettings(raw));
        setLoading(false);
      },
      (err) => {
        console.error('Error al leer businessSettings:', err);
        setBusinessSettings({ ...DEFAULT_BUSINESS_SETTINGS });
        setLoading(false);
      }
    );
    return () => unsub();
  }, [negocioId]);

  return { businessSettings, loading };
}
