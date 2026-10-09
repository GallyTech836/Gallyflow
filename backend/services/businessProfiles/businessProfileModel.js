// businessProfileModel.js
//
// ÚNICA fuente de verdad de los TIPOS DE NEGOCIO (Business Profiles) de Nexus.
//
// ⚠️ Este archivo existe IDÉNTICO en tres lugares (sin dependencias, JS puro),
// igual que capabilityModel.js:
//   - Nexus front:   src/shared/businessProfiles/businessProfileModel.js
//   - Nexus backend: backend/services/businessProfiles/businessProfileModel.js
//   - Super Admin:   src/shared/businessProfileModel.js
// Si agregas o cambias un perfil, edítalo en uno y copia el archivo a los otros dos.
//
// Modelo:
//   negocios/{id}.businessType  -> clave de BUSINESS_PROFILES (string)
//   Si falta o no existe        -> DEFAULT_BUSINESS_TYPE ('otro', terminología
//                                  genérica = lo que Nexus mostraba antes).
//
// El TIPO decide: terminología y qué módulos son relevantes. Solo puede
// RESTRINGIR: un módulo fuera de `modules` apaga sus capacidades, y
// `capabilityDefaults` solo acepta enabled:false o un límite menor.
// NUNCA habilita una capacidad comercial que el plan no incluya.
// El PLAN decide: qué capacidades están incluidas y sus límites
// (ver capabilityModel.js). Prioridad final de una capacidad:
//   excepción del negocio > restricción del tipo > plan > catálogo.
//
// FUTURO (no implementado): negocios/{id}.terminologyOverrides para que Super
// Admin personalice etiquetas por negocio. getTerm() ya acepta ese mapa.

// Claves de terminología. Internamente el código sigue usando
// professional / client / service / appointment; la UI pide la etiqueta aquí.
export const TERM_KEYS = [
  'professional', 'professionals',
  'client', 'clients',
  'service', 'services',
  'appointment', 'appointments',
];

// Pestañas que YA existen en AdminApp (activeTab). Debe coincidir con
// CAPABILITY_MODULES de capabilityModel.js. No agregar módulos que no existan.
// Quitar un módulo de `modules` de un perfil oculta la pestaña y apaga sus
// capacidades (las core —Agenda, Servicios— nunca se apagan).
export const ALL_MODULES = [
  'dashboard', 'agenda', 'barbers', 'services', 'clients', 'branches',
  'inventory', 'commissions', 'assistance', 'reports', 'settings',
];

// gender: 'm' | 'f' por sustantivo, para "Nuevo/Nueva", "del/de la", etc.
function terms(professional, professionals, client, clients, service, services, appointment, appointments, gender) {
  return {
    terminology: { professional, professionals, client, clients, service, services, appointment, appointments },
    gender: { professional: 'm', client: 'm', service: 'm', appointment: 'f', ...gender },
  };
}

const GENERIC = terms('Profesional', 'Profesionales', 'Cliente', 'Clientes', 'Servicio', 'Servicios', 'Cita', 'Citas');

export const BUSINESS_PROFILES = {
  barberia: {
    label: 'Barbería',
    ...terms('Barbero', 'Barberos', 'Cliente', 'Clientes', 'Servicio', 'Servicios', 'Cita', 'Citas'),
    modules: ALL_MODULES,
    capabilityDefaults: {},
  },
  salon: {
    label: 'Salón de belleza',
    ...GENERIC,
    modules: ALL_MODULES,
    capabilityDefaults: {},
  },
  estetica: {
    label: 'Estética',
    ...GENERIC,
    modules: ALL_MODULES,
    capabilityDefaults: {},
  },
  odontologia: {
    label: 'Odontología',
    ...terms('Doctor', 'Doctores', 'Paciente', 'Pacientes', 'Tratamiento', 'Tratamientos', 'Consulta', 'Consultas'),
    modules: ALL_MODULES,
    capabilityDefaults: {},
  },
  clinica: {
    label: 'Clínica',
    ...terms('Médico', 'Médicos', 'Paciente', 'Pacientes', 'Consulta', 'Consultas', 'Consulta', 'Consultas', { service: 'f' }),
    modules: ALL_MODULES,
    capabilityDefaults: {},
  },
  veterinaria: {
    label: 'Veterinaria',
    ...terms('Veterinario', 'Veterinarios', 'Propietario', 'Propietarios', 'Servicio', 'Servicios', 'Cita', 'Citas'),
    modules: ALL_MODULES,
    capabilityDefaults: {},
  },
  gimnasio: {
    label: 'Gimnasio',
    ...terms('Entrenador', 'Entrenadores', 'Miembro', 'Miembros', 'Clase', 'Clases', 'Reserva', 'Reservas', { service: 'f' }),
    modules: ALL_MODULES,
    capabilityDefaults: {},
  },
  spa: {
    label: 'Spa',
    ...GENERIC,
    modules: ALL_MODULES,
    capabilityDefaults: {},
  },
  otro: {
    label: 'Otro',
    ...GENERIC,
    modules: ALL_MODULES,
    capabilityDefaults: {},
  },
};

export const DEFAULT_BUSINESS_TYPE = 'otro';

/** Lista para selects: [{ key, label }] en el orden del catálogo. */
export const BUSINESS_TYPES = Object.entries(BUSINESS_PROFILES).map(([key, p]) => ({ key, label: p.label }));

export function isValidBusinessType(type) {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(BUSINESS_PROFILES, type);
}

/** Tipo efectivo: el guardado si es válido, si no el fallback. */
export function resolveBusinessType(type) {
  return isValidBusinessType(type) ? type : DEFAULT_BUSINESS_TYPE;
}

/** Perfil completo (con `type`) — nunca devuelve null. */
export function getBusinessProfile(type) {
  const key = resolveBusinessType(type);
  return { type: key, ...BUSINESS_PROFILES[key] };
}

export function getBusinessTypeLabel(type) {
  return getBusinessProfile(type).label;
}

/**
 * Etiqueta visible para una clave de terminología.
 * @param {object} profile    resultado de getBusinessProfile
 * @param {string} key        una de TERM_KEYS
 * @param {object} [overrides] FUTURO: negocios/{id}.terminologyOverrides
 */
export function getTerm(profile, key, overrides = null) {
  const custom = overrides?.[key];
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return profile?.terminology?.[key] ?? BUSINESS_PROFILES[DEFAULT_BUSINESS_TYPE].terminology[key] ?? key;
}

/** 'm' | 'f' del sustantivo base (professional, client, service, appointment). */
export function getTermGender(profile, key) {
  const base = String(key).replace(/s$/, '');
  return profile?.gender?.[base] || 'm';
}

/** true si el módulo (pestaña) es relevante para el rubro. */
export function isModuleRelevant(profile, moduleKey) {
  const list = profile?.modules;
  return !Array.isArray(list) || list.includes(moduleKey);
}
