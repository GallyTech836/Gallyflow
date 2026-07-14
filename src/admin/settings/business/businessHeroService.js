import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { normalizeHeroConfig } from '../../../shared/heroConfig/heroConfigModel';

// === PERSISTENCIA DE heroConfig ===
// Vive dentro de negocios/{negocioId}.heroConfig — nunca se crea colección
// nueva. Siempre se normaliza antes de guardar para no persistir campos
// con tipos inválidos.

export async function saveHeroConfig(negocioId, data) {
  if (!negocioId) {
    throw new Error('negocioId es requerido para guardar heroConfig.');
  }

  const clean = normalizeHeroConfig(data);
  const ref = doc(db, 'negocios', negocioId);
  await setDoc(ref, { heroConfig: clean }, { merge: true });
  return clean;
}