// src/models/PolicyDocument.js
import mongoose from 'mongoose';

const policyDocumentSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Original user-supplied filename (stored for display only — not used for storage)
    originalName: { type: String, required: true, trim: true },
    // Safe server-generated storage key/path (never from client)
    storageKey: { type: String, required: true },
    // Storage provider: 'local' | 'gcs' | 'mock'
    storageProvider: { type: String, default: 'local' },
    mimeType: { type: String, default: 'application/pdf' },
    sizeBytes: { type: Number, default: 0 },
    // Processing states: pending → processing → ready | failed
    status: {
      type: String,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
    },
    errorMessage: { type: String, default: null },
    pageCount: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

policyDocumentSchema.index({ organizationId: 1, status: 1 });

export const PolicyDocument = mongoose.model('PolicyDocument', policyDocumentSchema);

