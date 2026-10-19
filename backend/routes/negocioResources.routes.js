// negocioResources.routes.js
//
// Altas con cupo del admin del negocio. Antes AdminApp creaba profesionales
// y sucursales directo en Firestore (el límite del plan solo se revisaba en
// la UI). Ahora se crean aquí, validando el límite en el servidor.
// El negocio sale SIEMPRE del token (adminUid), nunca del body.
//
//   GET  /api/negocio/quotas          -> cupos actuales (profesionales, sucursales)
//   POST /api/negocio/profesionales   -> crea profesional + usuarios/{id}
//   POST /api/negocio/sucursales      -> crea sucursal
//   PUT  /api/negocio/sucursales/:id  -> edita sucursal; si cambia el NOMBRE,
//        actualiza también profesionales, citas y números de WhatsApp que
//        guardaban el nombre anterior (la agenda filtra por nombre).
//
// Eliminar sigue igual (directo en Firestore): no aumenta el uso.

import { Router } from 'express';
import { db } from '../config/firebase.js';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { requireSession } from '../middlewares/session.middleware.js';
import { requireNegocioAdmin } from '../middlewares/negocioAdmin.middleware.js';
import { staffAdminRateLimit } from '../middlewares/rateLimit.middleware.js';
import { logger } from '../utils/logger.js';
import { createWithinQuota, getQuotas, QuotaError } from '../services/capabilities/quotaService.js';

const router = Router();
const guard = [identifyRequester, requireSession, requireNegocioAdmin, staffAdminRateLimit];

