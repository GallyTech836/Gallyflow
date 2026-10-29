// sessionRules.js — cuándo se cierra la sesión (funciones puras, con tests).
//
// Regla: la sesión SOLO se cierra cuando el servidor dice explícitamente que
// fue cerrada, venció o no es de este usuario. Un error de red, un 5xx, un
// 429 o un 401 sin código (ej. token que no se pudo renovar) NO la cierran:
// se reintenta en la próxima revisión.

// Códigos con los que el backend (requireSession) dice que la sesión terminó.
export const SESSION_END_CODES = ['SESSION_REVOKED', 'SESSION_EXPIRED', 'SESSION_INVALID'];

/** ¿La respuesta { status, data } dice que la sesión terminó? */
export function isSessionEnded(result) {
  return result?.status === 401 && SESSION_END_CODES.includes(result?.data?.code);
}

/**
 * Revisión periódica (useSessionGuard). `result` es null si no hubo respuesta
 * (sin conexión o sin token).
 *   'end'  -> cerrar la sesión (onInvalid)
 *   'keep' -> seguir y reintentar después
 */
export function guardDecision(result) {
  return isSessionEnded(result) ? 'end' : 'keep';
}

/**
 * Al abrir Admin con una sesión guardada (useAdminSession). `result` es la
 * respuesta de /auth/session/check o null si no hubo respuesta.
 *   'ready' -> la sesión sigue activa
 *   'end'   -> cerrada desde otro dispositivo o vencida: salir con mensaje
 *   'renew' -> el servidor no la reconoce (no es de este usuario o falta):
 *              descartarla y abrir una nueva
 *   'keep'  -> no se pudo confirmar (red, 5xx, 429, 401 sin código):
 *              entrar igual con la sesión guardada; el guard reintenta
 */
export function restoreDecision(result) {
  if (result?.ok) return 'ready';
  const code = result?.status === 401 ? result?.data?.code : null;
  if (code === 'SESSION_REVOKED' || code === 'SESSION_EXPIRED') return 'end';
  if (code === 'SESSION_INVALID' || code === 'SESSION_MISSING') return 'renew';
  return 'keep';
}

/**
 * Respuesta de /auth/session/start (abrir sesión nueva).
 *   'ready'   -> sesión abierta
 *   'limit'   -> ya hay 2 sesiones: elegir cuál cerrar
 *   'signout' -> el servidor rechazó la cuenta (token inválido o no es admin)
 *   'retry'   -> no hubo respuesta o error del servidor: entrar sin bloquear;
 *                la sesión se abre en el próximo intento
 */
export function startDecision(result) {
  if (result?.ok) return 'ready';
  if (result?.status === 409) return 'limit';
  if (result?.status === 401 || result?.status === 403) return 'signout';
  return 'retry';
}
