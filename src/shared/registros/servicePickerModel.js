// servicePickerModel.js — cálculos de la selección de servicios del registro.
// Reutiliza el precio de las citas (buildCitaService: precio del profesional >
// precio base). Es solo una estimación en pantalla: el backend recalcula.

import { buildCitaService } from '../servicePricing/professionalPricing';
import { professionalCanDo } from '../appointments/pendingModel';

export function servicesOf(services = [], professional = null) {
  if (!professional) return [];
  return (services || []).filter((s) => s?.id && professionalCanDo(professional, [s.id]));
}

export function lineFor(service, professional) {
  return buildCitaService(service, professional);
}

/** Total estimado (el servidor lo vuelve a calcular). */
export function estimateTotal(services, professional, selected) {
  return Object.keys(selected || {}).reduce((sum, id) => {
    const svc = services.find((s) => s.id === id);
    if (!svc) return sum;
    const line = lineFor(svc, professional);
    const n = Number(selected[id]);
    return sum + (line.priceVariable ? (Number.isFinite(n) && n > 0 ? n : 0) : line.price);
  }, 0);
}

/** services[] para el body del backend. */
export function toServiceInputs(services, professional, selected) {
  return Object.keys(selected || {}).map((id) => {
    const svc = services.find((s) => s.id === id);
    const line = svc ? lineFor(svc, professional) : null;
    return line?.priceVariable ? { serviceId: id, price: Number(selected[id]) } : { serviceId: id };
  });
}
