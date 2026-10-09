// capabilityModel.js
//
// ÚNICA fuente de verdad del sistema de CAPACIDADES de Nexus (GallyFlow).
//
// ⚠️ Este archivo existe IDÉNTICO en tres lugares (sin dependencias, JS puro):
//   - Nexus front:   src/shared/capabilities/capabilityModel.js
//   - Nexus backend: backend/services/capabilities/capabilityModel.js
//   - Super Admin:   src/shared/capabilityModel.js
// Si agregas o cambias una capacidad, edítalo en uno y copia el archivo a
// los otros dos. No hay que tocar nada más para que aparezca en Super Admin.
//
// Modelo:
//   planes/{planId}.features[key]            -> valor del plan
//   negocios/{id}.capabilityOverrides[key]   -> excepción del negocio
//   tipo de negocio (businessProfileModel)   -> SOLO restringe: módulos no
//                                               relevantes o capabilityDefaults
//                                               con enabled:false / límite menor
//   CAPABILITIES[].default                   -> valor si nadie dice nada
// Prioridad: excepción del negocio > restricción del tipo > plan > default.
// El tipo de negocio NUNCA habilita una capacidad que el plan no incluye.
//
// Formato de un valor (plan u override), todos opcionales:
//   true | false                       (atajo de { enabled })
//   { enabled: boolean, limit: number|null }
//   limit: null = ilimitado. Un override puede traer solo `limit` o solo
//   `enabled`, y el otro campo se hereda del plan.

// ───────────────────────── Estados de implementación ─────────────────────────

export const CAPABILITY_STATUS = {
  implemented: { label: 'Implementada', canEnable: true },
  partial: { label: 'Parcial', canEnable: true },
  mock: { label: 'Maqueta', canEnable: true },
  soon: { label: 'Próximamente', canEnable: false },
};

// MÓDULOS = secciones de Nexus. La clave es la pestaña de AdminApp
// (activeTab) y coincide con ALL_MODULES de businessProfileModel.js.
// Cada capacidad pertenece a un módulo; un módulo agrupa varias capacidades.
export const CAPABILITY_MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'agenda', label: 'Agenda y reservas' },
  { key: 'clients', label: 'Clientes' },
  { key: 'services', label: 'Servicios' },
  { key: 'barbers', label: 'Equipo' },
  { key: 'branches', label: 'Sucursales' },
  { key: 'commissions', label: 'Comisiones' },
  { key: 'inventory', label: 'Inventario y ventas' },
  { key: 'assistance', label: 'Asistencia' },
  { key: 'reports', label: 'Analítica' },
  { key: 'settings', label: 'Configuración y comunicación' },
];

