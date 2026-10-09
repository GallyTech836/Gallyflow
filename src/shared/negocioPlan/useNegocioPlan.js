import { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { resolveCapabilities, canUse, getLimit } from '../capabilities/capabilityModel';
import { getBusinessProfile } from '../businessProfiles/businessProfileModel';

const EMPTY = {};

/**
 * Capacidades efectivas del negocio, en tiempo real.
 *
 * Escucha `negocios/{id}` (plan + capabilityOverrides) y `planes/{planId}`,
 * y resuelve con el modelo compartido (excepción > restricción del tipo de
 * negocio > plan > default). El tipo nunca habilita nada por sí mismo.
 * Si el Super Admin cambia el plan o una excepción, se refleja solo.
 *
 * Devuelve:
 *   capabilities  -> mapa resuelto { key: { enabled, limit, source, ... } }
 *   can(key)      -> boolean
 *   limitOf(key)  -> número o null (ilimitado)
 *   features      -> `features` crudo del plan (compatibilidad)
 *
 * IMPORTANTE: esto solo decide qué se MUESTRA. Lo importante se valida
 * también en el backend (capabilityService) y en las reglas de Firestore.
 */
export function useNegocioPlan(negocioId) {
  const [planId, setPlanId] = useState(null);
  const [overrides, setOverrides] = useState(null);
  const [businessType, setBusinessType] = useState(null);
  const [planData, setPlanData] = useState(null);
  const [negocioLoaded, setNegocioLoaded] = useState(false);
  const [planLoaded, setPlanLoaded] = useState(false);

  useEffect(() => {
    if (!negocioId) { setNegocioLoaded(true); return undefined; }
    const ref = doc(db, 'negocios', negocioId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setPlanId(data.plan || null);
      setOverrides(data.capabilityOverrides || null);
      setBusinessType(data.businessType || null);
      setNegocioLoaded(true);
    }, () => setNegocioLoaded(true));
    return () => unsub();
  }, [negocioId]);

  useEffect(() => {
    if (!planId) {
      setPlanData(null);
      setPlanLoaded(true);
      return undefined;
    }
    setPlanLoaded(false);
    const ref = doc(db, 'planes', planId);
    const unsub = onSnapshot(ref, (snap) => {
      setPlanData(snap.exists() ? snap.data() : null);
      setPlanLoaded(true);
    }, () => setPlanLoaded(true));
    return () => unsub();
  }, [planId]);

  const features = planData?.features || EMPTY;
  const capabilities = useMemo(() => {
    // El tipo de negocio solo RESTRINGE (módulos no relevantes / defaults en false).
    const profile = getBusinessProfile(businessType);
    return resolveCapabilities({
      planFeatures: planData?.features || null,
      overrides,
      profileDefaults: profile.capabilityDefaults || null,
      relevantModules: profile.modules || null,
    });
  }, [planData, overrides, businessType],
  );
  const can = useCallback((key) => canUse(capabilities, key), [capabilities]);
  const limitOf = useCallback((key) => getLimit(capabilities, key), [capabilities]);

  return {
    planId,
    planName: planData?.name || null,
    features,
    capabilities,
    can,
    limitOf,
    loading: !negocioLoaded || !planLoaded,
  };
}

/**
 * Compatibilidad con el código anterior. Acepta tanto el mapa resuelto
 * (`capabilities`) como un `features` crudo de plan.
 */
export function hasFeature(features, key) {
  const val = features?.[key];
  if (val && typeof val === 'object') return !!val.enabled;
  return !!val;
}

export function getFeatureLimit(features, key) {
  const val = features?.[key];
  if (val && typeof val === 'object' && typeof val.limit === 'number') return val.limit;
  return null;
}
