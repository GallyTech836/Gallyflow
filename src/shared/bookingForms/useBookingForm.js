import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { resolveBookingForm } from './bookingFormModel';

/**
 * Formulario de reserva del negocio (peluquería canina: datos de la mascota),
 * o null si su tipo de negocio no tiene formulario. Lee
 * negocios/{id}.businessType y .bookingFormConfig en tiempo real (el SDK
 * comparte el listener del documento con los otros hooks del negocio).
 */
export function useBookingForm(negocioId) {
  const [raw, setRaw] = useState({ businessType: null, config: null });

  useEffect(() => {
    if (!negocioId) { setRaw({ businessType: null, config: null }); return undefined; }
    const unsub = onSnapshot(
      doc(db, 'negocios', negocioId),
      (snap) => {
        const d = snap.exists() ? snap.data() : {};
        setRaw({ businessType: d.businessType || null, config: d.bookingFormConfig || null });
      },
      () => setRaw({ businessType: null, config: null }),
    );
    return () => unsub();
  }, [negocioId]);

  const key = JSON.stringify(raw);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolveBookingForm(raw.businessType, raw.config), [key]);
}
