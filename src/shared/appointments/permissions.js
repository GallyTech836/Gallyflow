// permissions.js
// Define qué puede hacer cada rol (admin / barber) sobre una cita.
// No contiene lógica de Firebase ni de UI: solo reglas de permiso,
// apoyadas en las transiciones definidas en statusModel.js.

import { getNextStates } from './statusModel';
import { normalizeStaffPermissions, getEditMode, canEditPart } from '../staffPermissions/staffPermissionsModel';

export const ROLES = {
  ADMIN: 'admin',
  BARBER: 'barber',
};

// Campos del documento de cita que cada rol puede editar.
// false = el campo se muestra (si aplica) pero no es editable.
export const FIELD_PERMISSIONS = {
  [ROLES.ADMIN]: {
    clientName: true,
    clientId: true,
    clientPhone: true,
    professionalId: true,
    serviceId: true,
    services: true,
    serviceName: true,
    price: true,
    duration: true,
    time: true,
    status: true,
    notes: true,
    paymentMethod: true,
  },
  [ROLES.BARBER]: {
    clientName: false,
    clientId: false,
    clientPhone: false,
    professionalId: false,
    serviceId: true,
    services: true,
    serviceName: true,
    price: true,
    duration: true,
    time: true,
    status: true,
    notes: true,
    paymentMethod: true,
  },
};

/**
 * Indica si el rol puede editar un campo específico de la cita.
 */
export function canEditField(role, field, staffPermissions = null) {
  const fields = getEffectiveFieldPermissions(role, staffPermissions);
  return !!(fields && fields[field]);
}

export function getEffectiveFieldPermissions(role, staffPermissions = null) {
  const base = FIELD_PERMISSIONS[role] || {};
  if (role !== ROLES.BARBER || !staffPermissions) return base;
  const sp = normalizeStaffPermissions(staffPermissions);
  if (!sp.editAppointments) {
    return Object.keys(base).reduce((acc, k) => ({ ...acc, [k]: false }), {});
  }
  const fields = { ...base, clientName: sp.changeAppointmentClient, clientId: sp.changeAppointmentClient, clientPhone: sp.changeAppointmentClient };
  if (getEditMode(sp) !== 'custom') return fields;
  // "Editar citas" personalizado: cada parte según su casilla. Los campos que
  // se recalculan juntos (servicios -> precio y duración) se habilitan juntos.
  const can = (part) => canEditPart(sp, part);
  return {
    ...fields,
    time: can('editTime'),
    serviceId: can('editServices'),
    serviceName: can('editServices'),
    services: can('editServices') || can('editDuration') || can('editFinish'),
    duration: can('editServices') || can('editDuration'),
    price: can('editServices') || can('editFinish'),
    status: can('editFinish'),
    paymentMethod: can('editFinish'),
    notes: can('editNotes'),
  };
}

/**
 * ¿Puede usar "Ajustar la duración"? Admin siempre; el profesional según su
 * permiso (en "Todo" sí; en "Personalizado", solo con esa casilla).
 */
export function canAdjustDuration(role, staffPermissions = null) {
  if (role !== ROLES.BARBER || !staffPermissions) return canEditField(role, 'duration', staffPermissions);
  return canEditPart(staffPermissions, 'editDuration');
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
export function canHardDelete(role, staffPermissions = null) {
  const base = !!(ACTION_PERMISSIONS[role] && ACTION_PERMISSIONS[role].canHardDelete);
  if (role !== ROLES.BARBER || !staffPermissions) return base;
  return base && normalizeStaffPermissions(staffPermissions).deleteAppointments;
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
export function getAllowedNextStates(role, currentStatus, staffPermissions = null) {
  if (role === ROLES.BARBER && staffPermissions && !canEditPart(staffPermissions, 'editFinish')) return [];
  const baseNextStates = getNextStates(currentStatus);
  const perms = ACTION_PERMISSIONS[role];
  if (!perms) return [];

  if (perms.restrictedTransitions === null) {
    return baseNextStates;
  }
  return baseNextStates.filter(s => perms.restrictedTransitions.includes(s));
}