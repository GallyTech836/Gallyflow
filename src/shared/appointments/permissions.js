// permissions.js
// Define qué puede hacer cada rol (admin / barber) sobre una cita.
// No contiene lógica de Firebase ni de UI: solo reglas de permiso,
// apoyadas en las transiciones definidas en statusModel.js.

import { getNextStates } from './statusModel';

export const ROLES = {
  ADMIN: 'admin',
  BARBER: 'barber',
};

// Campos del documento de cita que cada rol puede editar.
// false = el campo se muestra (si aplica) pero no es editable.
export const FIELD_PERMISSIONS = {
  [ROLES.ADMIN]: {
    clientName: true,
    professionalId: true,
    serviceId: true,
    services: true,
    serviceName: true,
    price: true,
    duration: true,
    time: true,
    status: true,
    notes: true,
  },
  [ROLES.BARBER]: {
    clientName: false,
    professionalId: false,
    serviceId: true,
    services: true,
    serviceName: true,
    price: true,
    duration: true,
    time: true,
    status: true,
    notes: true,
  },
};

/**
 * Indica si el rol puede editar un campo específico de la cita.
 */
export function canEditField(role, field) {
  const fields = FIELD_PERMISSIONS[role];
  return !!(fields && fields[field]);
}

// Permisos de acciones que no son edición de campos.
export const ACTION_PERMISSIONS = {
  [ROLES.ADMIN]: {
    canHardDelete: true,   // puede borrar el documento físicamente
    canCancel: true,        // puede mover el estado a 'cancelled'
    restrictedTransitions: null, // null = sin restricción adicional sobre statusModel
  },
  [ROLES.BARBER]: {
    canHardDelete: true,   // nunca borra el documento, solo cancela
    canCancel: true,
    restrictedTransitions: null, // por ahora respeta el mismo ciclo que Admin
  },
};

/**
 * Indica si el rol puede eliminar físicamente una cita (deleteDoc).
 */
export function canHardDelete(role) {
  return !!(ACTION_PERMISSIONS[role] && ACTION_PERMISSIONS[role].canHardDelete);
}

/**
 * Indica si el rol puede cancelar (status: 'cancelled').
 */
export function canCancel(role) {
  return !!(ACTION_PERMISSIONS[role] && ACTION_PERMISSIONS[role].canCancel);
}

/**
 * Devuelve los estados a los que el rol puede transicionar
 * desde el estado actual, combinando la regla general de
 * statusModel con cualquier restricción adicional del rol.
 */
export function getAllowedNextStates(role, currentStatus) {
  const baseNextStates = getNextStates(currentStatus);
  const perms = ACTION_PERMISSIONS[role];
  if (!perms) return [];

  if (perms.restrictedTransitions === null) {
    return baseNextStates;
  }
  return baseNextStates.filter(s => perms.restrictedTransitions.includes(s));
}