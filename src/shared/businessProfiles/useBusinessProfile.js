import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  getBusinessProfile, getTerm, getTermGender, isModuleRelevant,
} from './businessProfileModel';

/**
 * Terminología del tipo de negocio para la UI.
 *
 *   t('professionals')   -> "Barberos" / "Doctores" / "Profesionales"
 *   tl('client')         -> "paciente" (minúscula, para frases)
 *   g('appointment', 'Nuevo', 'Nueva') -> concordancia de género
 *   hasModule('inventory') -> el módulo es relevante para el rubro
 *
 * Cada app (Admin / Barber / Cliente) llama useBusinessProfile(negocioId) y
 * pasa el valor por <BusinessProfileContext.Provider>. Los componentes
 * compartidos usan useBusinessTerms(). Sin Provider devuelve la
 * terminología genérica ('otro'), así nada se rompe.
 */
function buildValue(businessType, terminologyOverrides = null) {
  const profile = getBusinessProfile(businessType);
  const t = (key) => getTerm(profile, key, terminologyOverrides);
  return {
    type: profile.type,
    profile,
    t,
    tl: (key) => t(key).toLowerCase(),
    g: (key, masc, fem) => (getTermGender(profile, key) === 'f' ? fem : masc),
    hasModule: (moduleKey) => isModuleRelevant(profile, moduleKey),
  };
}

export const BusinessProfileContext = createContext(buildValue(null));

/**
 * Lee negocios/{negocioId}.businessType en tiempo real.
 * (El SDK de Firestore comparte el listener con los otros hooks que ya
 * escuchan el mismo documento, no suma lecturas.)
 */
export function useBusinessProfile(negocioId) {
  const [businessType, setBusinessType] = useState(null);

  useEffect(() => {
    if (!negocioId) { setBusinessType(null); return undefined; }
    const ref = doc(db, 'negocios', negocioId);
    const unsub = onSnapshot(
      ref,
      (snap) => setBusinessType(snap.exists() ? snap.data()?.businessType || null : null),
      () => setBusinessType(null),
    );
    return () => unsub();
  }, [negocioId]);

  // FUTURO: pasar negocios/{id}.terminologyOverrides como segundo argumento.
  return useMemo(() => buildValue(businessType), [businessType]);
}

export function useBusinessTerms() {
  return useContext(BusinessProfileContext);
}
