// src/modules/notifications/notifications.controller.js
import * as NotificationsService from './notifications.service.js';
import { success, paginated } from '../../utils/response.js';

export async function listNotifications(req, res, next) {
  try {
    const page = parseInt(req.query.page ?? '1', 10);
    const limit = Math.min(parseInt(req.query.limit ?? '30', 10), 100);
    const result = await NotificationsService.listNotifications(req.user._id, req.user.organizationId, { page, limit });
    return res.json({
      success: true,
      data: { notifications: result.notifications, unreadCount: result.unreadCount },
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const notification = await NotificationsService.markRead(req.user._id, req.params.id);
    return success(res, { notification });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req, res, next) {
  try {
    await NotificationsService.markAllRead(req.user._id);
    return success(res, { message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
}

