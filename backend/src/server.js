import app from './app.js';
import { logger } from '../utils/logger.js';
import { startReminderScheduler } from '../services/reminders/reminderScheduler.js';
import { maybeRunLegacyPasswordMigration } from '../services/staff/legacyPasswordMigration.js';

const PORT = process.env.PORT || 3000;

// Un error async sin manejar se registra en vez de tumbar el servidor.
process.on('unhandledRejection', (err) => {
  logger.error('[server] Promesa sin manejar:', err?.message || err);
});

app.listen(PORT, () => {
  logger.info(`GallyFlow backend escuchando en el puerto ${PORT}`);
  startReminderScheduler();
  // Solo si existe MIGRATE_LEGACY_PASSWORDS en Railway (dry / apply).
  maybeRunLegacyPasswordMigration();
});