// Slugs que no pueden usarse como negocio: son rutas de la app (el link
// público es /{slug}) o nombres guardados para el futuro.
// ⚠️ Copia de src/shared/booking/publicRoutes.js (RESERVED_SLUGS) del
// frontend. tests/reservedSlugs.test.js verifica que coincidan.

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
