import rateLimit from 'express-rate-limit';

export const notificationsRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' },
});