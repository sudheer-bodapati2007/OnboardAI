// src/models/PolicyChunk.js
// Stores text chunks + embeddings for RAG retrieval.
// Embeddings are stored as arrays of floats (Gemini text-embedding-004 → 768 dims).
import mongoose from 'mongoose';

const policyChunkSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PolicyDocument',
      required: true,
      index: true,
    },
    text: { type: String, required: true },
    pageNumber: { type: Number, default: null },
    chunkIndex: { type: Number, default: 0 },
    // Embedding vector as array of floats (768 dims for text-embedding-004)
    embedding: { type: [Number], required: true },
  },
  { timestamps: true }
);

policyChunkSchema.index({ documentId: 1, chunkIndex: 1 });
policyChunkSchema.index({ organizationId: 1 });

export const PolicyChunk = mongoose.model('PolicyChunk', policyChunkSchema);