// module: clave de CAPABILITY_MODULES.
// kind:
//   'toggle' -> se activa/desactiva. Puede tener `limit` de consumo.
//   'quota'  -> siempre disponible, solo tiene un límite de cantidad
//               (profesionales, sucursales). limit null = ilimitado.
// core: siempre activa, no se puede apagar (sin esto el producto no sirve).
// requires: solo se activa si la capacidad padre está activa.
// legacyKeys: claves viejas de planes ya guardados que significan lo mismo.
// default: valor cuando ni el plan ni un override dicen nada. Reproduce lo
//   que cada negocio veía ANTES de este sistema (compatibilidad sin migrar).
// enforcedIn: dónde se valida de verdad ('ui', 'backend', 'rules').
// limit.usageKey: campo en negocios/{id}/uso/{AAAA-MM} que mide el consumo.
export const CAPABILITIES = [
  // ── AGENDA Y RESERVAS ──
  { key: 'agenda', module: 'agenda', label: 'Agenda', status: 'implemented', kind: 'toggle', core: true, default: true,
    description: 'Agenda del staff, citas y bloqueos de horario.', enforcedIn: ['ui'] },
  { key: 'servicios', module: 'services', label: 'Catálogo de servicios', status: 'implemented', kind: 'toggle', core: true, default: true,
    description: 'Servicios, precios y duración.', enforcedIn: ['ui'] },
  { key: 'reservaPublica', module: 'agenda', label: 'Reserva pública', status: 'implemented', kind: 'toggle', default: true,
    description: 'Link /reservar para que los clientes agenden solos.', enforcedIn: ['ui', 'backend', 'rules'] },
  { key: 'linkPersonalProfesional', module: 'agenda', label: 'Link personal del profesional', status: 'implemented', kind: 'toggle', default: true,
    requires: 'reservaPublica', description: 'Cada profesional comparte su propio link de reserva.', enforcedIn: ['ui'] },
  { key: 'listaEspera', module: 'agenda', label: 'Lista de espera', status: 'soon', kind: 'toggle', default: false },
  { key: 'citasRecurrentes', module: 'agenda', label: 'Citas recurrentes', status: 'soon', kind: 'toggle', default: false },

  // ── CLIENTES ──
  { key: 'clientes', module: 'clients', label: 'Clientes', status: 'implemented', kind: 'toggle', default: true,
    description: 'Base de datos de clientes.', enforcedIn: ['ui'] },
  { key: 'fichaCliente', module: 'clients', label: 'Ficha avanzada del cliente', status: 'implemented', kind: 'toggle', default: true,
    requires: 'clientes', description: 'Ficha con pestañas, notas y datos extendidos.', enforcedIn: ['ui'] },
  { key: 'historialCliente', module: 'clients', label: 'Historial del cliente', status: 'implemented', kind: 'toggle', default: true,
    requires: 'fichaCliente', description: 'Actividad, citas, servicios y pagos del cliente.', enforcedIn: ['ui'] },
  { key: 'preferenciasCliente', module: 'clients', label: 'Preferencias del cliente', status: 'implemented', kind: 'toggle', default: true,
    requires: 'fichaCliente', enforcedIn: ['ui'] },
  { key: 'camposPersonalizados', module: 'clients', label: 'Campos personalizados', status: 'implemented', kind: 'toggle', default: true,
    requires: 'fichaCliente', enforcedIn: ['ui'] },

  // ── EQUIPO / SUCURSALES / COMISIONES / ASISTENCIA ──
  { key: 'profesionales', module: 'barbers', label: 'Profesionales', status: 'implemented', kind: 'quota', default: true,
    legacyKeys: ['staff'], limit: { unit: 'profesionales', period: null, defaultLimit: null },
    description: 'Cantidad máxima de profesionales.', enforcedIn: ['ui'] },
  { key: 'sucursales', module: 'branches', label: 'Sucursales', status: 'implemented', kind: 'quota', default: true,
    limit: { unit: 'sucursales', period: null, defaultLimit: null },
    description: 'Cantidad máxima de sucursales.', enforcedIn: ['ui'] },
  { key: 'comisiones', module: 'commissions', label: 'Comisiones', status: 'implemented', kind: 'toggle', default: false,
    description: 'Liquidación de comisiones del staff.', enforcedIn: ['ui', 'backend'] },
  { key: 'appProfesionales', module: 'barbers', label: 'App para profesionales', status: 'implemented', kind: 'toggle', default: true,
    description: 'Acceso de los profesionales a su panel (/barber). Default true: los planes guardados antes de existir esta capacidad la mantienen.',
    enforcedIn: ['ui'] },
  { key: 'permisosProfesional', module: 'barbers', label: 'Permisos por profesional', status: 'implemented', kind: 'toggle', default: true,
    requires: 'appProfesionales', description: 'Configurar qué puede hacer cada profesional en su panel.', enforcedIn: ['ui'] },
  { key: 'asistencia', module: 'assistance', label: 'Control de asistencia (PIN)', status: 'mock', kind: 'toggle', default: false,
    description: 'Pantalla existente pero no guarda datos reales.', enforcedIn: ['ui'] },

  // ── INVENTARIO Y VENTAS ──
  { key: 'inventario', module: 'inventory', label: 'Inventario y venta de productos', status: 'mock', kind: 'toggle', default: false,
    description: 'Pantalla existente con productos de ejemplo; no guarda en Firestore.', enforcedIn: ['ui'] },
  { key: 'caja', module: 'inventory', label: 'Caja', status: 'soon', kind: 'toggle', default: false },
  { key: 'pagos', module: 'agenda', label: 'Pagos en línea', status: 'soon', kind: 'toggle', default: false },
  { key: 'anticipos', module: 'agenda', label: 'Anticipos', status: 'soon', kind: 'toggle', default: false },

  // ── CONFIGURACIÓN Y COMUNICACIÓN ──
  { key: 'asistenteWhatsapp', module: 'settings', label: 'Asistente de WhatsApp', status: 'implemented', kind: 'toggle', default: false,
    legacyKeys: ['automatizaciones'],
    limit: { unit: 'mensajes/mes', period: 'month', usageKey: 'whatsappMensajes', defaultLimit: null },
    description: 'Bot de reservas por WhatsApp (Railway). El límite cuenta mensajes enviados por el bot.',
    enforcedIn: ['ui', 'backend'] },
  { key: 'recordatoriosPush', module: 'settings', label: 'Recordatorios push al profesional', status: 'implemented', kind: 'toggle', default: true,
    description: 'Aviso push al profesional antes de cada cita.', enforcedIn: ['backend'] },
  { key: 'recordatoriosWhatsapp', module: 'settings', label: 'Recordatorios por WhatsApp al cliente', status: 'soon', kind: 'toggle', default: false },
  { key: 'recuperacionClientes', module: 'settings', label: 'Recuperación de clientes', status: 'soon', kind: 'toggle', default: false },
  { key: 'resenasGoogle', module: 'settings', label: 'Reseñas de Google', status: 'soon', kind: 'toggle', default: false },

  // ── DASHBOARD / ANALÍTICA ──
  { key: 'dashboard', module: 'dashboard', label: 'Dashboard', status: 'implemented', kind: 'toggle', default: true,
    description: 'Panel general con métricas del día.', enforcedIn: ['ui'] },
  { key: 'analiticas', module: 'reports', label: 'Analítica financiera', status: 'implemented', kind: 'toggle', default: false,
    description: 'Ingresos, comisiones por profesional y PIN financiero.', enforcedIn: ['ui', 'backend'] },
];

