// src/models/Organization.js
import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      maxlength: [200, 'Organization name must be 200 characters or fewer'],
    },
  },
  { timestamps: true }
);

export const Organization = mongoose.model('Organization', organizationSchema);

