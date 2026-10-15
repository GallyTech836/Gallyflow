// catalogInTx.js
//
// Lee, dentro de una transacción de Firestore, los servicios del catálogo
// (negocios/{id}/servicios) que usa una cita. Se usa para recalcular el precio
// en el servidor (precio por profesional) sin confiar en el que manda quien
// llama. Debe llamarse ANTES de cualquier escritura de la transacción.

/**
 * @returns {Promise<Array<{id:string}>>} servicios existentes (los borrados no vienen).
 */
export async function readServicesInTx(tx, negocioRef, serviceIds = []) {
    const ids = [...new Set((serviceIds || []).filter(Boolean).map(String))];
    if (ids.length === 0) return [];
    const snaps = await Promise.all(ids.map((id) => tx.get(negocioRef.collection('servicios').doc(id))));
    return snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }));
  }
  