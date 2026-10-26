// Rutas de la app y link público de reservas con URL limpia.
//
//   /{slug}             -> ClienteApp (igual que /reservar?negocio={slug})
//   /{slug}/p/{proId}   -> link personal (igual que &pro={proId})
//
// Los slugs reservados no pueden ser negocios: son rutas de la app o
// nombres que queremos guardar para el futuro.
// ⚠️ Copia en backend/utils/reservedSlugs.js (un test verifica que coincidan).

export const RESERVED_SLUGS = [
  // Rutas de la app (src/App.jsx)
  'admin', 'barber', 'reservar', 'p',
  // Carpetas servidas desde /public y del build de Vite
  'assets', 'brand',
  // Reservados para el futuro
  'login', 'logout', 'api', 'superadmin', 'staff', 'cliente', 'app', 'www',
  'dashboard', 'registro', 'signup', 'soporte', 'ayuda', 'terminos',
  'privacidad', 'health', 'status', 'manifest', 'null', 'undefined',
];

const RESERVED = new Set(RESERVED_SLUGS);

export function isReservedSlug(slug) {
  return RESERVED.has(String(slug || '').toLowerCase());
}

/** true si `path` es exactamente /{segment} o empieza con /{segment}/ */
export function isAppRoute(path, segment) {
  const base = `/${segment}`;
  return path === base || path.startsWith(`${base}/`);
}

/**
 * /{slug} o /{slug}/p/{proId} -> { slug, proId }. Null si no es un link
 * público (raíz, slug reservado o formato distinto).
 */
export function parsePublicBookingPath(path) {
  const m = /^\/([a-z0-9]+)(?:\/p\/([^/]+))?\/?$/i.exec(path || '');
  if (!m) return null;
  const slug = m[1].toLowerCase();
  if (isReservedSlug(slug)) return null;
  let proId = null;
  if (m[2]) {
    try { proId = decodeURIComponent(m[2]); } catch { return null; }
  }
  return { slug, proId };
}

/** Link público del negocio. Si el slug está reservado, usa el formato viejo. */
export function buildPublicBookingUrl(negocioId) {
  if (!negocioId) return '';
  if (isReservedSlug(negocioId)) {
    return `${window.location.origin}/reservar?${new URLSearchParams({ negocio: negocioId })}`;
  }
  return `${window.location.origin}/${encodeURIComponent(negocioId)}`;
}
