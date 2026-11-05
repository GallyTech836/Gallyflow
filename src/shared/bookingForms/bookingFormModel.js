// bookingFormModel.js
//
// Formularios de reserva por tipo de negocio (datos extra que el cliente
// completa al reservar, p. ej. los de su mascota en una peluquería canina).
//
// ⚠️ Este archivo existe IDÉNTICO en tres lugares (sin dependencias, JS puro),
// igual que businessProfileModel.js:
//   - Nexus front:   src/shared/bookingForms/bookingFormModel.js
//   - Nexus backend: backend/services/bookingForms/bookingFormModel.js
//   - Super Admin:   src/shared/bookingFormModel.js
// Si cambias algo, edítalo en uno y copia el archivo a los otros dos.
//
// Modelo:
//   Tipo de negocio -> plantilla: BUSINESS_FORM_TEMPLATE[businessType].
//   Sin plantilla = el negocio no tiene formulario (todo sigue como antes).
//
//   Configuración por negocio (la edita Super Admin):
//     negocios/{id}.bookingFormConfig = {
//       fields: [{ key, label, enabled, required, options? }]  // en orden
//     }
//   Si falta, se usa la plantilla tal cual. Campos de la plantilla que no
//   estén en la config se agregan al final (desactivados) para que una
//   plantilla nueva no rompa configuraciones viejas.
//
//   Respuestas guardadas en la cita (solo si el negocio tiene formulario):
//     citas/{id}.intake = {
//       type: 'mascota',
//       values: { petName, breed, size, age: { value, unit }, lastService, photo },
//       labels: { [key]: etiqueta usada al reservar },
//     }
//   Las citas viejas y las de otros tipos de negocio no tienen `intake`.

export const INTAKE_FIELD_TYPES = ['image', 'text', 'select', 'age', 'date'];
export const LABEL_MAX_LENGTH = 40;
export const TEXT_MAX_LENGTH = 60;
export const OPTION_MAX_LENGTH = 24;
export const MAX_OPTIONS = 10;
export const AGE_UNITS = ['años', 'meses'];

// `ask`: pregunta del asistente de WhatsApp ({petName} = nombre ya dado).
export const FORM_TEMPLATES = {
  mascota: {
    title: 'Datos de tu mascota',
    adminTitle: 'Mascota',
    fields: [
      { key: 'petName', type: 'text', label: 'Nombre de la mascota', enabled: true, required: true,
        ask: '¿Cómo se llama tu mascota?' },
      { key: 'breed', type: 'text', label: 'Raza', enabled: true, required: true,
        ask: '¿Qué raza es {petName}?' },
      { key: 'size', type: 'select', label: 'Tamaño', enabled: true, required: true,
        options: ['Pequeño', 'Mediano', 'Grande'],
        ask: '¿Qué tamaño tiene {petName}?' },
      { key: 'age', type: 'age', label: 'Edad', enabled: true, required: false,
        ask: '¿Qué edad tiene {petName}? (ej: 3 años u 8 meses)' },
      { key: 'lastService', type: 'date', label: 'Último baño o servicio', enabled: true, required: false,
        ask: '¿Cuándo fue el último baño o servicio de {petName}? (ej: 15/10/2026)' },
      { key: 'photo', type: 'image', label: 'Foto de la mascota', enabled: true, required: false,
        ask: 'Envíame una foto de {petName} 📷' },
    ],
  },
};

// Qué plantilla usa cada tipo de negocio (claves de businessProfileModel).
export const BUSINESS_FORM_TEMPLATE = {
  peluqueria_canina: 'mascota',
};

/** Clave de plantilla del tipo de negocio, o null. */
export function getFormTemplateKey(businessType) {
  const k = BUSINESS_FORM_TEMPLATE[businessType];
  return k && FORM_TEMPLATES[k] ? k : null;
}

