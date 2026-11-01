// src/modules/ai/ai.retrieval.js
// Cosine similarity retrieval from MongoDB-stored embeddings.
// No dedicated vector database — embeddings are floats in MongoDB documents.

import { PolicyChunk } from '../../models/PolicyChunk.js';
import { PolicyDocument } from '../../models/PolicyDocument.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env.js';

const SIMILARITY_THRESHOLD = 0.70; // minimum cosine similarity to include a chunk
const TOP_K = 5;                    // max chunks to retrieve
// Must be shorter than GEMINI_REQUEST_TIMEOUT_MS in ai.chat.js and the client
// axios timeout (15s) so a slow embedding call degrades instead of hanging.
const EMBED_REQUEST_TIMEOUT_MS = 8000;

/**
 * Race a promise against a timeout. Rejects with a timeout error if it takes
 * too long. The timeout promise is silenced so it can never surface as an
 * unhandled rejection when the wrapped promise wins.
 */
function withTimeout(promise, ms, message) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
  timeout.catch(() => {}); // avoid unhandled rejection if the wrapped promise wins
  return Promise.race([promise, timeout]);
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Embed a query string using Gemini.
 * Returns null if API key not configured.
 */
export async function embedQuery(query) {
  if (!env.geminiApiKey) return null;
  try {
    const genAI = new GoogleGenerativeAI(env.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: env.geminiEmbedModel });
    const result = await withTimeout(
      model.embedContent(query),
      EMBED_REQUEST_TIMEOUT_MS,
      'embedContent timed out'
    );
    return result.embedding.values;
  } catch (err) {
    console.error('[AI Retrieval] Embedding error:', err.message);
    return null;
  }
}

/**
 * Retrieve the most relevant chunks from org-scoped, ready documents.
 *
 * @param {ObjectId} organizationId
 * @param {number[]} queryEmbedding
 * @returns {{ text, documentName, pageNumber, score }[]}
 */
export async function retrieveRelevantChunks(organizationId, queryEmbedding) {
  if (!queryEmbedding?.length) return [];

  // Only retrieve from ready documents in this org
  const readyDocs = await PolicyDocument.find({
    organizationId,
    status: 'ready',
  }).select('_id originalName').lean();

  if (!readyDocs.length) return [];

  const readyDocIds = readyDocs.map((d) => d._id);
  const docNameMap = Object.fromEntries(readyDocs.map((d) => [d._id.toString(), d.originalName]));

  // Load chunks — in production with large datasets, use MongoDB Atlas Vector Search
  // For MVP: load and rank in-process with cosine similarity
  const chunks = await PolicyChunk.find({
    organizationId,
    documentId: { $in: readyDocIds },
    'embedding.0': { $exists: true }, // only chunks that have embeddings
  }).select('text pageNumber documentId embedding chunkIndex').lean();

  const scored = chunks
    .map((chunk) => ({
      text: chunk.text,
      documentId: chunk.documentId.toString(),
      documentName: docNameMap[chunk.documentId.toString()] ?? 'Unknown',
      pageNumber: chunk.pageNumber,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .filter((c) => c.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  return scored;
}

