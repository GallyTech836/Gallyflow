// authRestore.js — espera a que Firebase restaure el usuario guardado.
//
// Si Firebase no responde en AUTH_RESTORE_TIMEOUT_MS, avisa 'unreachable'
// (pantalla "No se pudo conectar" con Reintentar) en vez de mandar al login:
// el usuario puede seguir con su sesión guardada cuando haya conexión. Si
// Firebase responde después, se sigue normal.
//
// Sin dependencias de Firebase ni React (se prueba en tests/authRestore.test.js).

export const AUTH_RESTORE_TIMEOUT_MS = 15000;

/**
 * subscribe(onUser, onError) -> unsubscribe   (ej. onAuthStateChanged)
 * onChange({ status: 'ready', user } | { status: 'unreachable' })
 * Devuelve la función para dejar de escuchar.
 */
export function watchAuthRestore({
  subscribe,
  onChange,
  timeoutMs = AUTH_RESTORE_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let answered = false;
  const timer = setTimer(() => {
    if (!answered) onChange({ status: 'unreachable' });
  }, timeoutMs);
  const unsubscribe = subscribe(
    (user) => {
      answered = true;
      clearTimer(timer);
      onChange({ status: 'ready', user: user || null });
    },
    // Error de Firebase al restaurar: tampoco es "sin sesión".
    () => {
      if (answered) return;
      clearTimer(timer);
      onChange({ status: 'unreachable' });
    },
  );
  return () => {
    clearTimer(timer);
    unsubscribe();
  };
}
