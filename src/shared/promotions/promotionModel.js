// promotionModel.js — Promociones del negocio (funciones puras, sin Firebase).
//
// Se guardan en negocios/{id}/promociones/{promoId}:
//   {
//     type: 'descuento' | 'combo',
//     name,
//     serviceIds: [ids],                 // descuento: a qué servicios aplica
//                                        // combo: los servicios que lo forman (2 o más)
//     discountKind: 'percent' | 'amount',// solo descuento
//     discountValue: número,             // 20 (%) o 10 (Bs menos)
//     comboPrice: número,                // solo combo: precio final del combo
//     startDate: 'AAAA-MM-DD',
//     endDate: 'AAAA-MM-DD' | null,      // null = sin fecha de fin
//     weekdays: [0..6] | [],             // 0 = domingo; vacío = todos los días
//     branchIds: [ids] | [],             // vacío = todas las sucursales
//     commissionBase: 'final' | 'normal',// comisión sobre el precio con promo o el normal
//     active: boolean,                   // pausada = false
//     createdAt, updatedAt
//   }
//
// El descuento se aplica sobre el precio que corresponda en cada caso (el del
// profesional si tiene uno propio, o el base). El combo fija un precio final.
// Si dos promociones aplican, gana la que más le conviene al cliente (no se suman).

export const PROMO_TYPES = { DESCUENTO: 'descuento', COMBO: 'combo' };
export const DISCOUNT_KINDS = { PERCENT: 'percent', AMOUNT: 'amount' };
export const COMMISSION_BASES = { FINAL: 'final', NORMAL: 'normal' };

export const PROMO_STATUS = {
  ACTIVE: 'active',
  SCHEDULED: 'scheduled',
  PAUSED: 'paused',
  EXPIRED: 'expired',
};
export const PROMO_STATUS_LABELS = {
  active: 'Activa',
  scheduled: 'Programada',
  paused: 'Pausada',
  expired: 'Vencida',
};
// Orden en la lista: primero lo que está corriendo.
export const PROMO_STATUS_ORDER = ['active', 'scheduled', 'paused', 'expired'];

