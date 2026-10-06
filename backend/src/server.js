import app from './app.js';
import { logger } from '../utils/logger.js';
import { startReminderScheduler } from '../services/reminders/reminderScheduler.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`GallyFlow backend escuchando en el puerto ${PORT}`);
  startReminderScheduler();
});