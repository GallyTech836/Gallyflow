import { Router } from 'express';
import { identifyRequester } from '../middlewares/auth.middleware.js';
import { notificationsRateLimit } from '../middlewares/rateLimit.middleware.js';
import { handleRegisterDevice, handleSendNotification, handleSendDirectNotification } from '../controllers/notifications.controller.js';

const router = Router();
// Solo para estas rutas (antes se aplicaba a todo /api).
router.post('/devices/register', notificationsRateLimit, identifyRequester, handleRegisterDevice);
router.post('/notifications/send', notificationsRateLimit, identifyRequester, handleSendNotification);
router.post('/notifications/send-direct', notificationsRateLimit, identifyRequester, handleSendDirectNotification);

export default router;