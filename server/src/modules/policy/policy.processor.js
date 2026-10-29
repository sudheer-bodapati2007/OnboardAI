// src/modules/policy/policy.processor.js
// PDF extraction, chunking, embedding generation, and storage.
// This runs as a background operation after the document record is created.

import pdfParse from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PolicyDocument } from '../../models/PolicyDocument.js';
import { PolicyChunk } from '../../models/PolicyChunk.js';
import { storage } from '../../config/storage.js';
import { env } from '../../config/env.js';

const CHUNK_SIZE = 800;       // characters per chunk
const CHUNK_OVERLAP = 150;    // overlap between consecutive chunks

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
 * Get or create Gemini embedding client.
 * Returns null if GEMINI_API_KEY is not configured.
 */
function getEmbeddingClient() {
  if (!env.geminiApiKey) return null;
  return new GoogleGenerativeAI(env.geminiApiKey).getGenerativeModel({
    model: env.geminiEmbedModel,
  });
}

/**
 * Generate embedding for a single text string.
 * Returns null if the AI provider is unavailable.
 */
async function embedText(client, text) {
  if (!client) return null;
  const result = await client.embedContent(text);
  return result.embedding.values;
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
export async function processDocument(documentId) {
  const doc = await PolicyDocument.findById(documentId);
  if (!doc) return;

  try {
    // Mark as processing
    doc.status = 'processing';
    await doc.save();

    // Load PDF buffer from storage
    let buffer;
    try {
      buffer = await storage.getBuffer(doc.storageKey);
    } catch (err) {
      throw new Error(`Storage read failed: ${err.message}`);
    }

    // Extract text
    let parsed;
    try {
      parsed = await pdfParse(buffer);
    } catch (err) {
      throw new Error(`PDF parse failed: ${err.message}`);
    }

    const rawText = parsed.text ?? '';
    if (!rawText.trim()) {
      throw new Error('PDF appears to be empty or unreadable (no text extracted).');
    }

    const pageCount = parsed.numpages ?? 0;

    // Remove existing chunks (in case of reprocessing)
    await PolicyChunk.deleteMany({ documentId });

    const chunks = chunkText(rawText);
    const embeddingClient = getEmbeddingClient();

    const chunkDocs = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let embedding = [];

      if (embeddingClient) {
        try {
          embedding = await embedText(embeddingClient, chunk.text) ?? [];
        } catch (embErr) {
          // Log but don't fail — store chunk without embedding
          console.warn(`Embedding failed for chunk ${i}:`, embErr.message);
        }
      }

      chunkDocs.push({
        organizationId: doc.organizationId,
        documentId: doc._id,
        text: chunk.text,
        pageNumber: null, // pdf-parse doesn't give per-chunk page numbers easily
        chunkIndex: i,
        embedding,
      });
    }

    await PolicyChunk.insertMany(chunkDocs);

    // Update document as ready
    doc.status = 'ready';
    doc.pageCount = pageCount;
    doc.chunkCount = chunkDocs.length;
    await doc.save();

    return doc;
  } catch (err) {
    doc.status = 'failed';
    doc.errorMessage = err.message;
    await doc.save();
    console.error(`[Policy Processor] Document ${documentId} failed:`, err.message);
    return doc;
  }
}

