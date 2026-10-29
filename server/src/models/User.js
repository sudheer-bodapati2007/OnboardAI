// src/models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    picture: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['hr_admin', 'employee'],
      default: 'employee',
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Compound index: email must be unique per org
userSchema.index({ email: 1, organizationId: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);