// Lunes primero, como se lee la semana en Bolivia. value = getDay() de JS.
export const WEEKDAYS = [
  { value: 1, short: 'Lu', label: 'Lunes' },
  { value: 2, short: 'Ma', label: 'Martes' },
  { value: 3, short: 'Mi', label: 'Miércoles' },
  { value: 4, short: 'Ju', label: 'Jueves' },
  { value: 5, short: 'Vi', label: 'Viernes' },
  { value: 6, short: 'Sá', label: 'Sábado' },
  { value: 0, short: 'Do', label: 'Domingo' },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const uniqStrings = (list) => [...new Set((Array.isArray(list) ? list : []).map((v) => String(v || '').trim()).filter(Boolean))];

/** Hoy 'AAAA-MM-DD' en hora de La Paz. */
export function todayLaPaz(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Formulario vacío para una promoción nueva. */
export function emptyPromotion(today = todayLaPaz()) {
  return {
    type: PROMO_TYPES.DESCUENTO,
    name: '',
    serviceIds: [],
    discountKind: DISCOUNT_KINDS.PERCENT,
    discountValue: '',
    comboPrice: '',
    startDate: today,
    endDate: '',
    weekdays: [],
    branchIds: [],
    commissionBase: COMMISSION_BASES.FINAL,
    active: true,
  };
}

/** Pasa un documento guardado al formato del formulario. */
export function promotionToForm(p) {
  const base = emptyPromotion(p?.startDate || todayLaPaz());
  if (!p) return base;
  return {
    ...base,
    type: p.type === PROMO_TYPES.COMBO ? PROMO_TYPES.COMBO : PROMO_TYPES.DESCUENTO,
    name: p.name || '',
    serviceIds: uniqStrings(p.serviceIds),
    discountKind: p.discountKind === DISCOUNT_KINDS.AMOUNT ? DISCOUNT_KINDS.AMOUNT : DISCOUNT_KINDS.PERCENT,
    discountValue: p.discountValue ?? '',
    comboPrice: p.comboPrice ?? '',
    startDate: p.startDate || base.startDate,
    endDate: p.endDate || '',
    weekdays: Array.isArray(p.weekdays) ? p.weekdays.map(Number).filter((d) => d >= 0 && d <= 6) : [],
    branchIds: uniqStrings(p.branchIds),
    commissionBase: p.commissionBase === COMMISSION_BASES.NORMAL ? COMMISSION_BASES.NORMAL : COMMISSION_BASES.FINAL,
    active: p.active !== false,
  };
}

/**
 * Valida el formulario. Devuelve { ok, errors: { campo: mensaje }, data }.
 * `data` es lo que se guarda (sin createdAt/updatedAt).
 * `services` sirve para revisar que el combo no salga más caro que lo normal.
 */
export function validatePromotion(form, { services = [] } = {}) {
  const errors = {};
  const type = form.type === PROMO_TYPES.COMBO ? PROMO_TYPES.COMBO : PROMO_TYPES.DESCUENTO;
  const name = String(form.name || '').trim().slice(0, 80);
  const known = new Set(services.map((s) => String(s.id)));
  const serviceIds = uniqStrings(form.serviceIds).filter((id) => known.size === 0 || known.has(id));

  if (!name) errors.name = 'Ponle un nombre.';

  const data = {
    type,
    name,
    serviceIds,
    startDate: String(form.startDate || ''),
    endDate: form.endDate ? String(form.endDate) : null,
    weekdays: [...new Set((form.weekdays || []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
    branchIds: uniqStrings(form.branchIds),
    commissionBase: form.commissionBase === COMMISSION_BASES.NORMAL ? COMMISSION_BASES.NORMAL : COMMISSION_BASES.FINAL,
    active: form.active !== false,
  };

  if (type === PROMO_TYPES.DESCUENTO) {
    if (serviceIds.length === 0) errors.serviceIds = 'Elige al menos un servicio.';
    const kind = form.discountKind === DISCOUNT_KINDS.AMOUNT ? DISCOUNT_KINDS.AMOUNT : DISCOUNT_KINDS.PERCENT;
    const value = Number(form.discountValue);
    if (!Number.isFinite(value) || value <= 0) errors.discountValue = 'Pon el descuento.';
    else if (kind === DISCOUNT_KINDS.PERCENT && value >= 100) errors.discountValue = 'El porcentaje tiene que ser menor a 100.';
    data.discountKind = kind;
    data.discountValue = round2(value);
    data.comboPrice = null;
  } else {
    if (serviceIds.length < 2) errors.serviceIds = 'Un combo lleva al menos dos servicios.';
    const price = Number(form.comboPrice);
    if (!Number.isFinite(price) || price <= 0) errors.comboPrice = 'Pon el precio del combo.';
    else {
      const normal = comboNormalPrice(serviceIds, services);
      if (normal > 0 && price >= normal) errors.comboPrice = `Tiene que ser menor que el precio normal (Bs ${normal}).`;
    }
    data.comboPrice = round2(price);
    data.discountKind = null;
    data.discountValue = null;
  }

  if (!ISO_DATE.test(data.startDate)) errors.startDate = 'Elige desde cuándo.';
  if (data.endDate && !ISO_DATE.test(data.endDate)) errors.endDate = 'Fecha no válida.';
  else if (data.endDate && ISO_DATE.test(data.startDate) && data.endDate < data.startDate) errors.endDate = 'Tiene que ser después del inicio.';

  return { ok: Object.keys(errors).length === 0, errors, data };
}

/** Suma de precios base de los servicios del combo (para comparar). */
export function comboNormalPrice(serviceIds, services = []) {
  const byId = new Map(services.map((s) => [String(s.id), s]));
  return round2(uniqStrings(serviceIds).reduce((sum, id) => sum + (Number(byId.get(id)?.price) || 0), 0));
}

/** Estado según fechas y pausa, para la fecha `today` ('AAAA-MM-DD'). */
export function promotionStatus(p, today = todayLaPaz()) {
  if (p?.endDate && p.endDate < today) return PROMO_STATUS.EXPIRED;
  if (p?.active === false) return PROMO_STATUS.PAUSED;
  if (p?.startDate && p.startDate > today) return PROMO_STATUS.SCHEDULED;
  return PROMO_STATUS.ACTIVE;
}

/** Ordena para la lista: estado y luego fecha de inicio más reciente. */
export function sortPromotions(list, today = todayLaPaz()) {
  const rank = (p) => PROMO_STATUS_ORDER.indexOf(promotionStatus(p, today));
  return [...list].sort((a, b) => rank(a) - rank(b) || String(b.startDate || '').localeCompare(String(a.startDate || '')));
}

const fmtDay = (iso) => {
  const m = ISO_DATE.exec(String(iso || '')) ? String(iso).split('-') : null;
  if (!m) return '';
  return new Date(Number(m[0]), Number(m[1]) - 1, Number(m[2]))
    .toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })
    .replace('.', '');
};

/** "Del 1 nov al 15 nov" / "Desde el 1 nov". */
export function describeDates(p) {
  if (p?.endDate) return `Del ${fmtDay(p.startDate)} al ${fmtDay(p.endDate)}`;
  return `Desde el ${fmtDay(p?.startDate)}`;
}

/** "Lu, Mi, Vi" o "Todos los días". */
export function describeWeekdays(weekdays) {
  const set = new Set((weekdays || []).map(Number));
  if (set.size === 0 || set.size === 7) return 'Todos los días';
  return WEEKDAYS.filter((d) => set.has(d.value)).map((d) => d.short).join(', ');
}

/** "20% en Corte, Barba" / "Bs 10 menos en Corte" / "Corte + Barba a Bs 70". */
export function describePromotion(p, services = []) {
  const byId = new Map(services.map((s) => [String(s.id), s]));
  const names = uniqStrings(p?.serviceIds).map((id) => byId.get(id)?.name).filter(Boolean);
  if (p?.type === PROMO_TYPES.COMBO) {
    return `${names.join(' + ') || 'Combo'} a Bs ${round2(p.comboPrice)}`;
  }
  const what = names.join(', ') || 'servicios';
  return p?.discountKind === DISCOUNT_KINDS.AMOUNT
    ? `Bs ${round2(p.discountValue)} menos en ${what}`
    : `${round2(p.discountValue)}% en ${what}`;
}

/** "Todas las sucursales" o los nombres. */
export function describeBranches(branchIds, branches = []) {
  const ids = uniqStrings(branchIds);
  if (ids.length === 0 || branches.length <= 1) return 'Todas las sucursales';
  const names = branches.filter((b) => ids.includes(String(b.id))).map((b) => b.name);
  return names.length ? names.join(', ') : 'Todas las sucursales';
}

// ───────────── Para mostrar al cliente (link público y WhatsApp) ─────────────

/** Promos que el cliente puede usar hoy o más adelante (no pausadas ni vencidas). */
export function visiblePromotions(promotions = [], today = todayLaPaz(), branchId = null) {
  return (promotions || []).filter((p) => {
    const st = promotionStatus(p, today);
    if (st !== PROMO_STATUS.ACTIVE && st !== PROMO_STATUS.SCHEDULED) return false;
    const ids = uniqStrings(p.branchIds);
    return ids.length === 0 || !branchId || ids.includes(String(branchId));
  });
}

/** "hoy" / "mar y jue" / "desde el 1 nov": cuándo vale, en pocas palabras. */
export function whenText(p, today = todayLaPaz()) {
  if (p?.startDate && p.startDate > today) return `desde el ${fmtDay(p.startDate)}`;
  const days = (p?.weekdays || []).map(Number);
  if (days.length > 0 && days.length < 7) {
    const names = WEEKDAYS.filter((d) => days.includes(d.value)).map((d) => d.short.toLowerCase());
    return names.length === 1 ? `los ${WEEKDAYS.find((d) => d.value === days[0]).label.toLowerCase()}` : names.join(', ');
  }
  return p?.endDate ? `hasta el ${fmtDay(p.endDate)}` : '';
}

/** Etiqueta corta de descuento para un servicio: "−20%" / "Bs 10 menos", o null. */
export function discountBadgeFor(serviceId, promotions = []) {
  const p = (promotions || []).find((x) => x.type !== PROMO_TYPES.COMBO && uniqStrings(x.serviceIds).includes(String(serviceId)));
  if (!p) return null;
  const label = p.discountKind === DISCOUNT_KINDS.AMOUNT ? `Bs ${round2(p.discountValue)} menos` : `−${round2(p.discountValue)}%`;
  return { promo: p, label };
}

/** Combos cuyos servicios están todos en `services` (los que se pueden reservar). */
export function combosAvailable(services = [], promotions = []) {
  const ids = new Set((services || []).map((s) => String(s.id)));
  return (promotions || []).filter((p) => p.type === PROMO_TYPES.COMBO
    && uniqStrings(p.serviceIds).length > 1
    && uniqStrings(p.serviceIds).every((id) => ids.has(id)));
}

/** Servicios destacados primero (sin cambiar el orden entre ellos). */
export function featuredFirst(services = []) {
  return [...(services || [])].sort((a, b) => (b?.featured === true) - (a?.featured === true));
}
