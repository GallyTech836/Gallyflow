// Copia intencional de src/shared/servicePricing/professionalPricing.js
// (Railway no garantiza ver src/). Si cambias una, cambia la otra:
// backend/tests/pricing.test.js verifica que ambas den el mismo resultado.

// professionalPricing.js
//
// Fuente única de verdad del PRECIO de un servicio según el profesional.
// Funciones puras (sin React ni Firebase). Copia intencional en
// backend/services/pricing/professionalPricing.js (mismo patrón que
// availability.js / pendingModel.js): si cambias una, cambia la otra.
// Hay una prueba que verifica que ambas copias den el mismo resultado.
//
// Modelo:
//   - Servicio (negocios/{id}/servicios): `price` = precio BASE (si
//     `priceVariable` es true, es el mínimo "Desde Bs XX").
//   - Profesional (negocios/{id}/profesionales): cada entrada de `services[]`
//     ({ serviceId, commissionEnabled, type, value }) puede tener
//     `customPrice` (número). Vacío / null / ausente = usa el precio base.
//   - Cita (negocios/{id}/citas): cada `services[i]` guarda el precio
//     APLICADO como valor histórico:
//       price          precio que cuenta (comisiones, finanzas, analítica).
//                      En precio variable, al finalizar es el precio cobrado.
//       listPrice      precio de lista aplicado al reservar (en variable = mínimo).
//       basePrice      precio base del servicio en ese momento.
//       priceSource    'professional' | 'base' | 'promo' | 'pending'
//       priceVariable  true si el servicio era "Desde".
//       priceRange     { min, max } solo mientras la cita es Pendiente.
//     y a nivel cita `priceProvisional: true` mientras sea Pendiente (el precio
//     final depende de quién la atienda; al asignar se recalcula).
//   Citas viejas sin estos campos siguen funcionando: `price` es lo único
//   obligatorio y nunca cambió de significado.

