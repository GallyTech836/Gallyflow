import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { normalizeBusinessSettings } from './businessSettingsModel';

// === PERSISTENCIA DE businessSettings ===
// Vive dentro de negocios/{negocioId}.businessSettings — nunca se crea
// colección nueva. Se normaliza antes de guardar, igual que heroConfig.

export async function saveBusinessSettings(negocioId, data) {
  if (!negocioId) {
    throw new Error('negocioId es requerido para guardar businessSettings.');
  }
  const clean = normalizeBusinessSettings(data);
  const ref = doc(db, 'negocios', negocioId);
  await setDoc(ref, { businessSettings: clean }, { merge: true });
  return clean;
}
