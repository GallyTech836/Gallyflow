export function buildPersonalBookingUrl(negocioId, professionalId) {
    if (!negocioId || !professionalId) return '';
    const params = new URLSearchParams({ negocio: negocioId, pro: professionalId });
    return `${window.location.origin}/reservar?${params.toString()}`;
  }