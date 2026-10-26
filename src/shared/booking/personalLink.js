import { isReservedSlug } from './publicRoutes';

// Link personal del profesional: /{slug}/p/{proId}.
// Si el slug está reservado, usa el formato viejo (?negocio=&pro=).
export function buildPersonalBookingUrl(negocioId, professionalId) {
  if (!negocioId || !professionalId) return '';
  if (isReservedSlug(negocioId)) {
    const params = new URLSearchParams({ negocio: negocioId, pro: professionalId });
    return `${window.location.origin}/reservar?${params.toString()}`;
  }
  return `${window.location.origin}/${encodeURIComponent(negocioId)}/p/${encodeURIComponent(professionalId)}`;
}
