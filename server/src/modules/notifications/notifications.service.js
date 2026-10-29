// src/modules/notifications/notifications.service.js
import { Notification } from '../../models/Notification.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Create a notification for a specific user.
 * Idempotent — skips if an identical unread notification already exists
 * (same type + relatedEmployee/Task) created in the last 60 seconds.
 */
export async function createNotification({
  organizationId,
  userId,
  type,
  title,
  body = '',
  relatedEmployeeId = null,
  relatedTaskId = null,
  relatedPolicyId = null,
}) {
  // Duplicate guard: avoid repeat notifications within 60 s
  const recent = await Notification.findOne({
    userId,
    type,
    relatedEmployeeId,
    relatedTaskId,
    isRead: false,
    createdAt: { $gte: new Date(Date.now() - 60_000) },
  });
  if (recent) return recent;

  return Notification.create({
    organizationId,
    userId,
    type,
    title,
    body,
    relatedEmployeeId,
    relatedTaskId,
    relatedPolicyId,
  });
}

/**
 * List notifications for the authenticated user, newest first.
 */
export async function listNotifications(userId, { page = 1, limit = 30 } = {}) {
  const skip = (page - 1) * limit;
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ userId }),
    Notification.countDocuments({ userId, isRead: false }),
  ]);
  return { notifications, total, unreadCount, page, limit };
}

/**
 * Mark a single notification as read.
 * Enforces recipient ownership.
 */
export async function markRead(userId, notificationId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId }, // ownership enforced here
    { $set: { isRead: true } },
    { new: true }
  ).lean();
  if (!notification) throw new AppError('Notification not found', 404);
  return notification;
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllRead(userId) {
  await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
}

