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

// === ÚLTIMO LINK DE RESERVA ABIERTO ===
// La app instalada (PWA / acceso directo) abre el start_url del manifest
// (/reservar), sin negocio. Guardamos el último negocio (y profesional) que
// se abrió en este dispositivo para poder retomarlo en ese caso.
const LAST_BOOKING_KEY = 'nexus:lastBooking';

export function rememberLastBooking(slug, proId) {
  if (!slug) return;
  try {
    localStorage.setItem(LAST_BOOKING_KEY, JSON.stringify({ slug, proId: proId || null }));
  } catch { /* storage no disponible: no pasa nada */ }
}

export function getLastBooking() {
  try {
    const data = JSON.parse(localStorage.getItem(LAST_BOOKING_KEY) || 'null');
    return data?.slug ? data : null;
  } catch {
    return null;
  }
}

/**
 * Si se abrió /reservar sin ?negocio= (app instalada), completa la URL con el
 * último negocio abierto en este dispositivo. Devuelve true si la cambió.
 */
export function restoreLastBookingInUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('negocio')) return false;
  const last = getLastBooking();
  if (!last) return false;
  params.set('negocio', last.slug);
  if (last.proId && !params.get('pro')) params.set('pro', last.proId);
  window.history.replaceState(null, '', `${window.location.pathname}?${params}${window.location.hash}`);
  return true;
}
