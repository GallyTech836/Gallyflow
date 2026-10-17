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
//   negocios/{id}.addons                     -> complementos contratados
//                                               (ver ADDONS): se SUMAN al plan
//   CAPABILITIES[].default                   -> valor si nadie dice nada
// Prioridad: excepción del negocio > restricción del tipo > plan + complementos > default.
// El tipo de negocio NUNCA habilita una capacidad que el plan no incluye.
// Un plan NUNCA activa el Asistente de WhatsApp: es un complemento aparte.
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
  // Vertical restaurante (src/verticals/restaurante)
  { key: 'orders', label: 'Pedidos y cocina' },
  { key: 'tables', label: 'Mesas y reservas' },
  { key: 'menu', label: 'Menú' },
  { key: 'pos', label: 'Caja' },
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
// limit.perClient: el límite se aplica a CADA cliente (celular) por separado,
//   en negocios/{id}/uso/{AAAA-MM}/clientes/{celular}. El total del negocio
//   se sigue contando en usageKey solo como dato (no corta el servicio).
// limit.noPlanLimit: límite para negocios SIN plan asignado (o con un plan
//   que ya no existe). Evita que un negocio sin plan quede ilimitado. Los
//   planes guardados siempre traen su límite explícito, así que no les afecta.
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
    legacyKeys: ['staff'], limit: { unit: 'profesionales', period: null, defaultLimit: null, noPlanLimit: 2 },
    description: 'Cantidad máxima de profesionales.', enforcedIn: ['ui', 'backend'] },
  { key: 'sucursales', module: 'branches', label: 'Sucursales', status: 'implemented', kind: 'quota', default: true,
    limit: { unit: 'sucursales', period: null, defaultLimit: null, noPlanLimit: 1 },
    description: 'Cantidad máxima de sucursales.', enforcedIn: ['ui', 'backend'] },
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
    limit: { unit: 'respuestas/mes por cliente', period: 'month', usageKey: 'whatsappMensajes', perClient: true, defaultLimit: null },
    description: 'Bot de reservas por WhatsApp (Railway). Complemento aparte (ver ADDONS). El límite es POR CLIENTE: respuestas que el bot le envía a cada celular en el mes.',
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

  // ── RESTAURANTE ──
  // Solo existen para negocios del vertical 'restaurante': en los demás tipos
  // su módulo no es relevante y quedan apagadas. Default true para que un
  // restaurante funcione con cualquier plan ya guardado (igual que appProfesionales).
  { key: 'pedidos', module: 'orders', label: 'Pedidos y pantalla de cocina', status: 'mock', kind: 'toggle', default: true,
    description: 'Comandas en tiempo real para cocina y barra.', enforcedIn: ['ui'] },
  { key: 'appMesero', module: 'orders', label: 'App del mesero', status: 'mock', kind: 'toggle', default: true,
    requires: 'pedidos', description: 'Toma de pedidos desde el celular del mesero.', enforcedIn: ['ui'] },
  { key: 'pedidosWhatsapp', module: 'orders', label: 'Pedidos por WhatsApp', status: 'soon', kind: 'toggle', default: false,
    requires: 'pedidos' },
  { key: 'mesas', module: 'tables', label: 'Mesas y zonas', status: 'mock', kind: 'toggle', default: true,
    description: 'Plano de mesas por zona con su estado.', enforcedIn: ['ui'] },
  { key: 'reservasMesa', module: 'tables', label: 'Reservas de mesa', status: 'soon', kind: 'toggle', default: false,
    requires: 'mesas' },
  { key: 'menuRestaurante', module: 'menu', label: 'Menú', status: 'mock', kind: 'toggle', default: true,
    description: 'Categorías, productos, extras y destino (cocina o barra).', enforcedIn: ['ui'] },
  { key: 'cajaRestaurante', module: 'pos', label: 'Caja y cobros', status: 'mock', kind: 'toggle', default: true,
    description: 'Cuentas por mesa, descuentos, división y métodos de pago.', enforcedIn: ['ui'] },
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

// ───────────────────────── Complementos (add-ons) ─────────────────────────
//
// Se contratan por negocio, aparte del plan. Se guardan en
//   negocios/{id}.addons = { profesionalesExtra: number, asistenteWhatsapp: boolean }
// y el precio de cada uno lo define el plan en
//   planes/{id}.addons[key] = { available: boolean, price: number }
// Contratar un plan NO activa ningún complemento.
//   kind 'quantity' -> suma `businessField` unidades al límite de `capability`
//   kind 'toggle'   -> activa `capability` (si el tipo de negocio lo permite)
export const ADDONS = [
  { key: 'profesionalExtra', label: 'Profesional adicional', kind: 'quantity', capability: 'profesionales',
    businessField: 'profesionalesExtra', unit: 'profesional', defaultPrice: 45, max: 50 },
  { key: 'asistenteWhatsapp', label: 'Asistente de WhatsApp', kind: 'toggle', capability: 'asistenteWhatsapp',
    businessField: 'asistenteWhatsapp', defaultPrice: 350,
    description: 'Solo para negocios compatibles con la integración de WhatsApp.' },
];

