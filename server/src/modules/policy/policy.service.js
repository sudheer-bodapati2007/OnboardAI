// src/modules/policy/policy.service.js
import { randomUUID } from 'node:crypto';
import { PolicyDocument } from '../../models/PolicyDocument.js';
import { PolicyChunk } from '../../models/PolicyChunk.js';
import { storage } from '../../config/storage.js';
import { AppError } from '../../utils/AppError.js';
import { processDocument } from './policy.processor.js';
import { env } from '../../config/env.js';
import { createNotification } from '../notifications/notifications.service.js';
import { emitToHr } from '../../realtime/socket.js';

/**
 * Upload a PDF and kick off async processing.
 */
export async function uploadPolicy(organizationId, uploadedBy, { buffer, originalName, mimeType, size }) {
  // Generate a safe, opaque storage key — never derived from user input
  const storageKey = `${organizationId}/${randomUUID()}.pdf`;

  // Persist file
  await storage.save(storageKey, buffer);

  // Create metadata record
  const doc = await PolicyDocument.create({
    organizationId,
    uploadedBy,
    originalName,
    storageKey,
    storageProvider: env.storageProvider,
    mimeType,
    sizeBytes: size,
    status: 'pending',
  });

  // Process asynchronously — do not await (fire and forget with error handling)
  processDocument(doc._id.toString())
    .then(async (updatedDoc) => {
      if (!updatedDoc) return;

      // Real-time: push the terminal status to HR admins so the policies page
      // can refresh immediately instead of polling every few seconds.
      emitToHr(organizationId, 'policy:updated', {
        documentId: String(updatedDoc._id),
        status: updatedDoc.status,
        pageCount: updatedDoc.pageCount ?? null,
        chunkCount: updatedDoc.chunkCount ?? null,
        errorMessage: updatedDoc.status === 'failed' ? (updatedDoc.errorMessage ?? '') : undefined,
      });

      // Notify the uploader when processing finishes
      const type = updatedDoc.status === 'ready' ? 'policy_ready' : 'policy_failed';
      const title =
        updatedDoc.status === 'ready'
          ? `Policy "${originalName}" is ready`
          : `Policy "${originalName}" failed to process`;
      await createNotification({
        organizationId,
        userId: uploadedBy,
        type,
        title,
        body: updatedDoc.errorMessage ?? '',
        relatedPolicyId: doc._id,
      }).catch(() => {}); // swallow notification errors
    })
    .catch((err) => console.error('[Policy Upload] Processing error:', err.message));

  return doc;
}

/**
 * List all policy documents for an org.
 */
export async function listPolicies(organizationId) {
  return PolicyDocument.find({ organizationId })
    .sort({ createdAt: -1 })
    .select('-storageKey') // don't expose internal storage paths to client
    .lean();
}

/**
 * Delete a policy document and all its chunks and stored file.
 */
export async function deletePolicy(organizationId, documentId) {
  const doc = await PolicyDocument.findOne({ _id: documentId, organizationId });
  if (!doc) throw new AppError('Policy document not found', 404);

  // Delete chunks first
  await PolicyChunk.deleteMany({ documentId });

  // Delete stored file
  try {
    await storage.delete(doc.storageKey);
  } catch (err) {
    console.warn('[Policy Delete] Storage delete failed:', err.message);
  }

  await doc.deleteOne();
}