export const PRICE_SOURCE = {
    PROFESSIONAL: 'professional',
    BASE: 'base',
    PROMO: 'promo',
    PENDING: 'pending',
  };
  
  const PENDING_ID = 'pending';
  const DEFAULT_DURATION = 30;
  
  const toMoney = (n) => Math.round(Number(n) * 100) / 100;
  
  /** Valor de precio válido (>= 0) o null si está vacío / inválido. */
  export function normalizeCustomPrice(raw) {
    if (raw === null || raw === undefined || typeof raw === 'boolean') return null;
    if (typeof raw === 'string' && raw.trim() === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return toMoney(n);
  }
  
  /** Asignación del servicio en el profesional (tolera arrays de strings legacy). */
  export function getServiceAssignment(professional, serviceId) {
    if (!professional || !Array.isArray(professional.services) || serviceId === null || serviceId === undefined) return null;
    const id = String(serviceId);
    for (const a of professional.services) {
      if (typeof a === 'string') {
        if (a === id) return { serviceId: a };
      } else if (a && String(a.serviceId) === id) {
        return a;
      }
    }
    return null;
  }
  
  /** Precio personalizado del profesional para ese servicio, o null. */
  export function getCustomPrice(professional, serviceId) {
    return normalizeCustomPrice(getServiceAssignment(professional, serviceId)?.customPrice);
  }
  
  export function getBasePrice(service) {
    return normalizeCustomPrice(service?.price) ?? 0;
  }
  
  export function isVariableService(service) {
    return service?.priceVariable === true;
  }
  
  // promoActive puede ser boolean o función (service) => boolean.
  function promoApplies(promoActive, service) {
    return typeof promoActive === 'function' ? !!promoActive(service) : !!promoActive;
  }
  
  /**
   * Precio de un servicio para un profesional.
   * Prioridad: precio del profesional > promo (si aplica) > precio base.
   * @returns {{ price:number, basePrice:number, source:string, priceVariable:boolean }}
   */
  export function resolveServicePrice(service, professional = null, { promoActive = false } = {}) {
    const basePrice = getBasePrice(service);
    const priceVariable = isVariableService(service);
    const custom = professional ? getCustomPrice(professional, service?.id) : null;
    if (custom !== null) return { price: custom, basePrice, source: PRICE_SOURCE.PROFESSIONAL, priceVariable };
    const promo = normalizeCustomPrice(service?.promoPrice);
    if (promo !== null && promo > 0 && promoApplies(promoActive, service)) {
      return { price: promo, basePrice, source: PRICE_SOURCE.PROMO, priceVariable };
    }
    return { price: basePrice, basePrice, source: PRICE_SOURCE.BASE, priceVariable };
  }
  
  function isRealProfessional(p) {
    return !!p && p.active !== false && p.id !== PENDING_ID && p.isPending !== true;
  }
  
  /**
   * Rango de precios de un servicio entre los profesionales indicados que lo
   * realizan. Sin ninguno, el rango es el precio base.
   */
  export function getServicePriceRange(service, professionals = [], opts = {}) {
    const pool = (professionals || []).filter((p) => isRealProfessional(p) && getServiceAssignment(p, service?.id));
    const priceVariable = isVariableService(service);
    if (pool.length === 0) {
      const r = resolveServicePrice(service, null, opts);
      return { min: r.price, max: r.price, priceVariable };
    }
    const prices = pool.map((p) => resolveServicePrice(service, p, opts).price);
    return { min: Math.min(...prices), max: Math.max(...prices), priceVariable };
  }
  
  /** ¿Algún profesional tiene un precio distinto del base para este servicio? */
  export function hasCustomPrices(service, professionals = []) {
    const base = getBasePrice(service);
    return (professionals || []).some((p) => {
      if (!isRealProfessional(p)) return false;
      const c = getCustomPrice(p, service?.id);
      return c !== null && c !== base;
    });
  }
  
  function serviceDuration(service, override) {
    const o = Number(override);
    if (Number.isFinite(o) && o > 0) return o;
    return Number(service?.durationMin) || Number(service?.duration) || DEFAULT_DURATION;
  }
  
  /** Línea de services[] de una cita CON profesional asignado. */
  export function buildCitaService(service, professional, { duration, promoActive = false } = {}) {
    const r = resolveServicePrice(service, professional, { promoActive });
    return {
      serviceId: String(service?.id ?? ''),
      serviceName: service?.name || '',
      price: r.price,
      duration: serviceDuration(service, duration),
      listPrice: r.price,
      basePrice: r.basePrice,
      priceSource: r.source,
      priceVariable: r.priceVariable,
    };
  }
  
  /** Línea de services[] de una cita Pendiente: precio = mínimo entre candidatos. */
  export function buildPendingCitaService(service, candidates = [], { duration, promoActive = false } = {}) {
    const range = getServicePriceRange(service, candidates, { promoActive });
    return {
      serviceId: String(service?.id ?? ''),
      serviceName: service?.name || '',
      price: range.min,
      duration: serviceDuration(service, duration),
      listPrice: range.min,
      basePrice: getBasePrice(service),
      priceSource: PRICE_SOURCE.PENDING,
      priceVariable: range.priceVariable,
      priceRange: { min: range.min, max: range.max },
    };
  }
  
  /** Totales de services[] (acepta citas legacy sin los campos nuevos). */
  export function summarizeCitaServices(services = []) {
    const list = Array.isArray(services) ? services : [];
    const sum = (fn) => toMoney(list.reduce((acc, s) => acc + (Number(fn(s)) || 0), 0));
    return {
      totalPrice: sum((s) => s?.price),
      totalDuration: list.reduce((acc, s) => acc + (Number(s?.duration) || DEFAULT_DURATION), 0),
      priceMin: sum((s) => s?.priceRange?.min ?? s?.price),
      priceMax: sum((s) => s?.priceRange?.max ?? s?.price),
      hasVariable: list.some((s) => s?.priceVariable === true),
      priceProvisional: list.some((s) => s?.priceSource === PRICE_SOURCE.PENDING),
    };
  }
  
  /**
   * Arma services[] de una cita nueva a partir de servicios del catálogo.
   * professional = null => Pendiente (rango entre `candidates`).
   * durations: { [serviceId]: minutos } para duraciones ajustadas.
   */
  export function buildCitaServices(catalogServices = [], { professional = null, candidates = [], durations = {}, promoActive = false } = {}) {
    const services = (catalogServices || []).map((s) => (professional
      ? buildCitaService(s, professional, { duration: durations?.[s?.id], promoActive })
      : buildPendingCitaService(s, candidates, { duration: durations?.[s?.id], promoActive })));
    return { services, ...summarizeCitaServices(services) };
  }
  
  /**
   * Recalcula los precios de services[] de una cita para OTRO profesional
   * (asignar una Pendiente, cambiar de profesional, reprogramar). Conserva el
   * nombre y la duración guardados. Si un servicio ya no existe en el catálogo
   * conserva su precio guardado. professional = null => vuelve a Pendiente.
   * NO usar sobre citas finalizadas/canceladas (el precio es histórico).
   */
  export function repriceCitaServices(citaServices = [], catalog = [], professional = null, { candidates = [], promoActive = false } = {}) {
    const services = (citaServices || []).map((cs) => {
      const svc = (catalog || []).find((s) => String(s?.id) === String(cs?.serviceId));
      if (!svc) {
        if (!professional) return { ...cs };
        const rest = { ...(cs || {}) };
        delete rest.priceRange;
        return { ...rest, ...(rest.priceSource === PRICE_SOURCE.PENDING ? { priceSource: PRICE_SOURCE.BASE } : {}) };
      }
      const built = professional
        ? buildCitaService(svc, professional, { duration: cs?.duration, promoActive })
        : buildPendingCitaService(svc, candidates, { duration: cs?.duration, promoActive });
      return {
        ...built,
        serviceName: cs?.serviceName || built.serviceName,
        duration: Number(cs?.duration) > 0 ? Number(cs.duration) : built.duration,
      };
    });
    const summary = summarizeCitaServices(services);
    return { services, ...summary, priceProvisional: !professional };
  }
  
  /**
   * Precio mínimo ("Desde") de una línea de cita con precio variable:
   * el guardado al reservar (listPrice); para citas viejas, el del catálogo
   * resuelto para el profesional de la cita.
   */
  export function getMinimumPrice(citaService, catalogService = null, professional = null) {
    const lp = normalizeCustomPrice(citaService?.listPrice);
    if (lp !== null) return lp;
    if (catalogService) return resolveServicePrice(catalogService, professional).price;
    return normalizeCustomPrice(citaService?.price) ?? 0;
  }
  
  /**
   * Reparte el precio final cobrado entre los servicios de la cita: los fijos
   * conservan su precio, los variables vuelven a su mínimo y el primero
   * variable absorbe la diferencia. finalTotal vacío => todos al mínimo.
   */
  export function distributeFinalPrice(services = [], finalTotal, isVariable, minOf) {
    const next = (services || []).map((cs) => ({ ...cs, price: isVariable(cs) ? minOf(cs) : cs.price }));
    const vIdx = next.findIndex(isVariable);
    if (vIdx < 0) return next;
    const final = Number(finalTotal);
    if (finalTotal !== '' && finalTotal !== null && finalTotal !== undefined && final > 0) {
      const others = next.reduce((sum, cs, i) => (i === vIdx ? sum : sum + Number(cs.price || 0)), 0);
      next[vIdx].price = toMoney(Math.max(0, final - others));
    }
    return next;
  }
  
  function fmt(n) {
    const v = toMoney(n);
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  
  /** "Bs 100" | "Bs 100 – 150" | "Desde Bs 100" (estilo WhatsApp / textos). */
  export function formatPriceRange(min, max = min, { variable = false } = {}) {
    if (variable) return `Desde Bs ${fmt(min)}`;
    if (toMoney(min) === toMoney(max)) return `Bs ${fmt(min)}`;
    return `Bs ${fmt(min)} – ${fmt(max)}`;
  }
  