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
// Personalización por negocio: negocios/{id}.terminologyOverrides (ver
// sección Terminología más abajo). Prioridad: negocio > tipo > genérico.

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

// ───────────────────────── Terminología ─────────────────────────
//
// Prioridad: personalización del negocio > perfil del tipo > genérico ('otro').
//
// Personalización (opcional, solo textos, no afecta datos ni capacidades):
//   negocios/{id}.terminologyOverrides = {
//     [concept]: { singular: string, plural: string, gender: 'm'|'f' }
//   }
// Se personaliza el CONCEPTO completo para que singular, plural y género
// nunca queden desparejos. Borrar la clave = volver al término del tipo.
// Las personalizaciones son del negocio: se conservan si cambia el tipo.

export const TERM_CONCEPTS = ['professional', 'client', 'service', 'appointment'];
export const TERM_CONCEPT_LABELS = {
  professional: 'Profesional', client: 'Cliente', service: 'Servicio', appointment: 'Cita',
};
export const TERM_MAX_LENGTH = 30;

function cleanText(v) {
  if (typeof v !== 'string') return '';
  // Solo texto plano: sin etiquetas/llaves, espacios normalizados.
  return v.replace(/[<>{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, TERM_MAX_LENGTH);
}

/**
 * Normaliza terminologyOverrides: solo conceptos conocidos, completos y
 * válidos. Lo demás se descarta. Devuelve {} si no queda nada.
 */
export function cleanTerminologyOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const concept of TERM_CONCEPTS) {
    const v = raw[concept];
    if (!v || typeof v !== 'object') continue;
    const singular = cleanText(v.singular);
    const plural = cleanText(v.plural);
    const gender = v.gender === 'f' ? 'f' : v.gender === 'm' ? 'm' : null;
    if (singular && plural && gender) out[concept] = { singular, plural, gender };
  }
  return out;
}

/**
 * Terminología efectiva de un negocio.
 * @returns {{ terminology: Record<string,string>, gender: Record<string,'m'|'f'>,
 *             customized: Record<string, boolean> }}
 */
export function resolveTerminology(profile, overrides = null) {
  const generic = BUSINESS_PROFILES[DEFAULT_BUSINESS_TYPE];
  const terminology = { ...generic.terminology, ...(profile?.terminology || {}) };
  const gender = { ...generic.gender, ...(profile?.gender || {}) };
  const customized = {};
  const clean = cleanTerminologyOverrides(overrides);
  for (const [concept, v] of Object.entries(clean)) {
    terminology[concept] = v.singular;
    terminology[`${concept}s`] = v.plural;
    gender[concept] = v.gender;
    customized[concept] = true;
  }
  return { terminology, gender, customized };
}

/**
 * Etiqueta visible para una clave de terminología.
 * @param {object} profile     resultado de getBusinessProfile
 * @param {string} key         una de TERM_KEYS
 * @param {object} [overrides] negocios/{id}.terminologyOverrides
 */
export function getTerm(profile, key, overrides = null) {
  return resolveTerminology(profile, overrides).terminology[key] ?? key;
}

/** 'm' | 'f' del sustantivo base (professional, client, service, appointment). */
export function getTermGender(profile, key, overrides = null) {
  const base = String(key).replace(/s$/, '');
  return resolveTerminology(profile, overrides).gender[base] || 'm';
}

/**
 * Funciones de texto listas para usar (UI, backend o módulos sin React):
 *   t('clients')                    -> "Pacientes"
 *   tl('client')                    -> "paciente" (para frases)
 *   g('appointment', 'Nuevo', 'Nueva') -> concordancia de género
 * Sin tipo ni personalización devuelve los términos genéricos.
 */
export function createTerms(businessType = null, overrides = null) {
  const profile = getBusinessProfile(businessType);
  const { terminology, gender, customized } = resolveTerminology(profile, overrides);
  const t = (key) => terminology[key] ?? key;
  return {
    type: profile.type,
    profile,
    terminology,
    customized,
    t,
    tl: (key) => t(key).toLowerCase(),
    g: (key, masc, fem) => (gender[String(key).replace(/s$/, '')] === 'f' ? fem : masc),
  };
}

/** Términos genéricos (cuando todavía no se conoce el negocio). */
export const GENERIC_TERMS = createTerms(null, null);

/** true si el módulo (pestaña) es relevante para el rubro. */
export function isModuleRelevant(profile, moduleKey) {
  const list = profile?.modules;
  return !Array.isArray(list) || list.includes(moduleKey);
}
