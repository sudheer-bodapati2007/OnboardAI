// src/models/OnboardingTask.js
import mongoose from 'mongoose';

const onboardingTaskSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OnboardingTemplate',
      default: null,
    },
    // Snapshot of task data at assignment time (immune to template edits)
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: 'General' },
    dueDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
    completedAt: { type: Date, default: null },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

onboardingTaskSchema.index({ employeeId: 1, status: 1 });
onboardingTaskSchema.index({ organizationId: 1, status: 1 });
onboardingTaskSchema.index({ dueDate: 1 });

export const OnboardingTask = mongoose.model('OnboardingTask', onboardingTaskSchema);

