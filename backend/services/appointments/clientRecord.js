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

// Formatos en que puede estar guardado el teléfono en `clientes`.
export function variantesTelefono(phoneDigits) {
  const set = new Set([phoneDigits, `+${phoneDigits}`]);
  if (phoneDigits.length > 8) {
    const local = phoneDigits.slice(-8);
    set.add(local);
    set.add(`+591 ${local}`);
    set.add(`+591${local}`);
  }
  return [...set].filter(Boolean);
}

/**
 * Busca un cliente por teléfono sin descargar toda la colección:
 * 1) doc con id = dígitos (así lo guarda ClienteApp)  2) consulta `phone in [...]`.
 * Devuelve { id, ...datos } o null. Nunca lanza.
 */
export async function findClientByPhone(negocioId, phone) {
  try {
    const clientesRef = db.collection('negocios').doc(negocioId).collection('clientes');
    const phoneDigits = soloDigitos(phone);
    if (!phoneDigits) return null;

    for (const id of [phoneDigits, phoneDigits.slice(-8)]) {
      const snap = await clientesRef.doc(id).get();
      if (snap.exists) return { id: snap.id, ...snap.data() };
    }
    const q = await clientesRef.where('phone', 'in', variantesTelefono(phoneDigits)).limit(1).get();
    return q.empty ? null : { id: q.docs[0].id, ...q.docs[0].data() };
  } catch (err) {
    logger.warn('[clientRecord] findClientByPhone falló:', err.message);
    return null;
  }
}

export async function upsertClientFromPhone({ negocioId, phone, name, date, serviceName }) {
  try {
    const clientesRef = db.collection('negocios').doc(negocioId).collection('clientes');
    const phoneDigits = soloDigitos(phone);

    let existing = phoneDigits ? await findClientByPhone(negocioId, phoneDigits) : null;
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
