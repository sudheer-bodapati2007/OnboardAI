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
    // Embedding model used to generate this chunk's embedding.
    // Prevents mixing embeddings from different models (e.g. text-embedding-004
    // vs gemini-embedding-001) in retrieval.
    embeddingModel: { type: String, default: null },
    // Embedding vector as array of floats (768 dims for gemini-embedding-001)
    embedding: { type: [Number], required: true },
  },
  { timestamps: true }
);

policyChunkSchema.index({ documentId: 1, chunkIndex: 1 });
policyChunkSchema.index({ organizationId: 1 });

export const PolicyChunk = mongoose.model('PolicyChunk', policyChunkSchema);