const limpiar = (v, max) => (typeof v === 'string' ? v.replace(/[<>{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

function cleanOptions(raw, fallback) {
  const out = [];
  for (const o of Array.isArray(raw) ? raw : []) {
    const t = limpiar(o, OPTION_MAX_LENGTH);
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= MAX_OPTIONS) break;
  }
  return out.length >= 2 ? out : [...fallback];
}

/**
 * Normaliza bookingFormConfig contra la plantilla: solo claves conocidas,
 * sin repetidos, en el orden guardado. -> { fields: [...] }
 */
export function cleanBookingFormConfig(templateKey, raw) {
  const tpl = FORM_TEMPLATES[templateKey];
  if (!tpl) return { fields: [] };
  const vistos = new Set();
  const fields = [];
  for (const f of Array.isArray(raw?.fields) ? raw.fields : []) {
    const base = tpl.fields.find((t) => t.key === f?.key);
    if (!base || vistos.has(base.key)) continue;
    vistos.add(base.key);
    const item = {
      key: base.key,
      label: limpiar(f.label, LABEL_MAX_LENGTH) || base.label,
      enabled: f.enabled !== false,
      required: f.enabled !== false && f.required === true,
    };
    if (base.type === 'select') item.options = cleanOptions(f.options, base.options);
    fields.push(item);
  }
  for (const base of tpl.fields) {
    if (vistos.has(base.key)) continue;
    // Sin config guardada: plantilla tal cual. Campo nuevo en una config vieja: apagado.
    const sinConfig = !Array.isArray(raw?.fields) || raw.fields.length === 0;
    const item = { key: base.key, label: base.label, enabled: sinConfig ? base.enabled : false, required: sinConfig ? base.required : false };
    if (base.type === 'select') item.options = [...base.options];
    fields.push(item);
  }
  return { fields };
}

/** Config de la plantilla tal cual (para "Restablecer"). */
export function defaultBookingFormConfig(templateKey) {
  return cleanBookingFormConfig(templateKey, null);
}

/**
 * Formulario efectivo del negocio, o null si su tipo no tiene formulario.
 * -> { type, title, adminTitle, fields: [{ key, type, label, enabled, required, options?, ask }] }
 */
export function resolveBookingForm(businessType, rawConfig) {
  const type = getFormTemplateKey(businessType);
  if (!type) return null;
  const tpl = FORM_TEMPLATES[type];
  const { fields } = cleanBookingFormConfig(type, rawConfig);
  return {
    type,
    title: tpl.title,
    adminTitle: tpl.adminTitle,
    fields: fields.map((f) => {
      const base = tpl.fields.find((t) => t.key === f.key);
      return { ...f, type: base.type, ask: base.ask };
    }),
  };
}

/** Campos que se piden (activados), en orden. */
export function activeFields(form) {
  return (form?.fields || []).filter((f) => f.enabled);
}

// ───────────────────────── Valores ─────────────────────────

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Edad desde { value, unit } o texto ("3 años", "8 meses", "2"). -> { value, unit } | null */
export function parseAge(raw) {
  if (raw && typeof raw === 'object') {
    const value = Number(raw.value);
    const unit = AGE_UNITS.includes(raw.unit) ? raw.unit : 'años';
    if (!Number.isFinite(value) || value <= 0) return null;
    const v = Math.round(value * 10) / 10;
    if ((unit === 'años' && v > 40) || (unit === 'meses' && v > 24)) return null;
    return { value: v, unit };
  }
  const t = String(raw ?? '').toLowerCase().replace(',', '.').trim();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(a(ñ|n)os?|a(ñ|n)o|mes(es)?|m\b|a\b)?/);
  if (!m) return null;
  const unit = m[2] && /^m/.test(m[2]) ? 'meses' : 'años';
  return parseAge({ value: Number(m[1]), unit });
}

/** Fecha desde "YYYY-MM-DD", "15/10/2026", "15/10" o "15-10-26". -> "YYYY-MM-DD" | null */
export function parseDate(raw, hoyIso) {
  const t = String(raw ?? '').trim();
  let y; let m; let d;
  if (FECHA_RE.test(t)) [y, m, d] = t.split('-').map(Number);
  else {
    const p = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
    if (!p) return null;
    d = Number(p[1]); m = Number(p[2]);
    const hoyY = Number(String(hoyIso || '').slice(0, 4)) || new Date().getFullYear();
    y = p[3] ? Number(p[3].length === 2 ? `20${p[3]}` : p[3]) : hoyY;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Sin año y quedó en el futuro: era del año pasado ("15/12" escrito en enero).
  if (hoyIso && iso > hoyIso) {
    if (!/^\d{1,2}[/.-]\d{1,2}$/.test(t)) return null;
    return parseDate(`${d}/${m}/${y - 1}`, hoyIso);
  }
  if (y < 2000) return null;
  return iso;
}

export function isCloudinaryUrl(v) {
  return typeof v === 'string' && /^https:\/\/res\.cloudinary\.com\/[^\s"'<>]+$/.test(v) && v.length <= 500;
}

/** Valor limpio de un campo, o null si no es válido / está vacío. */
export function cleanFieldValue(field, raw, { hoyIso } = {}) {
  if (raw === undefined || raw === null || raw === '') return null;
  switch (field.type) {
    case 'image': return isCloudinaryUrl(raw) ? raw : null;
    case 'text': return limpiar(raw, TEXT_MAX_LENGTH) || null;
    case 'select': {
      const t = limpiar(raw, OPTION_MAX_LENGTH).toLowerCase();
      return (field.options || []).find((o) => o.toLowerCase() === t) || null;
    }
    case 'age': return parseAge(raw);
    case 'date': return parseDate(raw, hoyIso);
    default: return null;
  }
}

/**
 * Valida las respuestas contra el formulario.
 * -> { ok, values, labels, missing: [label], invalid: [label] }
 * Solo guarda campos activados; un valor presente pero inválido es error
 * (aunque el campo sea opcional).
 */
export function validateIntake(form, rawValues = {}, opts = {}) {
  const values = {};
  const labels = {};
  const missing = [];
  const invalid = [];
  for (const f of activeFields(form)) {
    const raw = rawValues?.[f.key];
    const vacio = raw === undefined || raw === null || raw === '';
    const v = cleanFieldValue(f, raw, opts);
    if (v !== null) { values[f.key] = v; labels[f.key] = f.label; }
    else if (!vacio) invalid.push(f.label);
    else if (f.required) missing.push(f.label);
  }
  return { ok: missing.length === 0 && invalid.length === 0, values, labels, missing, invalid };
}

/** Objeto `intake` listo para guardar en la cita, o null si no hay nada. */
export function buildIntake(form, rawValues, opts) {
  if (!form) return null;
  const r = validateIntake(form, rawValues, opts);
  if (!r.ok) return null;
  return { type: form.type, values: r.values, labels: r.labels };
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Texto para mostrar un valor guardado. */
export function formatIntakeValue(key, value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object' && 'value' in value) {
    const n = value.value;
    const unit = value.unit === 'meses' ? (n === 1 ? 'mes' : 'meses') : (n === 1 ? 'año' : 'años');
    return `${n} ${unit}`;
  }
  if (typeof value === 'string' && FECHA_RE.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return `${d} ${MESES[m - 1]} ${y}`;
  }
  return String(value);
}

/** Pregunta del asistente para un campo ({petName} -> nombre dado o "tu mascota"). */
export function askFor(field, values = {}) {
  const nombre = typeof values.petName === 'string' && values.petName ? values.petName : 'tu mascota';
  return String(field.ask || `¿${field.label}?`).replace(/\{petName\}/g, nombre);
}
