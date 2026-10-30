// URL pública del frontend (sin "/" al final). Se usa para armar links e
// íconos que el backend manda fuera (ej. notificaciones push).
// Sin la variable PUBLIC_APP_URL se usa el dominio de siempre.

const DEFAULT_PUBLIC_APP_URL = 'https://gallyflow.vercel.app';

export const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL)
  .trim()
  .replace(/\/+$/, '');
