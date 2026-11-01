// src/modules/policy/policy.processor.js
// PDF extraction, chunking, embedding generation, and storage.
// This runs as a background operation after the document record is created.

import pdfParse from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PolicyDocument } from '../../models/PolicyDocument.js';
import { PolicyChunk } from '../../models/PolicyChunk.js';
import { storage } from '../../config/storage.js';
import { env } from '../../config/env.js';

const CHUNK_SIZE = parseInt(process.env.POLICY_CHUNK_SIZE ?? '800', 10);   // characters per chunk
const CHUNK_OVERLAP = parseInt(process.env.POLICY_CHUNK_OVERLAP ?? '150', 10); // overlap between consecutive chunks

// Documents left in 'processing' after a crash/restart are considered interrupted
// and are marked 'failed' so they never remain stuck indefinitely.
//
// At server startup no document should legitimately be mid-processing (the
// previous process that was handling it is gone), so every document left in
// 'processing' is recovered to 'failed'. This guarantees no document remains
// stuck in 'processing' across a restart, which is what makes client polling
// stop and the status reach a terminal state.
export async function recoverStuckProcessing({ Model = PolicyDocument } = {}) {
  return Model.updateMany(
    { status: 'processing' },
    {
      $set: {
        status: 'failed',
        errorMessage:
          'Processing did not complete. The document was interrupted (for example, the server restarted). Please re-upload it.',
      },
    }
  );
}

/**
 * Split text into overlapping chunks.
 */
function chunkText(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push({ text: text.slice(start, end), start, end });
    if (end >= text.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

/**
 * Split a single page's text into chunks, tagging each with the page number.
 */
function chunkPageText(text, pageNumber, baseIndex = 0) {
  return chunkText(text).map((c, i) => ({
    ...c,
    pageNumber,
    chunkIndex: baseIndex + i,
  }));
}

/**
 * Get or create Gemini embedding client.
 * Returns null if GEMINI_API_KEY is not configured.
 */
function getEmbeddingClient(e = env) {
  if (!e?.geminiApiKey) return null;
  return new GoogleGenerativeAI(e.geminiApiKey).getGenerativeModel({
    model: e.geminiEmbedModel,
  });
}

/**
 * Determine whether a Gemini provider error is transient and worth retrying.
 */
function isTransientProviderError(err) {
  const msg = (err?.message ?? '').toLowerCase();
  const status = err?.status ?? err?.statusCode ?? null;

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

  if (status === 503 || msg.includes('503') || msg.includes('service unavailable')) {
    return true;
  }

  if (status === 429 || msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
    return true;
  }

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
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute jittered exponential backoff delay in milliseconds.
 */
function backoffMs(attempt, baseMs = 1000) {
  const exp = baseMs * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * (exp + 1));
  return exp + jitter;
}

/**
 * Generate embedding for a single text string with bounded retries.
 * Returns null if the AI provider is unavailable or all retries are exhausted.
 */
async function embedText(client, text, maxRetries = env.geminiMaxRetries) {
  if (!client) return null;

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.embedContent(text);
      return result.embedding.values;
    } catch (err) {
      lastErr = err;
      if (!isTransientProviderError(err)) {
        console.warn(`Embedding failed (non-retryable):`, err.message);
        return null;
      }
      if (attempt >= maxRetries) break;
      await sleep(backoffMs(attempt));
    }
  }
  console.warn(`Embedding failed after ${maxRetries + 1} attempts:`, lastErr?.message ?? '');
  return null;
}

/**
 * Process a policy document:
 * 1. Load buffer from storage
 * 2. Extract text from PDF
 * 3. Chunk the text
 * 4. Embed each chunk (if Gemini configured)
 * 5. Save chunks to MongoDB
 * 6. Update document status
 */
export async function processDocument(documentId, {
  PolicyDocument: PD = PolicyDocument,
  PolicyChunk: PC = PolicyChunk,
  storage: st = storage,
  pdfParse: pp = pdfParse,
  env: e = env,
} = {}) {
  const doc = await PD.findById(documentId);
  if (!doc) return;

  try {
    // Mark as processing
    doc.status = 'processing';
    await doc.save();

    // Load PDF buffer from storage
    let buffer;
    try {
      buffer = await st.getBuffer(doc.storageKey);
    } catch (err) {
      throw new Error(`Storage read failed: ${err.message}`);
    }

    // Extract text
    let parsed;
    try {
      parsed = await pp(buffer);
    } catch (err) {
      throw new Error(`PDF parse failed: ${err.message}`);
    }

    const rawText = parsed.text ?? '';
    if (!rawText.trim()) {
      throw new Error('PDF appears to be empty or unreadable (no text extracted).');
    }

    const pageCount = parsed.numpages ?? 0;

    // Build all replacement chunks in memory BEFORE touching the database.
    // This guarantees we never delete old chunks unless we have valid replacements ready.
    const embeddingClient = getEmbeddingClient(e);
    const embeddingModel = e?.geminiEmbedModel ?? null;

    // Chunk per page so each chunk retains its source page number.
    const pages = Array.isArray(parsed.pages) ? parsed.pages : [{ text: rawText, page: 1 }];
    let globalChunkIndex = 0;
    const chunkDocs = [];

    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      const pageText = page.text ?? '';
      if (!pageText.trim()) continue;

      const pageNumber = page.pageNumber ?? page.page ?? p + 1;
      const pageChunks = chunkPageText(pageText, pageNumber, globalChunkIndex);
      globalChunkIndex += pageChunks.length;

      for (const chunk of pageChunks) {
        let embedding = [];

        if (embeddingClient) {
          embedding = await embedText(embeddingClient, chunk.text) ?? [];
        }

        chunkDocs.push({
          organizationId: doc.organizationId,
          documentId: doc._id,
          text: chunk.text,
          pageNumber: chunk.pageNumber,
          chunkIndex: chunk.chunkIndex,
          embedding,
          embeddingModel,
        });
      }
    }

    // Validate that all chunks have embeddings when Gemini is configured.
    if (embeddingClient && chunkDocs.some((c) => !c.embedding || c.embedding.length === 0)) {
      throw new Error('Embedding generation failed for one or more chunks. Document not marked ready.');
    }

    // Safe replacement: delete obsolete chunks only after replacement chunks are
    // fully built and validated in memory. If embedding generation fails, old
    // chunks are preserved. If insertion fails after deletion, the document is
    // marked failed and can be re-uploaded for reprocessing.
    await PC.deleteMany({ documentId });

    await PC.insertMany(chunkDocs);

    // Update document as ready only after new chunks are valid and persisted.
    doc.status = 'ready';
    doc.pageCount = pageCount;
    doc.chunkCount = chunkDocs.length;
    await doc.save();

    return doc;
  } catch (err) {
    // Best-effort: mark as failed so the document never stays 'processing'.
    // A failure writing the 'failed' status must not crash or leave it stuck.
    doc.status = 'failed';
    doc.errorMessage = err.message;
    try {
      await doc.save();
    } catch (saveErr) {
      console.error(
        `[Policy Processor] Document ${documentId} failed and could not persist 'failed' status:`,
        saveErr.message
      );
    }
    console.error(`[Policy Processor] Document ${documentId} failed:`, err.message);
    return doc;
  }
}

