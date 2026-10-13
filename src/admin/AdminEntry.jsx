import { lazy, Suspense, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNegocio } from '../firebase/useNegocio';
import { getVertical } from '../shared/businessProfiles/businessProfileModel';
import { VERTICAL_ADMIN_APPS } from '../verticals';

// AdminApp (agenda) solo se descarga si el negocio es del vertical 'citas'.
const AdminApp = lazy(() => import('./AdminApp'));

/**
 * Punto ÚNICO donde el panel del admin decide qué app abrir según el tipo de
 * negocio (businessProfileModel -> vertical). Si el Super Admin cambia el
 * tipo, cambia solo, sin recargar.
 */
export default function AdminEntry({ user, fallback = null }) {
  const { negocioId, loading } = useNegocio(user);
  // undefined = todavía no se leyó el negocio
  const [businessType, setBusinessType] = useState(undefined);

  useEffect(() => {
    if (!negocioId) return undefined;
    const unsub = onSnapshot(
      doc(db, 'negocios', negocioId),
      (snap) => setBusinessType(snap.exists() ? (snap.data().businessType || null) : null),
      () => setBusinessType(null),
    );
    return () => unsub();
  }, [negocioId]);

  if (loading || !negocioId || businessType === undefined) return fallback;

  const VerticalApp = VERTICAL_ADMIN_APPS[getVertical(businessType)];
  return (
    <Suspense fallback={fallback}>
      {VerticalApp ? <VerticalApp user={user} negocioId={negocioId} /> : <AdminApp user={user} />}
    </Suspense>
  );
}
