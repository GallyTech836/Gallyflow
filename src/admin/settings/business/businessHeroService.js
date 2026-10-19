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

/**
 * Guarda al instante solo el logo o la portada ('' = quitar la foto), sin
 * tocar los demás campos del formulario que aún no se guardaron.
 */
export async function saveHeroImage(negocioId, field, url) {
  if (!negocioId) throw new Error('negocioId es requerido para guardar heroConfig.');
  if (field !== 'logo' && field !== 'cover') throw new Error(`Campo de imagen no válido: ${field}`);
  const ref = doc(db, 'negocios', negocioId);
  await setDoc(ref, { heroConfig: { [field]: typeof url === 'string' ? url.trim() : '' } }, { merge: true });
}