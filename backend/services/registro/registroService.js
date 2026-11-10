// registroService.js
//
// Solicitudes del formulario público de registro (colección
// solicitudesRegistro, escrita solo por el backend) y creación del negocio
// completo desde Super Admin → Solicitudes.

import crypto from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { db } from '../../config/firebase.js';
import { createNegocio, CreateNegocioError } from '../negocios/createNegocio.js';
import { suggestUsername } from '../staff/staffCredentials.js';
import { getNegocioAccess } from '../capabilities/capabilityService.js';
import { getLimit } from '../capabilities/capabilityModel.js';
import { quotaState } from '../capabilities/quotaService.js';
import {
  sanitizeRegistro, buildHeroConfig, buildBusinessSettings, buildSucursalDoc,
  buildServicioDoc, buildProfesionalDoc, baseUsername, pickPin,
} from './registroModel.js';

export const COLLECTION = 'solicitudesRegistro';
const STATUSES = ['pendiente', 'creada', 'descartada'];

export class RegistroError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const hashIp = (ip) => crypto.createHash('sha256').update(`nexus-registro:${ip || ''}`).digest('hex').slice(0, 24);

/** Guarda una solicitud nueva (pendiente). No crea usuarios ni negocios. */
export async function saveSolicitud(rawData, { ip, userAgent } = {}) {
  const { data, errors } = sanitizeRegistro(rawData);
  if (errors.length) throw new RegistroError(400, errors[0], { errors });
  const now = new Date().toISOString();
  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    status: 'pendiente',
    createdAt: now,
    updatedAt: now,
    negocioId: null,
    note: '',
    origin: { ip: hashIp(ip), userAgent: String(userAgent || '').slice(0, 200) },
    data,
  });
  return { id: ref.id };
}

/** Lista para Super Admin, de la más nueva a la más vieja (máx. 100). */
export async function listSolicitudes(status = 'pendiente') {
  // Sin índice compuesto: se ordena por createdAt y se filtra el estado aquí.
  const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(300).get();
  return snap.docs
    .map((d) => {
      const { origin, ...rest } = d.data();
      return { id: d.id, ...rest };
    })
    .filter((s) => status === 'todas' || s.status === status)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 100);
}

/** Cambio manual de estado: solo pendiente ↔ descartada. */
export async function updateSolicitud(id, { status, note } = {}) {
  if (!['pendiente', 'descartada'].includes(status)) throw new RegistroError(400, 'Estado inválido.');
  const ref = db.collection(COLLECTION).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) throw new RegistroError(404, 'Solicitud no encontrada.');
  if (snap.data().status === 'creada') throw new RegistroError(409, 'Esta solicitud ya tiene un negocio creado.');
  await ref.update({
    status,
    note: status === 'descartada' ? String(note || '').trim().slice(0, 300) : '',
    updatedAt: new Date().toISOString(),
  });
  return { ok: true };
}

/** Borra lo creado si algo falla a mitad de camino (no deja negocios a medias). */
async function rollback({ slug, uid, written }) {
  for (const ref of written.reverse()) await ref.delete().catch(() => {});
  if (slug) await db.collection('negocios').doc(slug).delete().catch(() => {});
  if (uid) await getAuth().deleteUser(uid).catch(() => {});
}

/**
 * Crea el negocio completo a partir de la solicitud, con los mismos
 * documentos que quedan al cargarlo a mano. Siempre en prueba.
 * @returns {{ id, email, tempPassword, creados, cupos }}
 */
