// pinLockModules.js
//
// Módulos de AdminApp que Super Admin puede bloquear con el PIN del negocio.
// Copia de src/shared/pinLock/pinLockModel.js (mantener iguales).
// 'reports' además activa analyticsPinEnabled, que el backend usa para
// exigir la sesión financiera en /api/finance.

export const LOCKABLE_MODULES = [
  'dashboard', 'clients', 'services', 'barbers', 'branches',
  'commissions', 'inventory', 'assistance', 'reports', 'settings',
];

/** Lista válida y sin repetidos, o null si no es una lista. */
export function sanitizeLockedModules(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((m) => LOCKABLE_MODULES.includes(m)))];
}

/** Módulos bloqueados según el documento del negocio (incluye negocios viejos). */
export function getLockedModules(data = {}) {
  const list = sanitizeLockedModules(data.pinLockedModules) || [];
  if (data.analyticsPinEnabled === true && !list.includes('reports')) list.push('reports');
  return list;
}

/**
 * Campos a guardar en el negocio. Acepta la lista completa (lockedModules) o
 * el interruptor viejo de Analítica (enabled). Devuelve null si no hay cambio.
 */
export function buildLockPatch(current = {}, { lockedModules, enabled } = {}) {
  let list = sanitizeLockedModules(lockedModules);
  if (list === null && typeof enabled === 'boolean') {
    const base = getLockedModules(current).filter((m) => m !== 'reports');
    list = enabled ? [...base, 'reports'] : base;
  }
  if (list === null) return null;
  return { pinLockedModules: list, analyticsPinEnabled: list.includes('reports') };
}
