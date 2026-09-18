import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import notificationsRoutes from '../routes/notifications.routes.js';
import superadminRoutes from '../routes/superadmin.routes.js';
import { logger } from '../utils/logger.js';

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((o) => o.trim()).filter(Boolean);

// Un solo middleware de CORS que decide según la ruta: /api/superadmin
// queda abierto a propósito (el dominio de StackBlitz cambia seguido, y
// esa ruta ya se protege con Firebase Auth + verificación de correo
// dentro del propio endpoint, no depende de CORS para su seguridad real).
// El resto de rutas sigue con la lista blanca estricta de siempre.
app.use(cors((req, callback) => {
  if (req.path.startsWith('/api/superadmin')) {
    return callback(null, { origin: true });
  }
  const origin = req.header('Origin');
  if (!origin || allowedOrigins.includes(origin)) {
    return callback(null, { origin: true });
  }
  logger.warn('[cors] Origen rechazado:', origin);
  return callback(null, { origin: false });
}));

app.use(express.json());

app.use('/api/superadmin', superadminRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'gallyflow-backend' });
});

// Ruta raíz: identificación rápida del servicio al abrir la URL directo
// desde el navegador (ej. para confirmar que el deploy de Railway está activo).
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'GallyFlow API',
    version: '1.0.0',
  });
});

app.use('/api', notificationsRoutes);
app.use('/api/superadmin', superadminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});



app.use((err, req, res, next) => {
  logger.error('[app] Error no controlado:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Error interno.' });
});

export default app;