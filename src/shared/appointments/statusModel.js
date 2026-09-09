// statusModel.js
// Fuente única de verdad sobre el ciclo de vida de una cita.
// Ni Admin ni Barber deben definir estados, labels o transiciones
// por su cuenta: ambos importan de aquí.

export const STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_PROCESS: 'in-process',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const STATUS_LABELS = {
  [STATUS.PENDING]: 'Por Confirmar',
  [STATUS.CONFIRMED]: 'Confirmada',
  [STATUS.IN_PROCESS]: 'En Atención',
  [STATUS.COMPLETED]: 'Completada',
  [STATUS.CANCELLED]: 'Cancelada',
};

// Desde cada estado, a qué estados se puede transicionar.
// completed y cancelled son estados finales (array vacío).
export const STATUS_TRANSITIONS = {
  [STATUS.PENDING]: [STATUS.CONFIRMED, STATUS.CANCELLED],
  [STATUS.CONFIRMED]: [STATUS.IN_PROCESS, STATUS.CANCELLED],
  [STATUS.IN_PROCESS]: [STATUS.COMPLETED, STATUS.CANCELLED],
  [STATUS.COMPLETED]: [],
  [STATUS.CANCELLED]: [],
};

/**
 * Devuelve el label en español para un estado.
 * Si el estado no existe en el mapa, devuelve el valor crudo
 * (esto evita pantallas en blanco si llega un dato inesperado).
 */
export function getLabel(status) {
  return STATUS_LABELS[status] || status || STATUS_LABELS[STATUS.PENDING];
}

/**
 * Devuelve el array de estados válidos a los que se puede pasar
 * desde el estado actual. Array vacío si el estado es final o inválido.
 */
export function getNextStates(currentStatus) {
  return STATUS_TRANSITIONS[currentStatus] || [];
}

/**
 * Indica si la transición de "from" a "to" está permitida
 * según el ciclo de vida definido arriba.
 */
export function canTransition(from, to) {
  return getNextStates(from).includes(to);
}

/**
 * Indica si un estado es final (no admite más transiciones).
 */
export function isFinal(status) {
  return getNextStates(status).length === 0;
}

// Clases de color usadas hoy en la tarjeta de la grilla de día de Admin.
// Se extraen tal cual para que AdminApp deje de tener esta regla hardcodeada,
// pero el resultado visual es idéntico al actual.
export function getStatusCardClasses(status) {
  if (status === STATUS.COMPLETED) {
    return 'bg-nexus-success-bg border-nexus-success/30 text-nexus-success-text hover:opacity-90';
  }
  if (status === STATUS.IN_PROCESS) {
    return 'bg-nexus-warning-bg border-nexus-warning/40 text-nexus-warning-text hover:opacity-90';
  }
  return 'bg-nexus-primary-soft border-nexus-primary/30 text-nexus-primary hover:opacity-90';
}