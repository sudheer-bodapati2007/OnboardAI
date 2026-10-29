// src/config/storage.js
// Storage adapter factory.
// In development (STORAGE_PROVIDER=local): saves to local filesystem.
// In production (STORAGE_PROVIDER=gcs): delegates to Google Cloud Storage.
//
// ⚠️  Local storage is NOT persistent on ephemeral hosting (Render free tier, etc.).
//     Set STORAGE_PROVIDER=gcs with a real bucket for production deployments.

import { createWriteStream, createReadStream, unlink, mkdir } from 'node:fs';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { env } from './env.js';

// ─── Local adapter ─────────────────────────────────────────────────────────────
class LocalStorageAdapter {
  constructor(baseDir) {
    this.baseDir = resolve(baseDir);
  }

  async ensureDir() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async save(key, buffer) {
    await this.ensureDir();
    const filePath = join(this.baseDir, key);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  async getBuffer(key) {
    const filePath = join(this.baseDir, key);
    return fs.readFile(filePath);
  }

  async delete(key) {
    const filePath = join(this.baseDir, key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  describe() {
    return `local:${this.baseDir}`;
  }
}

// ─── GCS stub adapter ─────────────────────────────────────────────────────────
// Full GCS implementation would use @google-cloud/storage.
// Stub throws clear errors so misconfiguration is obvious.
class GCSStorageAdapter {
  constructor(bucket) {
    this.bucket = bucket;
    // Lazy-load @google-cloud/storage only when configured
    this._client = null;
  }

  _getStorage() {
    if (!this._client) {
      try {
        const { Storage } = await import('@google-cloud/storage');
        this._client = new Storage();
      } catch {
        throw new Error(
          'GCS provider selected but @google-cloud/storage is not installed. ' +
          'Run: npm install @google-cloud/storage in the server directory.'
        );
      }
    }
    return this._client;
  }

  async save(key, buffer) {
    const storage = this._getStorage();
    const file = storage.bucket(this.bucket).file(key);
    await file.save(buffer, { contentType: 'application/pdf' });
    return `gs://${this.bucket}/${key}`;
  }

  async getBuffer(key) {
    const storage = this._getStorage();
    const [buffer] = await storage.bucket(this.bucket).file(key).download();
    return buffer;
  }

  async delete(key) {
    const storage = this._getStorage();
    await storage.bucket(this.bucket).file(key).delete({ ignoreNotFound: true });
  }

  describe() {
    return `gcs:${this.bucket}`;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────
function createStorageAdapter() {
  if (env.storageProvider === 'gcs') {
    if (!env.gcsBucket) {
      throw new Error('STORAGE_PROVIDER=gcs but GCS_BUCKET is not set.');
    }
    return new GCSStorageAdapter(env.gcsBucket);
  }
  // Default: local
  return new LocalStorageAdapter(env.storageLocalDir);
}

export const storage = createStorageAdapter();

