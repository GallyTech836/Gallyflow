// src/shared/theme/theme.js
//
// Puente de solo-lectura entre tokens.css y JS.
// NO redefine colores: los lee del DOM en tiempo real.
// Úsalo donde Tailwind no llega (Recharts, canvas, inline SVG dinámico).

const cache = new Map();

/**
 * Lee un token --nx-* calculado en el DOM ahora mismo.
 * Ej: getNexusToken('primary') -> '#0F6FFF' (o el valor activo
 * de [data-theme="dark"] si algún día se activa).
 */
export function getNexusToken(name, { fresh = false } = {}) {
  if (!fresh && cache.has(name)) return cache.get(name);

  if (typeof window === 'undefined') return '';

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--nx-${name}`)
    .trim();

  cache.set(name, value);
  return value;
}

/** Limpia la caché — llamar tras cambiar data-theme si migras a Dark Mode. */
export function clearNexusThemeCache() {
  cache.clear();
}

/**
 * Set de colores listo para pasarle directo a Recharts:
 * <Line stroke={nexusChartColors.primary} />
 */
export const nexusChartColors = {
  get primary() { return getNexusToken('primary'); },
  get accent() { return getNexusToken('accent'); },
  get success() { return getNexusToken('success'); },
  get warning() { return getNexusToken('warning'); },
  get error() { return getNexusToken('error'); },
  get info() { return getNexusToken('info'); },
  get border() { return getNexusToken('border'); },
  get textSecondary() { return getNexusToken('text-secondary'); },
};