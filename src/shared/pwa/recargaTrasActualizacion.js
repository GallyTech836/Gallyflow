// Después de publicar una versión nueva en Vercel, los archivos de la versión
// anterior dejan de existir. Si la app quedó abierta (o instalada como PWA en
// segundo plano) e intenta cargar una pantalla de la versión vieja, ese
// archivo ya no está y la app quedaba en blanco.
//
// Solución: ante ese error se recarga la página UNA vez para tomar la versión
// nueva. Si vuelve a fallar enseguida, no se recarga de nuevo (evita un bucle)
// y queda la pantalla de error con el botón «Recargar».

const CLAVE = 'nx-recarga-version';
const ESPERA_MS = 30 * 1000;

/** Errores de "archivo de la versión anterior que ya no existe". */
export function esErrorDeVersion(error) {
  const msg = String(error?.message || error || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk .* failed/i.test(msg);
}

/** Recarga una sola vez cada 30 s. Devuelve true si recargó. */
export function recargarUnaVez() {
  let ultima = 0;
  try {
    ultima = Number(sessionStorage.getItem(CLAVE)) || 0;
  } catch {
    // sessionStorage no disponible: igual se recarga una vez por carga de página.
  }
  if (Date.now() - ultima < ESPERA_MS) return false;
  try {
    sessionStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    // sin almacenamiento: se intenta igual
  }
  window.location.reload();
  return true;
}

/** Vite avisa con este evento cuando no puede cargar un archivo de la app. */
export function escucharErroresDeVersion() {
  window.addEventListener('vite:preloadError', (event) => {
    if (recargarUnaVez()) event.preventDefault();
  });
}