const texto = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : fallback);
const arr = (v, max = 200) => (Array.isArray(v) ? v.slice(0, max) : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
// Firestore no acepta undefined: se limpia cualquier valor anidado.
const sinUndefined = (v) => JSON.parse(JSON.stringify(v ?? null));

function sendError(res, err, where) {
  if (err instanceof QuotaError) {
    return res.status(err.status).json({ error: err.message, code: err.code, quota: err.quota || null });
  }
  logger.error(`[negocioResources] ${where}:`, err.message);
  return res.status(500).json({ error: 'Error interno.' });
}

router.get('/negocio/quotas', ...guard, async (req, res) => {
  try {
    return res.status(200).json(await getQuotas(req.negocioId));
  } catch (err) {
    return sendError(res, err, 'quotas');
  }
});

// Body: { firstName, lastName, username, branch, pin, active, avatar, services, permissions, availability }
// La contraseña NO viaja aquí: se asigna después con POST /api/staff/:id/password.
router.post('/negocio/profesionales', ...guard, async (req, res) => {
  const b = obj(req.body);
  const firstName = texto(b.firstName, 80);
  const lastName = texto(b.lastName, 80);
  const username = texto(b.username, 80);
  if (!firstName || !username) return res.status(400).json({ error: 'Faltan el nombre o el usuario.' });

  try {
    const result = await createWithinQuota(req.negocioId, 'profesionales', async (tx, { colRef }) => {
      const taken = await tx.get(db.collection('usuarios').where('username', '==', username).limit(1));
      if (!taken.empty) throw new QuotaError('usuario_en_uso', 409, { message: 'Ese usuario ya está en uso. Elige otro.' });
      const ref = colRef.doc();
      const data = sinUndefined({
        firstName,
        lastName,
        name: `${firstName} ${lastName}`.trim(),
        username,
        branch: texto(b.branch, 120),
        pin: texto(b.pin, 12),
        active: b.active !== false,
        rating: 5.0,
        avatar: texto(b.avatar, 1000),
        createdDate: new Date().toISOString(),
        attendance: { in: null, out: null, status: 'inactive' },
        performance: { servicesCount: 0, totalGenerated: 0 },
        services: arr(b.services),
        permissions: obj(b.permissions),
        availability: arr(b.availability, 14),
      });
      const userRef = db.collection('usuarios').doc(ref.id);
      return {
        ref,
        data,
        extraWrites: [{ ref: userRef, data: { username, rol: 'barber', negocioId: req.negocioId, uidFirebase: ref.id } }],
      };
    });
    logger.info(`[negocioResources] Profesional creado (negocio=${req.negocioId}, ${result.quota.used}/${result.quota.limit ?? '∞'})`);
    return res.status(201).json(result);
  } catch (err) {
    return sendError(res, err, 'crear profesional');
  }
});

// Foto de la sucursal: solo URLs https de Cloudinary (las sube el admin con
// el preset del front). Cualquier otra cosa se guarda vacía.
function imagenUrl(v) {
  const url = texto(v, 1000);
  return /^https:\/\/res\.cloudinary\.com\//.test(url) ? url : '';
}

// Body: { name, phone, address, schedule, lat, lng, mapsUrl, image }
router.post('/negocio/sucursales', ...guard, async (req, res) => {
  const b = obj(req.body);
  const name = texto(b.name, 120);
  const address = texto(b.address, 300);
  if (!name || !address) return res.status(400).json({ error: 'Faltan el nombre o la dirección.' });

  try {
    const result = await createWithinQuota(req.negocioId, 'sucursales', async (tx, { colRef }) => ({
      ref: colRef.doc(),
      data: {
        name,
        phone: texto(b.phone, 40),
        address,
        schedule: texto(b.schedule, 300),
        lat: num(b.lat, null),
        lng: num(b.lng, null),
        mapsUrl: texto(b.mapsUrl, 1000),
        image: imagenUrl(b.image),
        active: true,
        createdAt: new Date().toISOString(),
      },
    }));
    logger.info(`[negocioResources] Sucursal creada (negocio=${req.negocioId}, ${result.quota.used}/${result.quota.limit ?? '∞'})`);
    return res.status(201).json(result);
  } catch (err) {
    return sendError(res, err, 'crear sucursal');
  }
});

// Cambia `branch` de oldName a newName en todos los documentos que lo usan.
// Sin transacción (pueden ser cientos de citas): se actualiza de a 50.
async function renombrarSucursalEnDatos(negocioId, oldName, newName) {
  const negocioRef = db.collection('negocios').doc(negocioId);
  const [pros, citas, cuentas] = await Promise.all([
    negocioRef.collection('profesionales').where('branch', '==', oldName).get(),
    negocioRef.collection('citas').where('branch', '==', oldName).get(),
    db.collection('whatsappAccounts').where('negocioId', '==', negocioId).get(),
  ]);
  const refs = [
    ...pros.docs.map((d) => d.ref),
    ...citas.docs.map((d) => d.ref),
    ...cuentas.docs.filter((d) => d.data().branch === oldName).map((d) => d.ref),
  ];
  for (let i = 0; i < refs.length; i += 50) {
    await Promise.all(refs.slice(i, i + 50).map((ref) => ref.update({ branch: newName })));
  }
  return {
    profesionales: pros.size,
    citas: citas.size,
    whatsapp: refs.length - pros.size - citas.size,
  };
}

// Body: { name, phone, address, schedule, lat, lng, mapsUrl, image }
router.put('/negocio/sucursales/:id', ...guard, async (req, res) => {
  const b = obj(req.body);
  const name = texto(b.name, 120);
  const address = texto(b.address, 300);
  if (!name || !address) return res.status(400).json({ error: 'Faltan el nombre o la dirección.' });

  try {
    const negocioRef = db.collection('negocios').doc(req.negocioId);
    const ref = negocioRef.collection('sucursales').doc(String(req.params.id));
    const [snap, todas] = await Promise.all([ref.get(), negocioRef.collection('sucursales').get()]);
    if (!snap.exists) return res.status(404).json({ error: 'Sucursal no encontrada.' });
    const oldName = snap.data().name || '';
    const duplicada = todas.docs.some((d) => d.id !== ref.id && (d.data().name || '').trim().toLowerCase() === name.toLowerCase());
    if (duplicada) return res.status(409).json({ error: 'Ya existe otra sucursal con ese nombre.' });

    await ref.update({
      name,
      phone: texto(b.phone, 40),
      address,
      schedule: texto(b.schedule, 300),
      lat: num(b.lat, null),
      lng: num(b.lng, null),
      mapsUrl: texto(b.mapsUrl, 1000),
      image: imagenUrl(b.image),
    });

    let actualizados = null;
    if (oldName && oldName !== name) {
      actualizados = await renombrarSucursalEnDatos(req.negocioId, oldName, name);
      logger.info(`[negocioResources] Sucursal renombrada (negocio=${req.negocioId}): ${JSON.stringify(actualizados)}`);
    }
    return res.status(200).json({ ok: true, renamed: !!actualizados, actualizados });
  } catch (err) {
    return sendError(res, err, 'editar sucursal');
  }
});

export default router;
