// registroModel.js
//
// Funciones puras (sin Firestore) del formulario público de registro
// (public/registro.html → POST /api/registro) y de la creación del negocio
// desde Super Admin → Solicitudes.
//
// El formulario usa los MISMOS campos que se cargan a mano:
//   negocio          → formulario «Nuevo negocio» de Super Admin
//   heroConfig       → Configuración → Negocio (nombre, eslogan, logo, portada)
//   businessSettings → Configuración → Negocio (horario, anticipación, pagos)
//   sucursales       → POST /api/negocio/sucursales (modal de AdminApp)
//   servicios        → agregarServicio de AdminApp (src/firebase/useServicios.js)
//   profesionales    → POST /api/negocio/profesionales (modal de AdminApp)
// y build* arma los documentos con exactamente esos campos.

import { isValidBusinessType } from '../businessProfiles/businessProfileModel.js';
import { normalizeCustomPrice } from '../pricing/professionalPricing.js';
import { DEFAULT_HERO_CONFIG } from '../negocios/createNegocio.js';

export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DURATIONS = [15, 30, 45, 60, 75, 90, 120];
export const LIMITS = { sucursales: 5, servicios: 150, profesionales: 30, paymentMethods: 12 };
export const DEFAULT_PAYMENT_METHODS = ['Efectivo', 'Tarjeta', 'Transferencia'];

