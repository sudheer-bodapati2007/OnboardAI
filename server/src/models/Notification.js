// src/models/Notification.js
import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    // Recipient user
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'onboarding_assigned',
        'task_assigned',
        'task_completed',
        'onboarding_completed',
        'policy_ready',
        'policy_failed',
        'task_overdue',
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true, default: '' },
    // Optional links to related resources
    relatedEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    relatedTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingTask', default: null },
    relatedPolicyId: { type: mongoose.Schema.Types.ObjectId, ref: 'PolicyDocument', default: null },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);

