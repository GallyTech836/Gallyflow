// pinLockModel.js
//
// Bloqueo con PIN por módulo (lo configura Super Admin). Funciones puras.
//
// negocios/{id}.pinLockedModules = ['reports', 'barbers', ...]
// negocios/{id}.analyticsPinEnabled se mantiene sincronizado con 'reports'
// porque el backend lo usa para exigir la sesión financiera.
//
// La Agenda no se puede bloquear: es el uso diario del local.
// Copia en backend/services/finance/pinLockModules.js (mantener iguales).

export const LOCKABLE_MODULES = [
  'dashboard', 'clients', 'services', 'barbers', 'branches',
  'commissions', 'inventory', 'assistance', 'reports', 'settings',
];

/** Módulos bloqueados del negocio. Negocios viejos: solo analyticsPinEnabled. */
export function getLockedModules(data = {}) {
  const list = Array.isArray(data.pinLockedModules)
    ? data.pinLockedModules.filter((m) => LOCKABLE_MODULES.includes(m))
    : [];
  if (data.analyticsPinEnabled === true && !list.includes('reports')) list.push('reports');
  return [...new Set(list)];
}

/** ¿Hay que pedir el PIN para este módulo? */
export function isModuleLocked(lockedModules, moduleKey, unlocked) {
  if (unlocked) return false;
  return (lockedModules || []).includes(moduleKey);
}