// ⚠️ Copia de DEFAULT_STAFF_PERMISSIONS de src/shared/staffPermissions/staffPermissionsModel.js
// (AdminApp guarda normalizeStaffPermissions(undefined) al crear un profesional).
// tests/registro.test.js verifica que coincidan.
export const DEFAULT_STAFF_PERMISSIONS = {
  createAppointments: true,
  editAppointments: true,
  deleteAppointments: true,
  changeAppointmentClient: false,
  viewOthersAppointments: false,
  viewCommissions: true,
  viewFinancials: true,
  editMode: 'all',
  editFinish: true,
  editNotes: true,
  editTime: true,
  editServices: true,
  editDuration: true,
  overtimeAppointments: false,
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CLOUDINARY_RE = /^https:\/\/res\.cloudinary\.com\//;

const texto = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const digits = (v) => String(v || '').replace(/\D/g, '');
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const imagen = (v) => { const u = texto(v, 1000); return CLOUDINARY_RE.test(u) ? u : ''; };
const tempId = (v) => texto(String(v ?? ''), 40);

/**
 * Valida y limpia lo que manda el formulario. Nunca confía en el cliente:
 * recorta textos, descarta campos desconocidos y revisa relaciones.
 * @returns {{ data: object, errors: string[] }}
 */
export function sanitizeRegistro(raw) {
  const errors = [];
  const r = obj(raw);
  const n = obj(r.negocio);
  const h = obj(r.heroConfig);
  const bsRaw = obj(r.businessSettings);

  const negocio = {
    name: texto(n.name, 120),
    businessType: texto(n.businessType, 40),
    ownerName: texto(n.ownerName, 120),
    phone: digits(n.phone).slice(0, 15),
    country: 'Bolivia',
    city: texto(n.city, 80),
    ownerEmail: texto(n.ownerEmail, 160).toLowerCase(),
  };
  if (!negocio.name) errors.push('Falta el nombre del negocio.');
  if (!isValidBusinessType(negocio.businessType) || negocio.businessType === 'restaurante') errors.push('Tipo de negocio inválido.');
  if (!negocio.ownerName) errors.push('Falta el nombre del propietario.');
  if (negocio.phone.length < 7) errors.push('Teléfono inválido.');
  if (!negocio.city) errors.push('Falta la ciudad.');
  if (!EMAIL_RE.test(negocio.ownerEmail)) errors.push('Correo del administrador inválido.');

  const heroConfig = {
    businessName: negocio.name,
    slogan: texto(h.slogan, 160),
    logo: imagen(h.logo),
    cover: imagen(h.cover),
  };

  const rawSchedule = arr(bsRaw.schedule);
  const schedule = DAY_NAMES.map((day) => {
    const d = obj(rawSchedule.find((x) => obj(x).day === day));
    const status = d.status === 'Cerrado' ? 'Cerrado' : 'Disponible';
    const start = TIME_RE.test(d.start) ? d.start : '09:00';
    const end = TIME_RE.test(d.end) ? d.end : '19:00';
    if (status === 'Disponible' && toMin(start) >= toMin(end)) errors.push(`Horario del ${day}: el cierre debe ser después de la apertura.`);
    return { day, status, start, end };
  });
  if (!schedule.some((d) => d.status === 'Disponible')) errors.push('El negocio debe abrir al menos un día.');
  const minAdv = Number(bsRaw.minAdvanceMinutes);
  const paymentMethods = [...new Set(arr(bsRaw.paymentMethods).map((m) => texto(m, 30)).filter(Boolean))].slice(0, LIMITS.paymentMethods);
  const businessSettings = {
    schedule,
    minAdvanceMinutes: Number.isFinite(minAdv) && minAdv >= 0 ? Math.min(Math.round(minAdv), 60 * 24 * 30) : 0,
    paymentMethods: paymentMethods.length ? paymentMethods : [...DEFAULT_PAYMENT_METHODS],
  };

  const rawSuc = arr(r.sucursales);
  if (rawSuc.length > LIMITS.sucursales) errors.push(`Máximo ${LIMITS.sucursales} sucursales.`);
  const sucursales = rawSuc.slice(0, LIMITS.sucursales).map((x) => {
    const s = obj(x);
    return {
      tempId: tempId(s.tempId), name: texto(s.name, 120), image: imagen(s.image), phone: texto(s.phone, 40),
      schedule: texto(s.schedule, 300), mapsUrl: /^https:\/\//.test(texto(s.mapsUrl, 1000)) ? texto(s.mapsUrl, 1000) : '', address: texto(s.address, 300),
    };
  });
  if (!sucursales.length) errors.push('Agrega al menos una sucursal.');
  sucursales.forEach((s, i) => { if (!s.name || !s.address) errors.push(`Sucursal ${i + 1}: faltan el nombre o la dirección.`); });
  const sucNames = sucursales.map((s) => s.name.toLowerCase());
  if (new Set(sucNames).size !== sucNames.length) errors.push('Hay dos sucursales con el mismo nombre.');

  const rawSvc = arr(r.servicios);
  if (rawSvc.length > LIMITS.servicios) errors.push(`Máximo ${LIMITS.servicios} servicios.`);
  const servicios = rawSvc.slice(0, LIMITS.servicios).map((x) => {
    const s = obj(x);
    const price = Number(s.price);
    const duration = Number(s.duration);
    const days = arr(s.availableDays).filter((d) => DAY_NAMES.includes(d));
    return {
      tempId: tempId(s.tempId), name: texto(s.name, 120), image: imagen(s.image),
      price: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : NaN,
      priceVariable: s.priceVariable === true, featured: s.featured === true,
      duration: DURATIONS.includes(duration) ? duration : NaN,
      availableDays: DAY_NAMES.filter((d) => days.includes(d)),
    };
  });
  if (!servicios.length) errors.push('Agrega al menos un servicio.');
  servicios.forEach((s, i) => {
    const label = s.name || `Servicio ${i + 1}`;
    if (!s.name) errors.push(`Servicio ${i + 1}: falta el nombre.`);
    if (!Number.isFinite(s.price)) errors.push(`${label}: precio inválido.`);
    if (!Number.isFinite(s.duration)) errors.push(`${label}: duración inválida.`);
    if (!s.availableDays.length) errors.push(`${label}: marca al menos un día.`);
  });
  const svcIds = new Set(servicios.map((s) => s.tempId));
  if (svcIds.size !== servicios.length || svcIds.has('')) errors.push('Servicios con identificador repetido.');

  const rawPros = arr(r.profesionales);
  if (rawPros.length > LIMITS.profesionales) errors.push(`Máximo ${LIMITS.profesionales} profesionales.`);
  const branchNames = new Set(sucursales.map((s) => s.name));
  const profesionales = rawPros.slice(0, LIMITS.profesionales).map((x) => {
    const p = obj(x);
    const rawAv = arr(p.availability);
    const seen = new Set();
    const services = arr(p.services).map(obj).filter((a) => svcIds.has(tempId(a.serviceId)) && !seen.has(tempId(a.serviceId)) && seen.add(tempId(a.serviceId))).map((a) => {
      const value = Number(a.value);
      return {
        serviceId: tempId(a.serviceId),
        customPrice: normalizeCustomPrice(a.customPrice),
        commissionEnabled: a.commissionEnabled === true,
        type: a.type === 'Bs' ? 'Bs' : '%',
        value: Number.isFinite(value) && value >= 0 ? (a.type === 'Bs' ? value : Math.min(value, 100)) : 40,
      };
    });
    return {
      tempId: tempId(p.tempId), firstName: texto(p.firstName, 80), lastName: texto(p.lastName, 80), avatar: imagen(p.avatar),
      active: p.active !== false, branch: texto(p.branch, 120), services,
      availability: DAY_NAMES.map((day) => {
        const d = obj(rawAv.find((y) => obj(y).day === day));
        return {
          day, status: d.status === 'Descanso' ? 'Descanso' : 'Disponible',
          start: TIME_RE.test(d.start) ? d.start : '09:00', end: TIME_RE.test(d.end) ? d.end : '19:00',
        };
      }),
    };
  });
  if (!profesionales.some((p) => p.active)) errors.push('Agrega al menos un profesional activo.');
  profesionales.forEach((p, i) => {
    const label = `${p.firstName} ${p.lastName}`.trim() || `Profesional ${i + 1}`;
    if (!p.firstName || !p.lastName) errors.push(`Profesional ${i + 1}: faltan el nombre o el apellido.`);
    if (!branchNames.has(p.branch)) errors.push(`${label}: la sucursal no existe.`);
    if (p.active && !p.services.length) errors.push(`${label}: elige al menos un servicio.`);
    p.availability.forEach((d) => { if (d.status === 'Disponible' && toMin(d.start) >= toMin(d.end)) errors.push(`${label}, ${d.day}: el fin debe ser después del inicio.`); });
  });

  return { data: { negocio, heroConfig, businessSettings, sucursales, servicios, profesionales }, errors: [...new Set(errors)] };
}

/** heroConfig completo, igual que normalizeHeroConfig del front. */
export function buildHeroConfig(data) {
  const h = data.heroConfig || {};
  return {
    ...DEFAULT_HERO_CONFIG,
    businessName: data.negocio.name || DEFAULT_HERO_CONFIG.businessName,
    slogan: h.slogan || DEFAULT_HERO_CONFIG.slogan,
    logo: h.logo || '',
    cover: h.cover || '',
    showServiceImages: true,
  };
}

/** businessSettings igual que lo guarda Configuración → Negocio (normalizeBusinessSettings). */
export function buildBusinessSettings(data) {
  const b = data.businessSettings;
  return { schedule: b.schedule.map((d) => ({ ...d })), minAdvanceMinutes: b.minAdvanceMinutes, paymentMethods: [...b.paymentMethods], closedDays: [] };
}

/** Igual que POST /api/negocio/sucursales. */
export function buildSucursalDoc(s, nowIso) {
  return {
    name: s.name, phone: s.phone, address: s.address, schedule: s.schedule,
    lat: null, lng: null, mapsUrl: s.mapsUrl, image: s.image, active: true, createdAt: nowIso,
  };
}

/** Igual que agregarServicio (src/firebase/useServicios.js) con los datos del modal de AdminApp. */
export function buildServicioDoc(s, createdAt) {
  return {
    name: s.name, price: s.price, priceVariable: s.priceVariable, featured: s.featured, promoPrice: null,
    duration: s.duration, category: 'Tratamiento', availableDays: [...s.availableDays], image: s.image, createdAt,
  };
}

/**
 * Igual que POST /api/negocio/profesionales con los datos que guarda el modal
 * de AdminApp (handleSaveBarber): customPrice vacío se quita del servicio.
 * `serviceIdMap` traduce el tempId del formulario al ID real (s1, s2…).
 */
export function buildProfesionalDoc(p, { username, pin, serviceIdMap, nowIso }) {
  const services = p.services.map((a) => {
    const out = { serviceId: serviceIdMap[a.serviceId], commissionEnabled: a.commissionEnabled, type: a.type, value: a.value };
    return a.customPrice === null ? out : { ...out, customPrice: a.customPrice };
  }).filter((a) => a.serviceId);
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    name: `${p.firstName} ${p.lastName}`.trim(),
    username,
    branch: p.branch,
    pin,
    active: p.active,
    rating: 5.0,
    avatar: p.avatar,
    createdDate: nowIso,
    attendance: { in: null, out: null, status: 'inactive' },
    performance: { servicesCount: 0, totalGenerated: 0 },
    services,
    permissions: { ...DEFAULT_STAFF_PERMISSIONS },
    availability: p.availability.map((d) => ({ ...d })),
  };
}

/**
 * Usuario sugerido como en el modal de AdminApp (nombre.apellido, solo
 * letras y números). Antes de limpiar se quitan las tildes para que
 * «Sofía Méndez» quede «sofia.mendez» y no «sofa.mndez».
 */
export function baseUsername(firstName, lastName) {
  const clean = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const f = clean(firstName); const l = clean(lastName);
  return (f && l ? `${f}.${l}` : f || l || 'profesional').slice(0, 60);
}

/** PIN de asistencia de 4 dígitos que no repita uno ya usado en el negocio. */
export function pickPin(used, rnd = Math.random) {
  for (let i = 0; i < 200; i++) {
    const pin = String(1000 + Math.floor(rnd() * 9000));
    if (!used.has(pin)) { used.add(pin); return pin; }
  }
  return '';
}
