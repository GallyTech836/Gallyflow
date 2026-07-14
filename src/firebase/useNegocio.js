import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';
import { getNegocioSlug } from '../utils/negocio';

export function useNegocio(user) {
  const [negocioId, setNegocioId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) { setLoading(false); return; }
    const slug = getNegocioSlug(user.email);

    (async () => {
      const ref = doc(db, 'negocios', slug);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          slug,
          adminUid: user.uid,
          email: user.email,
          createdAt: new Date().toISOString(),
        });
      }
      setNegocioId(slug);
      setLoading(false);
    })();
  }, [user]);

  return { negocioId, loading };
}