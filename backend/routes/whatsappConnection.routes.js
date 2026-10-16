// whatsappConnection.routes.js
//
// Panel "Número de WhatsApp" del admin del negocio (Configuración →
// Automatización). El negocio sale SIEMPRE del token (adminUid), nunca del body.
//
//   GET    /api/whatsapp/connections              -> números del negocio
//   POST   /api/whatsapp/connections              { phone, branch? } -> conectar
//   POST   /api/whatsapp/connections/:id/branch   { branch }         -> cambiar sucursal
//   DELETE /api/whatsapp/connections/:id                             -> quitar
//
// whatsappAccounts guarda tokens: el front nunca la lee directo (reglas),
// solo recibe vistaPublica() desde aquí.

import { Router } from 'express';
import { db } from '../config/firebase.js';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { requireSession } from '../middlewares/session.middleware.js';
import { requireNegocioAdmin } from '../middlewares/negocioAdmin.middleware.js';
import { staffAdminRateLimit } from '../middlewares/rateLimit.middleware.js';
import { logger } from '../utils/logger.js';
import { clearAccountCache } from '../services/providers/whatsappProvider.js';
import { buscarNumeroEnYCloud } from '../services/whatsapp/ycloudNumbers.js';
import {
  normalizarNumero, idCuentaYCloud, vistaPublica, sucursalValida,
} from '../services/whatsapp/connectionModel.js';

const router = Router();
const MAX_NUMEROS = 5;
const cuentas = () => db.collection('whatsappAccounts');
const guard = [identifyRequester, requireSession, requireNegocioAdmin, staffAdminRateLimit];

async function sucursalesDe(negocioId) {
  const snap = await db.collection('negocios').doc(negocioId).collection('sucursales').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function numerosDe(negocioId, negocio) {
  const snap = await cuentas().where('negocioId', '==', negocioId).get();
  const lista = snap.docs.map((d) => vistaPublica(d.id, d.data()));
  // Conexión antigua (Meta, campo en el negocio): se muestra pero no se toca desde aquí.
  const legado = negocio?.whatsappPhoneNumberId ? String(negocio.whatsappPhoneNumberId) : null;
  if (legado && !lista.some((n) => n.id === legado)) {
    lista.push(vistaPublica(legado, { provider: 'meta', phone: negocio?.assistantConfig?.displayPhone || null }));
  }
  return lista.sort((a, b) => String(a.connectedAt || '').localeCompare(String(b.connectedAt || '')));
}

router.get('/whatsapp/connections', ...guard, async (req, res) => {
  try {
    return res.status(200).json({ numbers: await numerosDe(req.negocioId, req.negocio) });
  } catch (err) {
    logger.error('[waConnection] listar:', err.message);
    return res.status(500).json({ error: 'No se pudieron cargar los números.' });
  }
});

router.post('/whatsapp/connections', ...guard, async (req, res) => {
  const digitos = normalizarNumero(req.body?.phone);
  if (!digitos) return res.status(400).json({ error: 'Número inválido. Escríbelo con código de país, ej. +591 71234567.' });

  try {
    const suc = sucursalValida(req.body?.branch, await sucursalesDe(req.negocioId));
    if (!suc.ok) return res.status(400).json({ error: 'Esa sucursal no existe.' });

    const id = idCuentaYCloud(digitos);
    const ref = cuentas().doc(id);
    const actual = await ref.get();
    if (actual.exists && actual.data()?.negocioId !== req.negocioId) {
      logger.warn(`[waConnection] ${req.negocioId} intentó conectar un número de otro negocio.`);
      return res.status(409).json({ code: 'OTHER_BUSINESS', error: 'Este número ya está conectado a otro negocio. Escribe a soporte de Nexus.' });
    }
    if (!actual.exists) {
      const propios = await cuentas().where('negocioId', '==', req.negocioId).get();
      if (propios.size >= MAX_NUMEROS) {
        return res.status(400).json({ error: `Máximo ${MAX_NUMEROS} números por negocio.` });
      }
    }

    // El número debe estar conectado primero en YCloud (lo hace soporte).
    let ycloud;
    try {
      ycloud = await buscarNumeroEnYCloud(digitos);
    } catch (err) {
      logger.error('[waConnection] YCloud:', err.message);
      return res.status(502).json({ code: err.code || 'YCLOUD_ERROR', error: 'No se pudo verificar el número en este momento. Inténtalo en unos minutos.' });
    }
    if (!ycloud.encontrado) {
      return res.status(404).json({
        code: 'NOT_IN_YCLOUD',
        error: 'Este número todavía no está habilitado en Nexus. Escribe a soporte para activarlo y vuelve a intentarlo.',
      });
    }

    const ahora = new Date().toISOString();
    const datos = {
      provider: 'ycloud',
      negocioId: req.negocioId,
      phone: `+${digitos}`,
      branch: suc.branch,
      wabaId: ycloud.encontrado.wabaId || null,
      verifiedName: ycloud.encontrado.verifiedName || null,
      connectedBy: req.actor.uid,
      updatedAt: ahora,
    };
    if (!actual.exists) datos.connectedAt = ahora;
    await ref.set(datos, { merge: true });
    clearAccountCache(id);
    logger.info(`[waConnection] Número conectado (negocio=${req.negocioId}).`);
    return res.status(actual.exists ? 200 : 201).json({ numbers: await numerosDe(req.negocioId, req.negocio) });
  } catch (err) {
    logger.error('[waConnection] conectar:', err.message);
    return res.status(500).json({ error: 'No se pudo conectar el número.' });
  }
});

// Solo números propios y por YCloud (los de Meta los gestiona soporte).
async function cuentaPropia(req, res) {
  const ref = cuentas().doc(String(req.params.id || ''));
  const snap = await ref.get();
  const d = snap.exists ? snap.data() : null;
  if (!d || d.negocioId !== req.negocioId) {
    res.status(404).json({ error: 'Número no encontrado.' });
    return null;
  }
  if ((d.provider || 'meta') !== 'ycloud') {
    res.status(403).json({ error: 'Este número lo administra soporte de Nexus.' });
    return null;
  }
  return { ref, data: d };
}

router.post('/whatsapp/connections/:id/branch', ...guard, async (req, res) => {
  try {
    const cuenta = await cuentaPropia(req, res);
    if (!cuenta) return undefined;
    const suc = sucursalValida(req.body?.branch, await sucursalesDe(req.negocioId));
    if (!suc.ok) return res.status(400).json({ error: 'Esa sucursal no existe.' });
    await cuenta.ref.set({ branch: suc.branch, updatedAt: new Date().toISOString() }, { merge: true });
    clearAccountCache(cuenta.ref.id);
    return res.status(200).json({ numbers: await numerosDe(req.negocioId, req.negocio) });
  } catch (err) {
    logger.error('[waConnection] sucursal:', err.message);
    return res.status(500).json({ error: 'No se pudo guardar el cambio.' });
  }
});

router.delete('/whatsapp/connections/:id', ...guard, async (req, res) => {
  try {
    const cuenta = await cuentaPropia(req, res);
    if (!cuenta) return undefined;
    await cuenta.ref.delete();
    clearAccountCache(cuenta.ref.id);
    logger.info(`[waConnection] Número quitado (negocio=${req.negocioId}).`);
    return res.status(200).json({ numbers: await numerosDe(req.negocioId, req.negocio) });
  } catch (err) {
    logger.error('[waConnection] quitar:', err.message);
    return res.status(500).json({ error: 'No se pudo quitar el número.' });
  }
});

export default router;
