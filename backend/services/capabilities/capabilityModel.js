// capabilityModel.js
//
// ÚNICA fuente de verdad del sistema de CAPACIDADES de GallyFlow.
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
//   CAPABILITIES[].default                   -> valor si nadie dice nada
// Prioridad: override del negocio > plan > perfil del tipo de negocio > default.
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

export const CAPABILITY_CATEGORIES = [
  { key: 'agenda', label: 'Agenda' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'equipo', label: 'Equipo' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'comunicacion', label: 'Comunicación' },
  { key: 'analitica', label: 'Analítica' },
];

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
  // ── AGENDA ──
  { key: 'agenda', category: 'agenda', label: 'Agenda', status: 'implemented', kind: 'toggle', core: true, default: true,
    description: 'Agenda del staff, citas y bloqueos de horario.', enforcedIn: ['ui'] },
  { key: 'servicios', category: 'agenda', label: 'Catálogo de servicios', status: 'implemented', kind: 'toggle', core: true, default: true,
    description: 'Servicios, precios y duración.', enforcedIn: ['ui'] },
  { key: 'reservaPublica', category: 'agenda', label: 'Reserva pública', status: 'implemented', kind: 'toggle', default: true,
    description: 'Link /reservar para que los clientes agenden solos.', enforcedIn: ['ui', 'backend', 'rules'] },
  { key: 'linkPersonalProfesional', category: 'agenda', label: 'Link personal del profesional', status: 'implemented', kind: 'toggle', default: true,
    requires: 'reservaPublica', description: 'Cada profesional comparte su propio link de reserva.', enforcedIn: ['ui'] },
  { key: 'listaEspera', category: 'agenda', label: 'Lista de espera', status: 'soon', kind: 'toggle', default: false },
  { key: 'citasRecurrentes', category: 'agenda', label: 'Citas recurrentes', status: 'soon', kind: 'toggle', default: false },

  // ── CLIENTES ──
  { key: 'clientes', category: 'clientes', label: 'Clientes', status: 'implemented', kind: 'toggle', default: true,
    description: 'Base de datos de clientes.', enforcedIn: ['ui'] },
  { key: 'fichaCliente', category: 'clientes', label: 'Ficha avanzada del cliente', status: 'implemented', kind: 'toggle', default: true,
    requires: 'clientes', description: 'Ficha con pestañas, notas y datos extendidos.', enforcedIn: ['ui'] },
  { key: 'historialCliente', category: 'clientes', label: 'Historial del cliente', status: 'implemented', kind: 'toggle', default: true,
    requires: 'fichaCliente', description: 'Actividad, citas, servicios y pagos del cliente.', enforcedIn: ['ui'] },
  { key: 'preferenciasCliente', category: 'clientes', label: 'Preferencias del cliente', status: 'implemented', kind: 'toggle', default: true,
    requires: 'fichaCliente', enforcedIn: ['ui'] },
  { key: 'camposPersonalizados', category: 'clientes', label: 'Campos personalizados', status: 'implemented', kind: 'toggle', default: true,
    requires: 'fichaCliente', enforcedIn: ['ui'] },

  // ── EQUIPO ──
  { key: 'profesionales', category: 'equipo', label: 'Profesionales', status: 'implemented', kind: 'quota', default: true,
    legacyKeys: ['staff'], limit: { unit: 'profesionales', period: null, defaultLimit: null },
    description: 'Cantidad máxima de profesionales.', enforcedIn: ['ui'] },
  { key: 'sucursales', category: 'equipo', label: 'Sucursales', status: 'implemented', kind: 'quota', default: true,
    limit: { unit: 'sucursales', period: null, defaultLimit: null },
    description: 'Cantidad máxima de sucursales.', enforcedIn: ['ui'] },
  { key: 'comisiones', category: 'equipo', label: 'Comisiones', status: 'implemented', kind: 'toggle', default: false,
    description: 'Liquidación de comisiones del staff.', enforcedIn: ['ui', 'backend'] },
  { key: 'permisosProfesional', category: 'equipo', label: 'Permisos por profesional', status: 'implemented', kind: 'toggle', default: true,
    description: 'Configurar qué puede hacer cada profesional en su panel.', enforcedIn: ['ui'] },
  { key: 'asistencia', category: 'equipo', label: 'Control de asistencia (PIN)', status: 'mock', kind: 'toggle', default: false,
    description: 'Pantalla existente pero no guarda datos reales.', enforcedIn: ['ui'] },

  // ── VENTAS ──
  { key: 'inventario', category: 'ventas', label: 'Inventario y venta de productos', status: 'mock', kind: 'toggle', default: false,
    description: 'Pantalla existente con productos de ejemplo; no guarda en Firestore.', enforcedIn: ['ui'] },
  { key: 'caja', category: 'ventas', label: 'Caja', status: 'soon', kind: 'toggle', default: false },
  { key: 'pagos', category: 'ventas', label: 'Pagos en línea', status: 'soon', kind: 'toggle', default: false },
  { key: 'anticipos', category: 'ventas', label: 'Anticipos', status: 'soon', kind: 'toggle', default: false },

  // ── COMUNICACIÓN ──
  { key: 'asistenteWhatsapp', category: 'comunicacion', label: 'Asistente de WhatsApp', status: 'implemented', kind: 'toggle', default: false,
    legacyKeys: ['automatizaciones'],
    limit: { unit: 'mensajes/mes', period: 'month', usageKey: 'whatsappMensajes', defaultLimit: null },
    description: 'Bot de reservas por WhatsApp (Railway). El límite cuenta mensajes enviados por el bot.',
    enforcedIn: ['ui', 'backend'] },
  { key: 'recordatoriosPush', category: 'comunicacion', label: 'Recordatorios push al profesional', status: 'implemented', kind: 'toggle', default: true,
    description: 'Aviso push al profesional antes de cada cita.', enforcedIn: ['backend'] },
  { key: 'recordatoriosWhatsapp', category: 'comunicacion', label: 'Recordatorios por WhatsApp al cliente', status: 'soon', kind: 'toggle', default: false },
  { key: 'recuperacionClientes', category: 'comunicacion', label: 'Recuperación de clientes', status: 'soon', kind: 'toggle', default: false },
  { key: 'resenasGoogle', category: 'comunicacion', label: 'Reseñas de Google', status: 'soon', kind: 'toggle', default: false },

  // ── ANALÍTICA ──
  { key: 'dashboard', category: 'analitica', label: 'Dashboard', status: 'implemented', kind: 'toggle', default: true,
    description: 'Panel general con métricas del día.', enforcedIn: ['ui'] },
  { key: 'analiticas', category: 'analitica', label: 'Analítica financiera', status: 'implemented', kind: 'toggle', default: false,
    description: 'Ingresos, comisiones por profesional y PIN financiero.', enforcedIn: ['ui', 'backend'] },
];

