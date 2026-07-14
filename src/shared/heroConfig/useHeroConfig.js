import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { DEFAULT_HERO_CONFIG, normalizeHeroConfig } from './heroConfigModel';

/**
 * Lee heroConfig en tiempo real desde negocios/{negocioId}.heroConfig.
 * Usado tanto por el formulario de Admin (para reflejar el estado guardado)
 * como por ClienteApp (para mostrar la pantalla de bienvenida real).
 *
 * Si el documento no existe, o no tiene heroConfig todavía (negocio nuevo),
 * devuelve DEFAULT_HERO_CONFIG sin lanzar error ni romper el render.
 */
export function useHeroConfig(negocioId) {
  const [heroConfig, setHeroConfig] = useState(DEFAULT_HERO_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!negocioId) {
      setHeroConfig(DEFAULT_HERO_CONFIG);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, 'negocios', negocioId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const raw = snap.exists() ? snap.data()?.heroConfig : null;
        setHeroConfig(normalizeHeroConfig(raw));
        setLoading(false);
      },
      (err) => {
        console.error('Error al leer heroConfig:', err);
        setHeroConfig({ ...DEFAULT_HERO_CONFIG });
        setLoading(false);
      }
    );

    return () => unsub();
  }, [negocioId]);

  return { heroConfig, loading };
}