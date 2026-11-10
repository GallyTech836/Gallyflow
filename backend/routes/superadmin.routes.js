import { Router } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { db } from '../config/firebase.js';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { logger } from '../utils/logger.js';
import { getNegocioAccess, getUsage, currentPeriod } from '../services/capabilities/capabilityService.js';
import { getCapability, usageStatus } from '../services/capabilities/capabilityModel.js';
import { hashPin } from '../services/finance/pin.js';
import { setPinHash } from '../services/finance/pinStore.js';
import { buildLockPatch } from '../services/finance/pinLockModules.js';
import { createNegocio, CreateNegocioError, resolvePassword } from '../services/negocios/createNegocio.js';
import {
  DeleteNegocioError, parseDays, scheduleNegocioDeletion, cancelNegocioDeletion, deleteNegocioNow,
} from '../services/negocios/deleteNegocio.js';
import {
  RegistroError, listSolicitudes, updateSolicitud, createFromSolicitud,
} from '../services/registro/registroService.js';
import {
  NoticeError, getSoporteWhatsapp, setSoporteWhatsapp, listNoticePeriods,
} from '../services/subscription/subscriptionNoticeService.js';
import {
  MetricsError, buildMonthReport, buildHistory, setTrackingConfig,
} from '../services/assistantMetrics/assistantMetricsReport.js';
import { dayKey } from '../services/assistantMetrics/assistantMetrics.js';

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