const BY_KEY = Object.fromEntries(CAPABILITIES.map((c) => [c.key, c]));

export function getCapability(key) {
  return BY_KEY[key] || null;
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
 * @param {object|null} args.profileDefaults capabilityDefaults del tipo de negocio
 *                                        (businessProfileModel). Va entre plan y catálogo.
 * @returns {Record<string, {
 *   enabled: boolean, limit: number|null,
 *   source: 'core'|'override'|'plan'|'profile'|'default'|'soon'|'requires',
 *   limitSource: 'override'|'plan'|'profile'|'default'|null,
 *   plan: {enabled?, limit?}|null, override: {enabled?, limit?}|null,
 *   blockedBy?: string
 * }>}
 */
export function resolveCapabilities({ planFeatures = null, overrides = null, profileDefaults = null } = {}) {
  const result = {};

  for (const cap of CAPABILITIES) {
    const plan = readFromMap(planFeatures, cap);
    const override = readFromMap(overrides, cap);
    const profile = readFromMap(profileDefaults, cap);

    let enabled;
    let source;
    if (cap.status === 'soon') {
      enabled = false; source = 'soon';
    } else if (cap.core || cap.kind === 'quota') {
      enabled = true; source = 'core';
    } else if (override && typeof override.enabled === 'boolean') {
      enabled = override.enabled; source = 'override';
    } else if (plan && typeof plan.enabled === 'boolean') {
      enabled = plan.enabled; source = 'plan';
    } else if (profile && typeof profile.enabled === 'boolean') {
      enabled = profile.enabled; source = 'profile';
    } else {
      enabled = !!cap.default; source = 'default';
    }

    let limit = null;
    let limitSource = null;
    if (cap.limit) {
      if (override && hasOwn(override, 'limit')) { limit = override.limit; limitSource = 'override'; }
      else if (plan && hasOwn(plan, 'limit')) { limit = plan.limit; limitSource = 'plan'; }
      else if (profile && hasOwn(profile, 'limit')) { limit = profile.limit; limitSource = 'profile'; }
      else { limit = cap.limit.defaultLimit ?? null; limitSource = 'default'; }
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
