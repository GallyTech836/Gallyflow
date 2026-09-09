import { Router } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { db } from '../config/firebase.js';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ⚠️ Mismo correo que en el frontend (src/auth/useSuperAdminAuth.js del
// proyecto Nexus Super Admin). Solo esta cuenta puede usar estas rutas,
// sin importar qué token de Firebase Auth válido llegue.
const SUPER_ADMIN_EMAIL = 'torricogali@gmail.com';

function requireSuperAdmin(req, res, next) {
  if (!req.actor?.verified || req.actor.email !== SUPER_ADMIN_EMAIL) {
    logger.warn('[superadmin] Acceso rechazado para:', req.actor?.email || 'sin token');
    return res.status(403).json({ error: 'No autorizado.' });
  }
  next();
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function generateTempPassword() {
  return Math.random().toString(36).slice(-10) + 'A1!';
}

// POST /api/superadmin/negocios
// Crea la cuenta de Firebase Auth del dueño + el documento del negocio
// en un solo paso atómico (si falla el negocio, se borra el usuario creado).
router.post('/negocios', identifyRequester, requireSuperAdmin, async (req, res) => {
  const { name, ownerName, ownerEmail, phone, country, city, plan, status } = req.body;

  if (!name || !ownerEmail) {
    return res.status(400).json({ error: 'Falta nombre del negocio o correo del propietario.' });
  }

  const tempPassword = generateTempPassword();
  let createdUid = null;

  try {
    const userRecord = await getAuth().createUser({
      email: ownerEmail,
      password: tempPassword,
      displayName: ownerName || name,
    });
    createdUid = userRecord.uid;

    const slug = slugify(name) || slugify(ownerEmail.split('@')[0]);
    const negocioRef = db.collection('negocios').doc(slug);

    await negocioRef.set({
      slug,
      name,
      ownerName: ownerName || '',
      email: ownerEmail,
      adminUid: createdUid,
      phone: phone || '',
      country: country || '',
      city: city || '',
      plan: plan || 'trial',
      status: status || 'trial',
      subscriptionEnd: null,
      createdAt: new Date().toISOString(),
    });

    logger.info(`[superadmin] Negocio creado: ${slug} (${ownerEmail})`);

    return res.status(201).json({
      id: slug,
      tempPassword, // Se muestra UNA sola vez en el panel para que se lo pases al dueño.
    });
  } catch (err) {
    // Si el usuario de Auth se creó pero Firestore falló, lo revertimos
    // para no dejar una cuenta huérfana sin negocio asociado.
    if (createdUid) {
      await getAuth().deleteUser(createdUid).catch(() => {});
    }
    logger.error('[superadmin] Error creando negocio:', err.message);

    if (err.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }
    return res.status(500).json({ error: 'No se pudo crear el negocio.' });
  }
});

export default router;