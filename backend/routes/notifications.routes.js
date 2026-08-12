import { Router } from 'express';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { notificationsRateLimit } from '../middlewares/rateLimit.middleware.js';
import { handleRegisterDevice, handleSendNotification, handleSendDirectNotification } from '../controllers/notifications.controller.js';

const router = Router();
router.use(notificationsRateLimit);
router.use(identifyRequester);
router.post('/devices/register', handleRegisterDevice);
router.post('/notifications/send', handleSendNotification);
router.post('/notifications/send-direct', handleSendDirectNotification);

export default router;