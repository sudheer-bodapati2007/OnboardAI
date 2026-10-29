// src/models/Employee.js
import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [200, 'Full name must be 200 characters or fewer'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    jobTitle: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      maxlength: [150, 'Job title must be 150 characters or fewer'],
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
      maxlength: [150, 'Department must be 150 characters or fewer'],
    },
    manager: {
      type: String,
      trim: true,
      default: null,
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'onboarding'],
      default: 'onboarding',
    },
  },
  { timestamps: true }
);

// Email unique per organization
employeeSchema.index({ email: 1, organizationId: 1 }, { unique: true });
// Compound search indexes
employeeSchema.index({ organizationId: 1, status: 1 });
employeeSchema.index({ organizationId: 1, department: 1 });

export const Employee = mongoose.model('Employee', employeeSchema);

