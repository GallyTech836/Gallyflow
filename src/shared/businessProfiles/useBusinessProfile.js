import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { createTerms, isModuleRelevant } from './businessProfileModel';

/**
 * Terminología del tipo de negocio para la UI.
 *
 *   t('professionals')   -> "Barberos" / "Doctores" / "Profesionales"
 *   tl('client')         -> "paciente" (minúscula, para frases)
 *   g('appointment', 'Nuevo', 'Nueva') -> concordancia de género
 *   hasModule('inventory') -> el módulo es relevante para el rubro
 *
 * Prioridad: personalización del negocio (terminologyOverrides) > tipo > genérico.
 *
 * Cada app (Admin / Barber / Cliente) llama useBusinessProfile(negocioId) y
 * pasa el valor por <BusinessProfileContext.Provider>. Los componentes
 * compartidos usan useBusinessTerms(). Sin Provider devuelve la
 * terminología genérica ('otro'), así nada se rompe.
 */
function buildValue(businessType, terminologyOverrides = null) {
  const terms = createTerms(businessType, terminologyOverrides);
  return {
    ...terms,
    hasModule: (moduleKey) => isModuleRelevant(terms.profile, moduleKey),
  };
}

export const BusinessProfileContext = createContext(buildValue(null));

/**
 * Lee negocios/{negocioId}.businessType y .terminologyOverrides en tiempo real.
 * (El SDK de Firestore comparte el listener con los otros hooks que ya
 * escuchan el mismo documento, no suma lecturas.)
 */
export function useBusinessProfile(negocioId) {
  const [businessType, setBusinessType] = useState(null);
  const [overrides, setOverrides] = useState(null);

  useEffect(() => {
    if (!negocioId) { setBusinessType(null); setOverrides(null); return undefined; }
    const ref = doc(db, 'negocios', negocioId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setBusinessType(data?.businessType || null);
        setOverrides(data?.terminologyOverrides || null);
      },
      () => { setBusinessType(null); setOverrides(null); },
    );
    return () => unsub();
  }, [negocioId]);

  // Las personalizaciones llegan como objeto nuevo en cada snapshot: se
  // memoiza por su contenido para no recrear funciones sin cambios reales.
  const overridesKey = JSON.stringify(overrides || null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildValue(businessType, overrides), [businessType, overridesKey]);
}

export function useBusinessTerms() {
  return useContext(BusinessProfileContext);
}