const BY_KEY = Object.fromEntries(CAPABILITIES.map((c) => [c.key, c]));

export function getCapability(key) {
  return BY_KEY[key] || null;
}

/** Capacidades de un módulo, en el orden del catálogo. */
export function getModuleCapabilities(moduleKey) {
  return CAPABILITIES.filter((c) => c.module === moduleKey);
}

/** Capacidades que dependen (directa o indirectamente) de `key`. */
export function getDependents(key) {
  const out = [];
  const walk = (k) => {
    for (const c of CAPABILITIES) {
      if (c.requires === k && !out.includes(c)) { out.push(c); walk(c.key); }
    }
  };
  walk(key);
  return out;
}

// ───────────────────────── Normalización de valores ─────────────────────────

function hasOwn(obj, k) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, k);
}

function cleanLimit(v) {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * Convierte un valor guardado (plan u override) a { enabled?, limit? }.
 * Solo incluye los campos que el valor realmente define.
 */
function normalizeRaw(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'boolean') return { enabled: raw };
  if (typeof raw === 'object') {
    const out = {};
    if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
    if (hasOwn(raw, 'limit')) out.limit = cleanLimit(raw.limit);
    return Object.keys(out).length ? out : null;
  }
  return null;
}

/** Lee el valor de una capacidad en un mapa de features, aceptando claves viejas. */
function readFromMap(map, cap) {
  if (!map) return null;
  if (hasOwn(map, cap.key)) return normalizeRaw(map[cap.key]);
  for (const legacy of cap.legacyKeys || []) {
    if (hasOwn(map, legacy)) {
      const v = normalizeRaw(map[legacy]);
      // En los planes viejos una "cuota" apagada significaba "sin límite".
      if (cap.kind === 'quota' && v && v.enabled === false) return { limit: null };
      return v;
    }
  }
  return null;
}

// ───────────────────────── Resolución ─────────────────────────

/**
 * Resuelve TODAS las capacidades de un negocio.
 * @param {object} args
 * @param {object|null} args.planFeatures   planes/{id}.features
 * @param {object|null} args.overrides      negocios/{id}.capabilityOverrides
 * @param {object|null} args.profileDefaults capabilityDefaults del tipo de negocio.
 *                                        SOLO restringe: enabled:false o límite menor.
 * @param {string[]|null} args.relevantModules módulos del tipo de negocio; las
 *                                        capacidades de otros módulos se apagan
 *                                        (salvo excepción). null = todos.
 * @returns {Record<string, {
 *   enabled: boolean, limit: number|null,
 *   source: 'core'|'override'|'plan'|'profile'|'default'|'soon'|'requires',
 *   limitSource: 'override'|'plan'|'profile'|'default'|null,
 *   plan: {enabled?, limit?}|null, override: {enabled?, limit?}|null,
 *   blockedBy?: string
 * }>}
 */
