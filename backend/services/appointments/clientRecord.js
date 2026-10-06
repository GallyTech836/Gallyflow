// clientRecord.js
//
// Crea o actualiza el cliente en negocios/{negocioId}/clientes a partir del
// teléfono de WhatsApp (mismos campos que ClienteApp), y devuelve su id para
// guardarlo como clientId en la cita. Nunca lanza: si falla, la reserva sigue.

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';

const soloDigitos = (v) => String(v || '').replace(/[^0-9]/g, '');

// "59171234567" y "71234567" son el mismo número: se comparan los últimos 8 dígitos.
function mismoTelefono(a, b) {
  const da = soloDigitos(a);
  const dbb = soloDigitos(b);
  if (!da || !dbb) return false;
  if (da === dbb) return true;
  return da.length >= 8 && dbb.length >= 8 && da.slice(-8) === dbb.slice(-8);
}

export async function upsertClientFromPhone({ negocioId, phone, name, date, serviceName }) {
  try {
    const clientesRef = db.collection('negocios').doc(negocioId).collection('clientes');
    const phoneDigits = soloDigitos(phone);

    let existing = null;
    if (phoneDigits) {
      const directo = await clientesRef.doc(phoneDigits).get();
      if (directo.exists) existing = { id: directo.id, ...directo.data() };
    }
    if (!existing && phoneDigits) {
      const snap = await clientesRef.get();
      const doc = snap.docs.find((d) => mismoTelefono(d.data()?.phone, phoneDigits));
      if (doc) existing = { id: doc.id, ...doc.data() };
    }

    const clientDocId = existing?.id || phoneDigits || `cliente-${Date.now()}`;
    const data = {
      name: existing?.name || name?.trim() || 'Cliente WhatsApp',
      lastVisit: date,
      favoriteService: existing?.favoriteService || serviceName || 'N/A',
      visits: FieldValue.increment(1),
      totalSpent: FieldValue.increment(0),
    };
    if (!existing?.phone) data.phone = phoneDigits ? `+${phoneDigits}` : 'N/A';

    await clientesRef.doc(clientDocId).set(data, { merge: true });
    return clientDocId;
  } catch (err) {
    logger.warn('[clientRecord] No se pudo guardar el cliente:', err.message);
    return null;
  }
}