// businessTerms.js
//
// Terminología del negocio para textos generados en el backend (bot de
// WhatsApp, notificaciones push). Reutiliza la lectura cacheada de
// capabilityService (60 s), así que no agrega lecturas a Firestore.
// Si no se conoce el negocio o falla la lectura -> términos genéricos.

import { createTerms, GENERIC_TERMS } from './businessProfileModel.js';
import { getNegocioAccess } from '../capabilities/capabilityService.js';
import { logger } from '../../utils/logger.js';

export async function getBusinessTerms(negocioId) {
  if (!negocioId) return GENERIC_TERMS;
  try {
    const access = await getNegocioAccess(String(negocioId));
    if (!access?.exists) return GENERIC_TERMS;
    return createTerms(access.businessType, access.terminologyOverrides);
  } catch (err) {
    logger.warn('[businessTerms] Uso términos genéricos:', err.message);
    return GENERIC_TERMS;
  }
}