export async function createFromSolicitud(id, { planId, trialDays } = {}) {
  const solRef = db.collection(COLLECTION).doc(String(id));
  const solSnap = await solRef.get();
  if (!solSnap.exists) throw new RegistroError(404, 'Solicitud no encontrada.');
  const sol = solSnap.data();
  if (sol.status !== 'pendiente') throw new RegistroError(409, 'La solicitud ya no está pendiente.');
  if (!planId) throw new RegistroError(400, 'Elige un plan.');

  // Se vuelve a validar: la solicitud pudo guardarse con una versión vieja del formulario.
  const { data, errors } = sanitizeRegistro(sol.data);
  if (errors.length) throw new RegistroError(400, `La solicitud tiene datos inválidos: ${errors[0]}`, { errors });
  const n = data.negocio;

  let created;
  try {
    created = await createNegocio({
      name: n.name, businessType: n.businessType, ownerName: n.ownerName, ownerEmail: n.ownerEmail,
      phone: n.phone, country: n.country, city: n.city, plan: planId, status: 'trial', trialDays,
    });
  } catch (err) {
    if (err instanceof CreateNegocioError) throw new RegistroError(err.status, err.message);
    throw err;
  }

  const slug = created.id;
  const negocioRef = db.collection('negocios').doc(slug);
  const written = [];
  const nowIso = new Date().toISOString();
  try {
    // Configuración → Negocio
    await negocioRef.set({ heroConfig: buildHeroConfig(data), businessSettings: buildBusinessSettings(data) }, { merge: true });

    // Sucursales (como POST /api/negocio/sucursales)
    for (const s of data.sucursales) {
      const ref = negocioRef.collection('sucursales').doc();
      await ref.set(buildSucursalDoc(s, nowIso));
      written.push(ref);
    }

    // Servicios (como agregarServicio: IDs s1, s2… y createdAt en ms, en el orden del formulario)
    const serviceIdMap = {};
    const base = Date.now();
    for (let i = 0; i < data.servicios.length; i++) {
      const s = data.servicios[i];
      const sid = `s${i + 1}`;
      const ref = negocioRef.collection('servicios').doc(sid);
      await ref.set(buildServicioDoc(s, base + i));
      written.push(ref);
      serviceIdMap[s.tempId] = sid;
    }

    // Profesionales (como POST /api/negocio/profesionales) + usuarios/{id}.
    // Sin contraseña: el admin se la asigna al editar el profesional en AdminApp.
    const pinsUsados = new Set();
    const usuariosEnUso = new Set();
    for (const p of data.profesionales) {
      let username = await suggestUsername(baseUsername(p.firstName, p.lastName));
      for (let k = 2; usuariosEnUso.has(username) && k < 50; k++) username = await suggestUsername(`${baseUsername(p.firstName, p.lastName)}${k}`);
      usuariosEnUso.add(username);
      const ref = negocioRef.collection('profesionales').doc();
      await ref.set(buildProfesionalDoc(p, { username, pin: pickPin(pinsUsados), serviceIdMap, nowIso }));
      written.push(ref);
      const userRef = db.collection('usuarios').doc(ref.id);
      await userRef.set({ username, rol: 'barber', negocioId: slug, uidFirebase: ref.id });
      written.push(userRef);
    }

    await solRef.update({ status: 'creada', negocioId: slug, updatedAt: new Date().toISOString() });
  } catch (err) {
    await rollback({ slug, uid: created.uid, written });
    throw new RegistroError(500, 'No se pudo crear el negocio. No quedó nada a medias; puedes intentarlo de nuevo.', { cause: err });
  }

  // Cupos del plan: no se bloquea (se respeta lo que pidió el negocio), pero se avisa
  // para agregar complementos si pasa el límite.
  let cupos = null;
  try {
    const access = await getNegocioAccess(slug, { fresh: true });
    cupos = {
      profesionales: quotaState('profesionales', getLimit(access.capabilities, 'profesionales'), data.profesionales.length),
      sucursales: quotaState('sucursales', getLimit(access.capabilities, 'sucursales'), data.sucursales.length),
    };
  } catch (_) { /* solo informativo */ }

  return {
    id: slug,
    email: n.ownerEmail,
    tempPassword: created.tempPassword,
    creados: { sucursales: data.sucursales.length, servicios: data.servicios.length, profesionales: data.profesionales.length },
    cupos,
  };
}

export { STATUSES };
