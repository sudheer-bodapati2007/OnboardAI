// src/models/OnboardingTemplate.js
import mongoose from 'mongoose';

const templateTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: 'General' },
    dueDayOffset: { type: Number, default: 0, min: 0 }, // days after start date
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const onboardingTemplateSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: [200, 'Template name must be 200 characters or fewer'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    roleTarget: {
      type: String,
      trim: true,
      default: 'General',
    },
    tasks: [templateTaskSchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

onboardingTemplateSchema.index({ organizationId: 1, isActive: 1 });

export const OnboardingTemplate = mongoose.model('OnboardingTemplate', onboardingTemplateSchema);

