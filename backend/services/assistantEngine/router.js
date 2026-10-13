// router.js
//
// Elige el flujo del asistente según el vertical del negocio
// (businessProfileModel -> getVertical). El webhook de WhatsApp llama aquí.
//   'citas'       -> engine.js (reservas, sin cambios)
//   'restaurante' -> flows/restaurante.js
// getNegocioAccess usa la caché de 60 s que el webhook ya llenó al validar
// la capacidad, así que no suma lecturas a Firestore.

import { assistantEngine } from './engine.js';
import { restauranteEngine } from './flows/restaurante.js';
import { getNegocioAccess } from '../capabilities/capabilityService.js';
import { getVertical } from '../businessProfiles/businessProfileModel.js';
import { logger } from '../../utils/logger.js';

export async function runAssistant(args) {
  let vertical = 'citas';
  try {
    const access = await getNegocioAccess(String(args.negocioId));
    vertical = getVertical(access?.businessType);
  } catch (err) {
    logger.warn('[assistantRouter] No se pudo leer el tipo de negocio, uso citas:', err.message);
  }

  if (vertical === 'restaurante') return restauranteEngine(args);
  return assistantEngine(args);
}
