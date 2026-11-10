// deleteNegocio.js
//
// Eliminación de un negocio desde Super Admin, ahora o programada a N días.
//
// Programar: el negocio queda suspendido al instante (nadie entra ni reserva)
// y guarda `deletion: { requestedAt, scheduledFor, days, prevStatus }`.
// Cancelar devuelve el estado que tenía. Un barrido cada hora (server.js)
// borra los que ya vencieron.
//
// Borrar elimina TODO lo del negocio:
//   - negocios/{id} con todas sus subcolecciones (citas, clientes, servicios,
//     profesionales, sucursales, cajas, uso, avisos, conversaciones…)
//   - usuarios/{id} y staffCredentials/{id} de sus profesionales
//   - authSessions del negocio y del administrador
//   - whatsappAccounts, negocioSecrets/{id} y assistantInbox (con mensajes)
//   - la cuenta de Firebase Auth del administrador
// Las fotos en Cloudinary no se pueden borrar desde aquí (se subieron con un
// preset sin firmar) y quedan sin uso.

import { getAuth } from 'firebase-admin/auth';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { invalidateNegocioAccess } from '../capabilities/capabilityService.js';

export const MAX_DELETION_DAYS = 90;

export class DeleteNegocioError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const negocioRef = (id) => db.collection('negocios').doc(String(id));

/** Fecha de borrado: ahora + días. */
export function deletionDate(days, now = new Date()) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function parseDays(raw) {
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 0 || days > MAX_DELETION_DAYS) {
    throw new DeleteNegocioError(400, `Elige entre 0 y ${MAX_DELETION_DAYS} días.`);
  }
  return days;
}

/** Suspende el negocio y programa su borrado. */
export async function scheduleNegocioDeletion(id, days, { by = '', now = new Date() } = {}) {
  const ref = negocioRef(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DeleteNegocioError(404, 'Negocio no encontrado.');
  const data = snap.data();
  const prevStatus = data.deletion?.prevStatus || data.status || 'active';
  const deletion = { requestedAt: now.toISOString(), scheduledFor: deletionDate(days, now), days, prevStatus, by };
  await ref.update({ deletion, status: 'suspended' });
  invalidateNegocioAccess(id);
  return deletion;
}

/** Cancela el borrado programado y devuelve el estado anterior. */
export async function cancelNegocioDeletion(id) {
  const ref = negocioRef(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DeleteNegocioError(404, 'Negocio no encontrado.');
  const data = snap.data();
  if (!data.deletion) throw new DeleteNegocioError(409, 'Este negocio no tiene un borrado programado.');
  const status = data.deletion.prevStatus || 'active';
  await ref.update({ deletion: null, status });
  invalidateNegocioAccess(id);
  return { status };
}

async function deleteDocs(docs) {
  for (let i = 0; i < docs.length; i += 50) {
    await Promise.all(docs.slice(i, i + 50).map((ref) => ref.delete()));
  }
  return docs.length;
}

/**
 * Borra el negocio completo, ya mismo.
 * @returns {Promise<object>} cuántos documentos de cada tipo se borraron.
 */
export async function deleteNegocioNow(id) {
  const slug = String(id);
  const ref = negocioRef(slug);
  const snap = await ref.get();
  if (!snap.exists) throw new DeleteNegocioError(404, 'Negocio no encontrado.');
  const { adminUid, email } = snap.data();

  // Profesionales: por la subcolección y por usuarios (por si quedó alguno suelto).
  const [prosSnap, usuariosSnap] = await Promise.all([
    ref.collection('profesionales').get(),
    db.collection('usuarios').where('negocioId', '==', slug).get(),
  ]);
  const proIds = new Set([...prosSnap.docs.map((d) => d.id), ...usuariosSnap.docs.map((d) => d.id)]);

  const [sesNegocio, sesAdmin, cuentas, inbox, solicitudes] = await Promise.all([
    db.collection('authSessions').where('negocioId', '==', slug).get(),
    adminUid ? db.collection('authSessions').where('uid', '==', adminUid).get() : Promise.resolve({ docs: [] }),
    db.collection('whatsappAccounts').where('negocioId', '==', slug).get(),
    db.collection('assistantInbox').where('negocioId', '==', slug).get(),
    db.collection('solicitudesRegistro').where('negocioId', '==', slug).get(),
  ]);

  const sesiones = new Map([...sesNegocio.docs, ...sesAdmin.docs].map((d) => [d.ref.path, d.ref]));
  const summary = {
    usuarios: await deleteDocs([...proIds].map((uid) => db.collection('usuarios').doc(uid))),
    credenciales: await deleteDocs([...proIds].map((uid) => db.collection('staffCredentials').doc(uid))),
    sesiones: await deleteDocs([...sesiones.values()]),
    whatsapp: await deleteDocs(cuentas.docs.map((d) => d.ref)),
    secretos: await deleteDocs([db.collection('negocioSecrets').doc(slug)]),
    conversaciones: 0,
    cuentaAdmin: false,
  };
  for (const d of inbox.docs) await db.recursiveDelete(d.ref); // con su subcolección messages
  summary.conversaciones = inbox.docs.length;

  // La solicitud de registro queda como historial, sin apuntar al negocio borrado.
  const hoy = new Date().toISOString().slice(0, 10);
  for (const d of solicitudes.docs) {
    await d.ref.update({ negocioId: null, status: 'descartada', note: `Negocio eliminado el ${hoy}.`, updatedAt: new Date().toISOString() });
  }

  // El negocio con TODAS sus subcolecciones.
  await db.recursiveDelete(ref);
  invalidateNegocioAccess(slug);

  // Cuenta del administrador (al final: si falla, los datos ya no existen y solo queda reintentar esto).
  try {
    let uid = adminUid;
    if (!uid && email) uid = (await getAuth().getUserByEmail(email)).uid;
    if (uid) { await getAuth().deleteUser(uid); summary.cuentaAdmin = true; }
  } catch (err) {
    if (err.code !== 'auth/user-not-found') logger.error(`[deleteNegocio] No se pudo borrar la cuenta de ${slug}:`, err.message);
  }

  logger.info(`[deleteNegocio] Negocio ${slug} eliminado: ${JSON.stringify(summary)}`);
  return summary;
}

/** Borra los negocios cuyo borrado programado ya venció. */
export async function runDueDeletions(now = new Date()) {
  const snap = await db.collection('negocios').where('deletion.scheduledFor', '<=', now.toISOString()).get();
  const done = [];
  for (const d of snap.docs) {
    try {
      await deleteNegocioNow(d.id);
      done.push(d.id);
    } catch (err) {
      logger.error(`[deleteNegocio] Falló el borrado programado de ${d.id}:`, err.message);
    }
  }
  return done;
}

/** Revisa cada hora (y un minuto después de arrancar) si hay borrados vencidos. */
export function startDeletionSweeper({ intervalMs = 60 * 60 * 1000, firstDelayMs = 60 * 1000 } = {}) {
  const run = () => runDueDeletions().catch((err) => logger.error('[deleteNegocio] Barrido:', err.message));
  const first = setTimeout(run, firstDelayMs);
  const every = setInterval(run, intervalMs);
  first.unref?.();
  every.unref?.();
  return () => { clearTimeout(first); clearInterval(every); };
}
