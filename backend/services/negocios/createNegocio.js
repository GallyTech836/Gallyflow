// createNegocio.js
//
// Alta de un negocio (cuenta de Auth + documento negocios/{slug}). Es la
// lógica que antes vivía dentro de POST /api/superadmin/negocios, movida
// aquí sin cambios para reutilizarla al crear un negocio desde una
// solicitud del formulario público (/registro).

import { getAuth } from 'firebase-admin/auth';
import { db } from '../../config/firebase.js';
import { isReservedSlug } from '../../utils/reservedSlugs.js';
import { isValidBusinessType, DEFAULT_BUSINESS_TYPE } from '../businessProfiles/businessProfileModel.js';

export class CreateNegocioError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Idéntico a src/utils/negocio.js (getNegocioSlug) del frontend de
// GallyFlow — mismo criterio de siempre, todo antes del @, sin símbolos.
export function getNegocioSlug(email) {
  if (!email) return null;
  return email.split('@')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function generateTempPassword() {
  return Math.random().toString(36).slice(-10) + 'A1!';
}

// Contraseña elegida por el Super Admin, o una generada si viene vacía.
// Firebase Auth exige mínimo 6 caracteres.
export function resolvePassword(raw) {
  const p = typeof raw === 'string' ? raw.trim() : '';
  if (!p) return { password: generateTempPassword() };
  if (p.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  return { password: p };
}

export const DEFAULT_HERO_CONFIG = {
  businessName: 'GALLYFLOW',
  slogan: 'Agenda citas de forma rápida y segura desde cualquier dispositivo en nuestra plataforma premium.',
  logo: '',
  cover: '',
  showRating: false,
  rating: 4.9,
  highlightText: '',
};

/**
 * Crea la cuenta de Auth + el documento del negocio con la MISMA
 * estructura base que useNegocio.js genera en el auto-registro orgánico
 * (slug basado en el correo, mismos 4 campos raíz), agregando además
 * el nombre del negocio dentro de heroConfig (igual que lo hace
 * businessHeroService.js) y los campos de gestión propios del panel
 * (plan, status, etc.) que no existen en el flujo orgánico.
 *
 * @returns {Promise<{ id: string, tempPassword: string, uid: string }>}
 * @throws {CreateNegocioError} con el status HTTP y el mensaje para el panel.
 */
export async function createNegocio({ name, businessType, ownerName, ownerEmail, phone, country, city, plan, status, trialDays, password } = {}) {
  if (!ownerEmail) {
    throw new CreateNegocioError(400, 'Falta el correo del propietario.');
  }

  const slug = getNegocioSlug(ownerEmail);
  if (!slug) {
    throw new CreateNegocioError(400, 'Correo inválido.');
  }
  if (isReservedSlug(slug)) {
    throw new CreateNegocioError(400, `"${slug}" es una ruta reservada de la app y no puede usarse como negocio. Usa otro correo.`);
  }

  // Tipo de negocio (businessProfileModel). Vacío = 'otro' (terminología genérica).
  if (businessType && !isValidBusinessType(businessType)) {
    throw new CreateNegocioError(400, 'Tipo de negocio inválido.');
  }
  const finalBusinessType = businessType || DEFAULT_BUSINESS_TYPE;

  const pw = resolvePassword(password);
  if (pw.error) throw new CreateNegocioError(400, pw.error);
  const tempPassword = pw.password;
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
      throw new CreateNegocioError(409, 'Ya existe un negocio con ese correo.');
    }
    if (planId) {
      const planSnap = await db.collection('planes').doc(planId).get();
      if (!planSnap.exists) throw new CreateNegocioError(400, 'El plan elegido no existe.');
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
      // --- tipo de negocio: terminología/módulos de Nexus (businessProfileModel) ---
      businessType: finalBusinessType,
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

    return { id: slug, tempPassword, uid: createdUid };
  } catch (err) {
    if (createdUid) {
      await getAuth().deleteUser(createdUid).catch(() => {});
    }
    if (err instanceof CreateNegocioError) throw err;
    if (err.code === 'auth/email-already-exists') {
      throw new CreateNegocioError(409, 'Ya existe una cuenta con ese correo.');
    }
    const e = new CreateNegocioError(500, 'No se pudo crear el negocio.');
    e.cause = err;
    throw e;
  }
}