const ADDON_BY_CAPABILITY = Object.fromEntries(ADDONS.map((a) => [a.capability, a]));

/** Normaliza negocios/{id}.addons. Valores inválidos = sin complemento. */
export function normalizeAddons(raw) {
  const out = { profesionalesExtra: 0, asistenteWhatsapp: false };
  if (!raw || typeof raw !== 'object') return out;
  const n = Math.floor(Number(raw.profesionalesExtra));
  if (Number.isFinite(n) && n > 0) out.profesionalesExtra = Math.min(n, ADDONS[0].max);
  out.asistenteWhatsapp = raw.asistenteWhatsapp === true;
  return out;
}

function addonExtraFor(cap, extras) {
  const addon = ADDON_BY_CAPABILITY[cap.key];
  if (!addon || addon.kind !== 'quantity') return 0;
  return Number(extras[addon.businessField]) || 0;
}

// Complemento tipo toggle contratado: el valor "del plan" pasa a enabled:true
// (conserva el límite que el plan defina). Las excepciones y el tipo de
// negocio se siguen aplicando encima.
function applyAddon(cap, planValue, extras) {
  const addon = ADDON_BY_CAPABILITY[cap.key];
  if (!addon || addon.kind !== 'toggle' || extras[addon.businessField] !== true) return planValue;
  return { ...(planValue || {}), enabled: true, viaAddon: true };
}

/** Complemento asociado a una capacidad (o null). */
export function getAddonForCapability(capKey) {
  return ADDON_BY_CAPABILITY[capKey] || null;
}

/** Precio y disponibilidad de un complemento en un plan (con valores por defecto). */
export function getAddonOffer(plan, addonKey) {
  const addon = ADDONS.find((a) => a.key === addonKey);
  if (!addon) return null;
  const raw = plan?.addons?.[addonKey] || {};
  const price = Number(raw.price);
  return {
    ...addon,
    available: raw.available !== false,
    price: Number.isFinite(price) && price >= 0 ? price : addon.defaultPrice,
  };
}

/**
 * Total mensual estimado del negocio: plan + complementos contratados.
 * Solo informativo (los cobros siguen siendo manuales).
 */
export function computeMonthlyTotal(plan, addons) {
  const a = normalizeAddons(addons);
  const base = Number(plan?.price) || 0;
  const pro = getAddonOffer(plan, 'profesionalExtra');
  const wa = getAddonOffer(plan, 'asistenteWhatsapp');
  const lines = [];
  if (plan) lines.push({ key: 'plan', label: plan.name || 'Plan', amount: base });
  if (a.profesionalesExtra > 0) {
    lines.push({ key: 'profesionalExtra', label: `${a.profesionalesExtra} × ${pro.label}`, amount: a.profesionalesExtra * pro.price });
  }
  if (a.asistenteWhatsapp) lines.push({ key: 'asistenteWhatsapp', label: wa.label, amount: wa.price });
  return { total: lines.reduce((s, l) => s + l.amount, 0), currency: plan?.currency || 'Bs', lines };
}

// ───────────────────────── Verticales de plan ─────────────────────────
//
// planes/{id}.vertical separa los planes comerciales:
//   'citas'       -> barberías, salones y negocios con agenda (a la venta)
//   'restaurante' -> futuro módulo de restaurantes (NO está a la venta)
// Un plan sin `vertical` es un plan anterior: no se toca su configuración.
export const PLAN_VERTICALS = [
  { key: 'citas', label: 'Negocios con citas', sellable: true },
  { key: 'restaurante', label: 'Restaurantes (próximamente)', sellable: false },
];
const RESTAURANT_MODULE_KEYS = ['orders', 'tables', 'menu', 'pos'];

/** ¿La capacidad pertenece a la vertical del plan? (sin vertical = todas) */
export function isCapabilityInVertical(cap, vertical) {
  if (!vertical) return true;
  const isRestaurant = RESTAURANT_MODULE_KEYS.includes(cap.module);
  return vertical === 'restaurante' ? isRestaurant || cap.core : !isRestaurant;
}

/** ¿Se puede asignar este plan a un negocio de esta vertical (businessProfile.vertical)? */
export function isPlanCompatible(plan, businessVertical = 'citas') {
  if (!plan?.vertical) return true; // plan anterior sin vertical
  return plan.vertical === (businessVertical || 'citas');
}

/**
 * Capacidades que se pueden PROMOCIONAR como incluidas: activas y realmente
 * operativas (implementadas o parciales). Nunca maquetas ni "próximamente",
 * ni complementos (el WhatsApp activado por complemento no cuenta).
 */
export function sellableCapabilities(resolved) {
  return CAPABILITIES.filter((c) => {
    const v = resolved?.[c.key];
    if (!v?.enabled || v.source === 'addon') return false;
    if (c.status !== 'implemented' && c.status !== 'partial') return false;
    return c.kind !== 'quota';
  });
}