export function resolveCapabilities({ planFeatures = null, overrides = null, profileDefaults = null, relevantModules = null } = {}) {
  const result = {};

  for (const cap of CAPABILITIES) {
    const plan = readFromMap(planFeatures, cap);
    const override = readFromMap(overrides, cap);
    const profile = readFromMap(profileDefaults, cap);
    const moduleOff = Array.isArray(relevantModules) && cap.module && !relevantModules.includes(cap.module);
    const profileRestricts = moduleOff || (profile && profile.enabled === false);

    let enabled;
    let source;
    if (cap.status === 'soon') {
      enabled = false; source = 'soon';
    } else if (cap.core || cap.kind === 'quota') {
      enabled = true; source = 'core';
    } else if (override && typeof override.enabled === 'boolean') {
      enabled = override.enabled; source = 'override';
    } else if (profileRestricts) {
      enabled = false; source = 'profile';
    } else if (plan && typeof plan.enabled === 'boolean') {
      enabled = plan.enabled; source = 'plan';
    } else {
      enabled = !!cap.default; source = 'default';
    }

    let limit = null;
    let limitSource = null;
    if (cap.limit) {
      if (override && hasOwn(override, 'limit')) { limit = override.limit; limitSource = 'override'; }
      else if (plan && hasOwn(plan, 'limit')) { limit = plan.limit; limitSource = 'plan'; }
      else { limit = cap.limit.defaultLimit ?? null; limitSource = 'default'; }
      // El tipo de negocio solo puede BAJAR el límite (nunca subirlo).
      const pl = profile && hasOwn(profile, 'limit') ? profile.limit : null;
      if (limitSource !== 'override' && typeof pl === 'number' && (limit === null || pl < limit)) {
        limit = pl; limitSource = 'profile';
      }
    }

    result[cap.key] = { enabled, limit, source, limitSource, plan, override };
  }

  // Dependencias (en orden del catálogo los padres van antes que los hijos,
  // pero se recorre hasta estabilizar por si acaso).
  let changed = true;
  while (changed) {
    changed = false;
    for (const cap of CAPABILITIES) {
      if (!cap.requires) continue;
      const self = result[cap.key];
      const parent = result[cap.requires];
      if (self.enabled && parent && !parent.enabled) {
        self.enabled = false;
        self.source = 'requires';
        self.blockedBy = cap.requires;
        changed = true;
      }
    }
  }

  return result;
}

/** true si la capacidad está activa en el resultado de resolveCapabilities. */
export function canUse(resolved, key) {
  return !!resolved?.[key]?.enabled;
}

/** Límite numérico de la capacidad, o null si es ilimitada / no aplica. */
export function getLimit(resolved, key) {
  const v = resolved?.[key];
  return v && typeof v.limit === 'number' ? v.limit : null;
}

/**
 * Estado de consumo de una capacidad con límite.
 * @returns {{ limit: number|null, used: number, remaining: number|null,
 *             percent: number|null, overage: number, exceeded: boolean }}
 */
export function usageStatus(limit, used) {
  const u = Number(used) || 0;
  if (limit === null || limit === undefined) {
    return { limit: null, used: u, remaining: null, percent: null, overage: 0, exceeded: false };
  }
  const percent = limit === 0 ? (u > 0 ? 100 : 0) : Math.round((u / limit) * 100);
  return {
    limit,
    used: u,
    remaining: Math.max(0, limit - u),
    percent,
    overage: Math.max(0, u - limit),
    exceeded: u >= limit,
  };
}

/**
 * Arma el objeto `features` para guardar un plan: TODAS las capacidades
 * configurables quedan explícitas (true/false), así apagar una en el plan
 * de verdad la apaga (antes se borraba la clave y caía al default).
 */
export function buildPlanFeatures(draft = {}) {
  const out = {};
  for (const cap of CAPABILITIES) {
    if (cap.status === 'soon' || cap.core) continue;
    const v = readFromMap(draft, cap) || {};
    if (cap.kind === 'quota') {
      out[cap.key] = { limit: hasOwn(v, 'limit') ? v.limit : null };
    } else if (cap.limit) {
      out[cap.key] = { enabled: v.enabled ?? !!cap.default, limit: hasOwn(v, 'limit') ? v.limit : null };
    } else {
      out[cap.key] = v.enabled ?? !!cap.default;
    }
  }
  return out;
}

/** Limpia overrides: quita los vacíos y valores de capacidades inexistentes. */
export function cleanOverrides(overrides = {}) {
  const out = {};
  for (const [key, raw] of Object.entries(overrides || {})) {
    const cap = BY_KEY[key];
    if (!cap || cap.status === 'soon' || cap.core) continue;
    const v = normalizeRaw(raw);
    if (!v) continue;
    if (cap.kind === 'quota') delete v.enabled;
    if (!cap.limit) delete v.limit;
    if (Object.keys(v).length) out[key] = v;
  }
  return out;
}

// ───────────────────────── Estado del negocio / prueba ─────────────────────────

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Estado efectivo del negocio. Mismo criterio en Super Admin, Nexus y backend:
 *  - suspendido manual siempre gana
 *  - en prueba con trialEnd pasado => vencido
 *  - subscriptionEnd pasado => vencido
 * Se recalcula al leer, no depende de ningún cron.
 */
export function computeEffectiveStatus(status, subscriptionEnd, trialEnd) {
  const s = status || 'active';
  if (s === 'suspended') return 'suspended';
  const today = startOfToday();
  if (s === 'trial' && trialEnd && new Date(trialEnd) < today) return 'expired';
  if (subscriptionEnd && new Date(subscriptionEnd) < today) return 'expired';
  return s;
}

export function isBlockedStatus(status) {
  return status === 'suspended' || status === 'expired';
}

/** Período de consumo "AAAA-MM" en la zona horaria del negocio. */
export function usagePeriodKey(date = new Date(), timeZone = 'America/La_Paz') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  return `${y}-${m}`;
}
