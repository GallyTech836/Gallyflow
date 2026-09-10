import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import notificationsRoutes from '../routes/notifications.routes.js';
import superadminRoutes from '../routes/superadmin.routes.js';
import { logger } from '../utils/logger.js';

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((o) => o.trim()).filter(Boolean);

// La ruta /api/superadmin queda abierta de CORS a propósito: el dominio de
// StackBlitz del panel Super Admin cambia seguido, y esta ruta ya se protege
// con Firebase Auth + verificación de correo dentro del propio endpoint
// (requireSuperAdmin), no dependía de CORS para su seguridad real.
app.use('/api/superadmin', cors());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    logger.warn('[cors] Origen rechazado:', origin);
    return callback(new Error('No permitido por CORS'));
  },
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