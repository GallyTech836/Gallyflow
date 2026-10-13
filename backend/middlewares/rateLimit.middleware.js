import rateLimit from 'express-rate-limit';

export const notificationsRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' },
});

export const pendingRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' },
});

// Reserva pública: máximo 10 reservas cada 10 minutos por IP.
export const publicBookingRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas reservas seguidas. Intenta de nuevo en unos minutos.' },
});

// PIN financiero: máximo 8 intentos cada 15 minutos por negocio.
export const financePinRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyGenerator: (req) => 'pin:' + req.negocioId,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de PIN. Espera 15 minutos.' },
});

// Login de profesionales: por IP y por nombre de usuario.
export const staffLoginIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos.' },
});

export const staffLoginUserRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyGenerator: (req) => 'staff:' + String(req.body?.username || '').trim().toLowerCase(),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos con este usuario. Espera 15 minutos.' },
});

// Acciones del admin sobre credenciales.
export const staffAdminRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' },
});