// src/modules/ai/ai.retrieval.js
// Cosine similarity retrieval from MongoDB-stored embeddings.
// No dedicated vector database — embeddings are floats in MongoDB documents.

import { PolicyChunk } from '../../models/PolicyChunk.js';
import { PolicyDocument } from '../../models/PolicyDocument.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env.js';

const SIMILARITY_THRESHOLD = 0.50; // minimum cosine similarity to include a chunk
const TOP_K = 5;                   // max chunks to retrieve

// Timeout for embedding requests, independently configurable from chat timeout.
const EMBED_REQUEST_TIMEOUT_MS = env.geminiEmbedTimeoutMs;

// Maximum number of additional attempts after a transient failure.
const EMBED_MAX_RETRIES = env.geminiMaxRetries;

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
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute jittered exponential backoff delay in milliseconds.
 *
 * @param {number} attempt  Zero-based attempt index (0 = first retry)
 * @param {number} baseMs   Base delay in ms
 * @returns {number} Delay in ms, including jitter
 */
function backoffMs(attempt, baseMs = 1000) {
  // Exponential: base * 2^attempt, plus jitter in [0, base * 2^attempt]
  const exp = baseMs * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * (exp + 1));
  return exp + jitter;
}

/**
 * Determine whether a Gemini provider error is transient and worth retrying.
 *
 * Retryable:
 *   - HTTP 503 (service unavailable / high demand)
 *   - HTTP 429 (rate limited) — only when a Retry-After hint is present or the
 *     message clearly indicates a temporary quota spike
 *   - Temporary network failures (ETIMEDOUT, ECONNREFUSED, ENOTFOUND, socket hang up)
 *
 * Non-retryable (permanent):
 *   - Invalid model / model not found
 *   - Invalid API key / authentication errors
 *   - Malformed requests (400 Bad Request)
 *   - Other 4xx client errors
 */
function isTransientProviderError(err) {
  const msg = (err?.message ?? '').toLowerCase();
  const status = err?.status ?? err?.statusCode ?? null;

  // Never retry invalid model or credential errors.
  if (
    msg.includes('model not found') ||
    msg.includes('invalid model') ||
    msg.includes('model is not valid') ||
    msg.includes('api key') ||
    msg.includes('authentication') ||
    msg.includes('permission denied')
  ) {
    return false;
  }

  // Retry explicit 503 service unavailable.
  if (status === 503 || msg.includes('503') || msg.includes('service unavailable')) {
    return true;
  }

  // Retry 429 rate limiting (free tier spikes are usually temporary).
  if (status === 429 || msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
    return true;
  }

  // Retry temporary network failures.
  if (
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('socket hang up') ||
    msg.includes('network error')
  ) {
    return true;
  }

  return false;
}

/**
 * Extract a Retry-After delay in milliseconds from a Gemini error, if present.
 * Returns null when no retry-after information is available.
 */
function retryAfterMs(err) {
  const msg = err?.message ?? '';
  const match = msg.match(/retry.?after.?:\s*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10) * 1000;
  }
  return null;
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a, b) {
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
 * Embed a query string using Gemini with bounded retries for transient failures.
 * Returns null if API key not configured or if all retries are exhausted.
 *
 * Errors are logged server-side; no secrets or stack traces are exposed.
 */
export async function embedQuery(query) {
  if (!env.geminiApiKey) return null;

  const genAI = new GoogleGenerativeAI(env.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: env.geminiEmbedModel });

  let lastErr;
  for (let attempt = 0; attempt <= EMBED_MAX_RETRIES; attempt++) {
    try {
      const result = await withTimeout(
        model.embedContent(query),
        EMBED_REQUEST_TIMEOUT_MS,
        'embedContent timed out'
      );
      return result.embedding.values;
    } catch (err) {
      lastErr = err;
      const msg = err?.message ?? '';
      console.error(`[AI Retrieval] Embedding attempt ${attempt + 1} failed:`, msg);

      // Don't retry permanent errors.
      if (!isTransientProviderError(err)) {
        return null;
      }

      // Don't sleep after the last attempt.
      if (attempt >= EMBED_MAX_RETRIES) {
        break;
      }

      // Respect Retry-After when the provider tells us how long to wait.
      const ra = retryAfterMs(err);
      const delay = ra ?? backoffMs(attempt);
      await sleep(delay);
    }
  }

  console.error('[AI Retrieval] Embedding failed after retries:', lastErr?.message ?? '');
  return null;
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
  // Only include chunks whose embedding model matches the current query model,
  // preventing cross-model embedding mixing (e.g. text-embedding-004 vs gemini-embedding-001).
  const chunks = await PolicyChunk.find({
    organizationId,
    documentId: { $in: readyDocIds },
    embeddingModel: env.geminiEmbedModel,
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
