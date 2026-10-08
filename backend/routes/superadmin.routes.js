import { Router } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { db } from '../config/firebase.js';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { logger } from '../utils/logger.js';
import { getNegocioAccess, getUsage, currentPeriod } from '../services/capabilities/capabilityService.js';
import { getCapability, usageStatus } from '../services/capabilities/capabilityModel.js';

const router = Router();

// ⚠️ Mismo correo que en el frontend (src/auth/useSuperAdminAuth.js del
// proyecto Nexus Super Admin). Solo esta cuenta puede usar estas rutas.
const SUPER_ADMIN_EMAIL = 'torricogali@gmail.com';

function requireSuperAdmin(req, res, next) {
  if (!req.actor?.verified || req.actor.email !== SUPER_ADMIN_EMAIL) {
    logger.warn('[superadmin] Acceso rechazado para:', req.actor?.email || 'sin token');
    return res.status(403).json({ error: 'No autorizado.' });
  }
  next();
}

// Idéntico a src/utils/negocio.js (getNegocioSlug) del frontend de
// GallyFlow — mismo criterio de siempre, todo antes del @, sin símbolos.
function getNegocioSlug(email) {
  if (!email) return null;
  return email.split('@')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function generateTempPassword() {
  return Math.random().toString(36).slice(-10) + 'A1!';
}

const DEFAULT_HERO_CONFIG = {
  businessName: 'GALLYFLOW',
  slogan: 'Agenda citas de forma rápida y segura desde cualquier dispositivo en nuestra plataforma premium.',
  logo: '',
  cover: '',
  showRating: false,
  rating: 4.9,
  highlightText: '',
};

// POST /api/superadmin/negocios
// Crea la cuenta de Auth + el documento del negocio con la MISMA
// estructura base que useNegocio.js genera en el auto-registro orgánico
// (slug basado en el correo, mismos 4 campos raíz), agregando además
// el nombre del negocio dentro de heroConfig (igual que lo hace
// businessHeroService.js) y los campos de gestión propios del panel
// (plan, status, etc.) que no existen en el flujo orgánico.
router.post('/negocios', identifyRequester, requireSuperAdmin, async (req, res) => {
  const { name, ownerName, ownerEmail, phone, country, city, plan, status, trialDays } = req.body;

  if (!ownerEmail) {
    return res.status(400).json({ error: 'Falta el correo del propietario.' });
  }

  const slug = getNegocioSlug(ownerEmail);
  if (!slug) {
    return res.status(400).json({ error: 'Correo inválido.' });
  }

  const tempPassword = generateTempPassword();
  let createdUid = null;

  // `plan` es el ID de un documento de `planes` (ya no 'trial'/'basic'/'pro').
  // Si viene vacío, el negocio queda sin plan y usa los valores por defecto
  // del catálogo de capacidades.
  const planId = plan && plan !== 'trial' ? String(plan) : null;
  const finalStatus = status === 'active' ? 'active' : 'trial';
  const today = new Date().toISOString().slice(0, 10);
  let trialFields = {};
  if (finalStatus === 'trial') {
    const days = Math.max(1, Math.min(365, Number(trialDays) || 14));
    const end = new Date();
    end.setDate(end.getDate() + days);
    trialFields = { trialStart: today, trialEnd: end.toISOString().slice(0, 10), trialDays: days };
  }

  try {
    const negocioRef = db.collection('negocios').doc(slug);
    const existing = await negocioRef.get();
    if (existing.exists) {
      return res.status(409).json({ error: 'Ya existe un negocio con ese correo.' });
    }
    if (planId) {
      const planSnap = await db.collection('planes').doc(planId).get();
      if (!planSnap.exists) return res.status(400).json({ error: 'El plan elegido no existe.' });
    }

    const userRecord = await getAuth().createUser({
      email: ownerEmail,
      password: tempPassword,
      displayName: ownerName || undefined,
    });
    createdUid = userRecord.uid;

    await negocioRef.set({
      // --- mismos campos raíz que el auto-registro orgánico ---
      slug,
      adminUid: createdUid,
      email: ownerEmail,
      createdAt: new Date().toISOString(),
      // --- nombre del negocio, en el mismo lugar donde ya lo lee la app ---
      heroConfig: { ...DEFAULT_HERO_CONFIG, businessName: name || DEFAULT_HERO_CONFIG.businessName },
      // --- campos de gestión, exclusivos del panel Super Admin ---
      ownerName: ownerName || '',
      phone: phone || '',
      country: country || '',
      city: city || '',
      plan: planId,
      status: finalStatus,
      subscriptionEnd: null,
      ...trialFields,
      capabilityOverrides: {},
    });

    logger.info(`[superadmin] Negocio creado: ${slug} (${ownerEmail})`);

    return res.status(201).json({ id: slug, tempPassword });
  } catch (err) {
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
// POST /api/superadmin/negocios/:negocioId/analytics-pin
// Activa/desactiva la protección por PIN de la sección Analítica de un negocio.
router.post('/negocios/:negocioId/analytics-pin', identifyRequester, requireSuperAdmin, async (req, res) => {
  const { negocioId } = req.params;
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Falta "enabled" (true/false).' });
  }
  try {
    await db.collection('negocios').doc(negocioId).update({ analyticsPinEnabled: enabled });
    return res.status(200).json({ ok: true, negocioId, analyticsPinEnabled: enabled });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/superadmin/negocios/:negocioId/access
// Lo que el SERVIDOR considera permitido para ese negocio (sin caché):
// estado efectivo, capacidades resueltas y consumo del mes. Sirve para
// confirmar desde Super Admin que el backend ve exactamente lo mismo.
router.get('/negocios/:negocioId/access', identifyRequester, requireSuperAdmin, async (req, res) => {
  const { negocioId } = req.params;
  try {
    const access = await getNegocioAccess(negocioId, { fresh: true });
    if (!access.exists) return res.status(404).json({ error: 'Negocio no encontrado.' });
    const period = currentPeriod();
    const usage = await getUsage(negocioId, period);
    const consumo = {};
    for (const [key, val] of Object.entries(access.capabilities)) {
      const cap = getCapability(key);
      if (cap?.limit?.period !== 'month') continue;
      const used = Number(usage[cap.limit.usageKey]) || 0;
      consumo[key] = { ...usageStatus(val.limit, used), rechazados: Number(usage.rechazados?.[cap.limit.usageKey]) || 0 };
    }
    return res.status(200).json({ ...access, period, usage, consumo });
  } catch (err) {
    logger.error('[superadmin] Error leyendo acceso:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;