// ───────────────────────── Planes de lanzamiento ─────────────────────────
//
// Semilla de los planes comerciales de lanzamiento. Super Admin los crea con
// estos IDs SOLO si no existen (nunca reemplaza un documento). Después de
// crearlos, la fuente de verdad es Firestore: precios y límites se editan
// desde Super Admin, no aquí.
const ESENCIAL_FEATURES = {
  reservaPublica: true, linkPersonalProfesional: true,
  clientes: true, fichaCliente: false, historialCliente: false, preferenciasCliente: false, camposPersonalizados: false,
  appProfesionales: true, permisosProfesional: false,
  comisiones: false, analiticas: false, dashboard: true, recordatoriosPush: true,
  // Maquetas: no se venden.
  asistencia: false, inventario: false,
  // Complemento aparte, nunca incluido en el plan. El límite (mensajes que
  // envía el bot por mes) aplica cuando el negocio contrata el complemento.
  asistenteWhatsapp: { enabled: false, limit: 1000 },
  // Vertical restaurante: fuera de estos planes.
  pedidos: false, appMesero: false, mesas: false, menuRestaurante: false, cajaRestaurante: false,
};
const PROFESIONAL_FEATURES = {
  ...ESENCIAL_FEATURES,
  fichaCliente: true, historialCliente: true, preferenciasCliente: true, camposPersonalizados: true,
  permisosProfesional: true, comisiones: true, analiticas: true,
};
const LAUNCH_ADDONS = {
  profesionalExtra: { available: true, price: 45 },
  asistenteWhatsapp: { available: true, price: 350 },
};

export const LAUNCH_PLAN_PRESETS = [
  {
    id: 'esencial', name: 'Esencial', order: 1, price: 150,
    description: 'Agenda y gestión de citas, link público de reservas, servicios y precios, registro de clientes y app para profesionales.',
    features: { ...ESENCIAL_FEATURES, profesionales: { limit: 2 }, sucursales: { limit: 1 } },
  },
  {
    id: 'profesional', name: 'Profesional', order: 2, price: 280,
    description: 'Todo lo de Esencial, más comisiones por profesional, analítica y control financiero, historial de clientes y gestión de permisos.',
    features: { ...PROFESIONAL_FEATURES, profesionales: { limit: 5 }, sucursales: { limit: 1 } },
  },
  {
    id: 'premium', name: 'Premium', order: 3, price: 450,
    description: 'Todo lo de Profesional, con mayor capacidad para gestionar el negocio.',
    features: { ...PROFESIONAL_FEATURES, profesionales: { limit: 10 }, sucursales: { limit: 2 } },
  },
].map((p) => ({
  ...p,
  currency: 'Bs',
  billingCycle: 'monthly',
  vertical: 'citas',
  trialDays: 14,
  setupFee: 0, // activación gratuita durante el lanzamiento
  active: true,
  addons: LAUNCH_ADDONS,
}));

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
export function resolveCapabilities({ planFeatures = null, overrides = null, profileDefaults = null, relevantModules = null, addons = null } = {}) {
  const result = {};
  const hasPlan = planFeatures != null;
  const extras = normalizeAddons(addons);

  for (const cap of CAPABILITIES) {
    const plan = applyAddon(cap, readFromMap(planFeatures, cap), extras);
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
      enabled = plan.enabled; source = plan.viaAddon ? 'addon' : 'plan';
    } else {
      enabled = !!cap.default; source = 'default';
    }

    let limit = null;
    let limitSource = null;
    if (cap.limit) {
      if (override && hasOwn(override, 'limit')) { limit = override.limit; limitSource = 'override'; }
      else if (plan && hasOwn(plan, 'limit')) { limit = plan.limit; limitSource = 'plan'; }
      else {
        limit = !hasPlan && cap.limit.noPlanLimit !== undefined ? cap.limit.noPlanLimit : (cap.limit.defaultLimit ?? null);
        limitSource = 'default';
      }
      // Complemento de cantidad (ej. profesionales adicionales): se suma al
      // límite del plan/default. Una excepción con límite propio manda.
      const extra = addonExtraFor(cap, extras);
      if (extra > 0 && limitSource !== 'override' && typeof limit === 'number') {
        limit += extra;
      }
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
export function buildPlanFeatures(draft = {}, { vertical = null } = {}) {
  const out = {};
  for (const cap of CAPABILITIES) {
    if (cap.status === 'soon' || cap.core) continue;
    // Capacidades de otra vertical: quedan apagadas en el plan.
    let v = isCapabilityInVertical(cap, vertical) ? readFromMap(draft, cap) || {} : { enabled: false };
    // En planes comerciales (con vertical) un complemento nunca va incluido:
    // queda apagado y solo se guarda su límite de uso.
    if (vertical && ADDON_BY_CAPABILITY[cap.key]?.kind === 'toggle') v = { ...v, enabled: false };
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