// POST /api/superadmin/negocios
// Crea la cuenta de Auth + el documento del negocio. La lógica vive en
// services/negocios/createNegocio.js (la reutilizan las solicitudes del
// formulario público /registro).
router.post('/negocios', identifyRequester, requireSuperAdmin, async (req, res) => {
  const { name, businessType, ownerName, ownerEmail, phone, country, city, plan, status, trialDays, password } = req.body;
  try {
    const { id, tempPassword } = await createNegocio({ name, businessType, ownerName, ownerEmail, phone, country, city, plan, status, trialDays, password });
    logger.info(`[superadmin] Negocio creado: ${id} (${ownerEmail})`);
    return res.status(201).json({ id, tempPassword });
  } catch (err) {
    if (err instanceof CreateNegocioError) {
      if (err.status >= 500 || err.message === 'Ya existe una cuenta con ese correo.') logger.error('[superadmin] Error creando negocio:', err.cause?.message || err.message);
      return res.status(err.status).json({ error: err.message });
    }
    logger.error('[superadmin] Error creando negocio:', err.message);
    return res.status(500).json({ error: 'No se pudo crear el negocio.' });
  }
});
// POST /api/superadmin/negocios/:negocioId/analytics-pin
// Bloqueo con PIN de los módulos de AdminApp (antes solo Analítica).
// Body: { lockedModules?: string[], enabled?: boolean, pin?: string (4-8 dígitos), clearPin?: boolean }
//  - lockedModules: lista completa de módulos que piden el PIN.
//  - enabled: (viejo) activa/desactiva solo el bloqueo de Analítica.
//  - pin: fija un PIN nuevo (se guarda solo el hash; nadie puede leerlo).
//  - clearPin: borra el PIN (el dueño tendrá que crear uno al entrar).
router.post('/negocios/:negocioId/analytics-pin', identifyRequester, requireSuperAdmin, async (req, res) => {
  const { negocioId } = req.params;
  const { lockedModules, enabled, pin, clearPin } = req.body || {};
  let patch = {};
  if (Array.isArray(lockedModules) || typeof enabled === 'boolean') {
    try {
      const snap = await db.collection('negocios').doc(negocioId).get();
      if (!snap.exists) return res.status(404).json({ error: 'Negocio no encontrado.' });
      patch = buildLockPatch(snap.data(), { lockedModules, enabled }) || {};
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  // El hash va a negocioSecrets (privado), nunca al documento del negocio.
  let nuevoHash; // undefined = no tocar, null = borrar
  if (pin !== undefined && pin !== null && pin !== '') {
    if (!/^\d{4,8}$/.test(String(pin))) {
      return res.status(400).json({ error: 'El PIN debe tener entre 4 y 8 dígitos.' });
    }
    nuevoHash = await hashPin(String(pin));
  } else if (clearPin === true) {
    nuevoHash = null;
  }
  if (!Object.keys(patch).length && nuevoHash === undefined) {
    return res.status(400).json({ error: 'Nada que cambiar (lockedModules, enabled, pin o clearPin).' });
  }
  try {
    if (Object.keys(patch).length) await db.collection('negocios').doc(negocioId).update(patch);
    if (nuevoHash !== undefined) await setPinHash(negocioId, nuevoHash);
    return res.status(200).json({
      ok: true,
      negocioId,
      ...patch,
      pinChanged: typeof nuevoHash === 'string',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/superadmin/negocios/:negocioId/password
// Cambia la contraseña del administrador del negocio.
// Body: { password?: string } — vacía = se genera una nueva.
// Devuelve la contraseña UNA vez; no se guarda en ningún lado (Firebase
// Auth solo guarda el hash, por eso no se puede "ver" la anterior).
router.post('/negocios/:negocioId/password', identifyRequester, requireSuperAdmin, async (req, res) => {
  const { negocioId } = req.params;
  const pw = resolvePassword(req.body?.password);
  if (pw.error) return res.status(400).json({ error: pw.error });
  try {
    const snap = await db.collection('negocios').doc(negocioId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Negocio no encontrado.' });
    const { adminUid, email } = snap.data();
    let uid = adminUid;
    if (!uid && email) uid = (await getAuth().getUserByEmail(email)).uid;
    if (!uid) return res.status(400).json({ error: 'El negocio no tiene una cuenta de administrador.' });
    await getAuth().updateUser(uid, { password: pw.password });
    logger.info(`[superadmin] Contraseña cambiada para negocio ${negocioId}`);
    return res.status(200).json({ ok: true, email, password: pw.password });
  } catch (err) {
    logger.error('[superadmin] Error cambiando contraseña:', err.message);
    return res.status(500).json({ error: 'No se pudo cambiar la contraseña.' });
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
      // Límite por sucursal: el total del negocio no tiene tope.
      const totalLimit = cap.limit.perBranch ? null : val.limit;
      consumo[key] = {
        ...usageStatus(totalLimit, used),
        rechazados: Number(usage.rechazados?.[cap.limit.usageKey]) || 0,
        ...(cap.limit.perBranch ? { limitePorSucursal: val.limit, sucursalesAlLimite: Number(usage.sucursalesAlLimite) || 0 } : {}),
      };
    }
    return res.status(200).json({ ...access, period, usage, consumo });
  } catch (err) {
    logger.error('[superadmin] Error leyendo acceso:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ───────────── Asistente WhatsApp / Consumo (métricas) ─────────────

function metricsError(res, err, ctx) {
  if (err instanceof MetricsError) return res.status(err.status).json({ error: err.message });
  logger.error(`[superadmin] ${ctx}:`, err.message);
  return res.status(500).json({ error: 'Error interno.' });
}

// GET /api/superadmin/negocios/:negocioId/asistente-metricas?mes=AAAA-MM
router.get('/negocios/:negocioId/asistente-metricas', identifyRequester, requireSuperAdmin, async (req, res) => {
  try {
    const mes = req.query?.mes || dayKey().slice(0, 7);
    return res.status(200).json(await buildMonthReport(req.params.negocioId, mes));
  } catch (err) {
    return metricsError(res, err, 'Error leyendo métricas del asistente');
  }
});

// GET /api/superadmin/negocios/:negocioId/asistente-metricas/historial
router.get('/negocios/:negocioId/asistente-metricas/historial', identifyRequester, requireSuperAdmin, async (req, res) => {
  try {
    return res.status(200).json(await buildHistory(req.params.negocioId));
  } catch (err) {
    return metricsError(res, err, 'Error leyendo historial del asistente');
  }
});

// PUT /api/superadmin/negocios/:negocioId/asistente-metricas/config  body { startDate?, enabled? }
router.put('/negocios/:negocioId/asistente-metricas/config', identifyRequester, requireSuperAdmin, async (req, res) => {
  try {
    return res.status(200).json(await setTrackingConfig(req.params.negocioId, req.body || {}, req.actor?.email));
  } catch (err) {
    return metricsError(res, err, 'Error guardando seguimiento del asistente');
  }
});

// ───────────── Soporte de Nexus y avisos de vencimiento ─────────────

function noticeError(res, err, ctx) {
  if (err instanceof NoticeError) return res.status(err.status).json({ error: err.message, code: err.code });
  logger.error(`[superadmin] ${ctx}:`, err.message);
  return res.status(500).json({ error: 'Error interno.' });
}

// GET /api/superadmin/config/soporte → { whatsapp } (solo dígitos, "" si no hay)
router.get('/config/soporte', identifyRequester, requireSuperAdmin, async (req, res) => {
  try {
    return res.status(200).json({ whatsapp: await getSoporteWhatsapp() });
  } catch (err) {
    return noticeError(res, err, 'Error leyendo soporte');
  }
});

// PUT /api/superadmin/config/soporte  body { whatsapp } ("" lo borra)
router.put('/config/soporte', identifyRequester, requireSuperAdmin, async (req, res) => {
  try {
    return res.status(200).json(await setSoporteWhatsapp(req.body?.whatsapp, req.actor?.email));
  } catch (err) {
    return noticeError(res, err, 'Error guardando soporte');
  }
});

// GET /api/superadmin/negocios/:negocioId/avisos-vencimiento → { periodos } (más reciente primero)
router.get('/negocios/:negocioId/avisos-vencimiento', identifyRequester, requireSuperAdmin, async (req, res) => {
  try {
    return res.status(200).json(await listNoticePeriods(req.params.negocioId));
  } catch (err) {
    return noticeError(res, err, 'Error leyendo avisos de vencimiento');
  }
});

// ───────────── Solicitudes del formulario público /registro ─────────────

function sendRegistroError(res, err, where) {
  if (err instanceof RegistroError) {
    if (err.status >= 500) logger.error(`[superadmin] ${where}:`, err.cause?.message || err.message);
    return res.status(err.status).json({ error: err.message, errors: err.errors || [] });
  }
  logger.error(`[superadmin] ${where}:`, err.message);
  return res.status(500).json({ error: 'Error interno.' });
}

// GET /api/superadmin/solicitudes?status=pendiente|creada|descartada|todas
router.get('/solicitudes', identifyRequester, requireSuperAdmin, async (req, res) => {
  const status = ['pendiente', 'creada', 'descartada', 'todas'].includes(req.query.status) ? req.query.status : 'pendiente';
  try {
    return res.status(200).json({ solicitudes: await listSolicitudes(status) });
  } catch (err) {
    return sendRegistroError(res, err, 'listar solicitudes');
  }
});

// PATCH /api/superadmin/solicitudes/:id  { status: 'pendiente' | 'descartada', note? }
router.patch('/solicitudes/:id', identifyRequester, requireSuperAdmin, async (req, res) => {
  try {
    return res.status(200).json(await updateSolicitud(req.params.id, req.body || {}));
  } catch (err) {
    return sendRegistroError(res, err, 'actualizar solicitud');
  }
});

// POST /api/superadmin/solicitudes/:id/crear  { planId, trialDays }
// -> { id, email, tempPassword, creados, cupos }
router.post('/solicitudes/:id/crear', identifyRequester, requireSuperAdmin, async (req, res) => {
  try {
    const result = await createFromSolicitud(req.params.id, req.body || {});
    logger.info(`[superadmin] Negocio creado desde solicitud ${req.params.id}: ${result.id} (${result.email})`);
    return res.status(201).json(result);
  } catch (err) {
    return sendRegistroError(res, err, 'crear negocio desde solicitud');
  }
});

// ───────────── Eliminar negocio (ahora o programado) ─────────────

// Para borrar hay que haber ingresado la contraseña hace poco: el panel
// reautentica al Super Admin y manda un token nuevo (auth_time reciente).
const REAUTH_MAX_SECONDS = 5 * 60;
function requireRecentLogin(req, res, next) {
  const authTime = Number(req.actor?.authTime) || 0;
  if (!authTime || Date.now() / 1000 - authTime > REAUTH_MAX_SECONDS) {
    return res.status(401).json({ error: 'Vuelve a ingresar tu contraseña para confirmar.', code: 'REAUTH_REQUIRED' });
  }
  next();
}

function sendDeleteError(res, err, where) {
  if (err instanceof DeleteNegocioError) return res.status(err.status).json({ error: err.message });
  logger.error(`[superadmin] ${where}:`, err.message);
  return res.status(500).json({ error: 'No se pudo completar la eliminación.' });
}

// POST /api/superadmin/negocios/:negocioId/eliminar  { days, confirm }
// days = 0 -> borra ya. 1..90 -> suspende y programa el borrado.
// confirm debe ser exactamente el ID del negocio.
router.post('/negocios/:negocioId/eliminar', identifyRequester, requireSuperAdmin, requireRecentLogin, async (req, res) => {
  const { negocioId } = req.params;
  try {
    if (String(req.body?.confirm || '').trim() !== negocioId) {
      return res.status(400).json({ error: `Escribe exactamente "${negocioId}" para confirmar.` });
    }
    const days = parseDays(req.body?.days);
    if (days === 0) {
      const summary = await deleteNegocioNow(negocioId);
      logger.info(`[superadmin] Negocio eliminado: ${negocioId}`);
      return res.status(200).json({ deleted: true, summary });
    }
    const deletion = await scheduleNegocioDeletion(negocioId, days, { by: req.actor.email });
    logger.info(`[superadmin] Borrado programado: ${negocioId} para ${deletion.scheduledFor}`);
    return res.status(200).json({ deleted: false, deletion });
  } catch (err) {
    return sendDeleteError(res, err, 'eliminar negocio');
  }
});

// DELETE /api/superadmin/negocios/:negocioId/eliminar -> cancela el borrado programado
router.delete('/negocios/:negocioId/eliminar', identifyRequester, requireSuperAdmin, async (req, res) => {
  try {
    const result = await cancelNegocioDeletion(req.params.negocioId);
    logger.info(`[superadmin] Borrado cancelado: ${req.params.negocioId}`);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return sendDeleteError(res, err, 'cancelar eliminación');
  }
});

export default router;
