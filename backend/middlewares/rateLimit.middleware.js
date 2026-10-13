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