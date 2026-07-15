import { Router } from 'express';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { notificationsRateLimit } from '../middlewares/rateLimit.middleware.js';
import { handleRegisterDevice, handleSendNotification } from '../controllers/notifications.controller.js';

const router = Router();
router.use(notificationsRateLimit);
router.use(identifyRequester);
router.post('/devices/register', handleRegisterDevice);
router.post('/notifications/send', handleSendNotification);

export default router;