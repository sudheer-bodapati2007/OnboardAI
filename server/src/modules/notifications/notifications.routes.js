// src/modules/notifications/notifications.routes.js
import { Router } from 'express';
import * as NotificationsController from './notifications.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET  /api/v1/notifications
router.get('/', NotificationsController.listNotifications);

// PATCH /api/v1/notifications/read-all
router.patch('/read-all', NotificationsController.markAllRead);

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', NotificationsController.markRead);

export default router;

