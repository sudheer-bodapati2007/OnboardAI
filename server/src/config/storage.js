// src/config/storage.js
// Storage adapter factory.
//
// Development  (STORAGE_PROVIDER=local): saves to local filesystem under STORAGE_LOCAL_DIR.
// Production   (STORAGE_PROVIDER=gcs):   uses Google Cloud Storage.
//
// ⚠️  Local storage is NOT persistent on ephemeral hosting (Render free tier, etc.).
//     Set STORAGE_PROVIDER=gcs with a real bucket for production deployments.
//
// GCS prerequisites:
//   1. npm install @google-cloud/storage   (in server/)
//   2. Set env vars:
//        STORAGE_PROVIDER=gcs
//        GCS_BUCKET=your-bucket-name
//        GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//        (OR use Workload Identity on GCP-managed compute — no key file needed)
//
// Bucket security: the bucket MUST NOT have allUsers or allAuthenticatedUsers access.
// Grant only roles/storage.objectAdmin to the service account used by this server.

import { promises as fs } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { env } from './env.js';

// ─── Local adapter ─────────────────────────────────────────────────────────────

class LocalStorageAdapter {
  constructor(baseDir) {
    this.baseDir = resolve(baseDir);
  }

  /**
   * Resolve key to an absolute path and verify it stays within baseDir.
   * Guards against path-traversal in keys (e.g. "../../etc/passwd").
   * Keys are always server-generated UUIDs so this is a defence-in-depth measure.
   */
  _safeResolve(key) {
    const resolved = resolve(this.baseDir, key);
    const rel = relative(this.baseDir, resolved);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Storage key escapes base directory: ${key}`);
    }
    return resolved;
  }

  async _ensureParentDir(filePath) {
    const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    const dir = lastSep > 0 ? filePath.slice(0, lastSep) : this.baseDir;
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Save a buffer under the given key.
   * @param {string} key    e.g. "orgId/uuid.pdf"
   * @param {Buffer} buffer
   * @returns {string} absolute file path
   */
  async save(key, buffer) {
    const filePath = this._safeResolve(key);
    await this._ensureParentDir(filePath);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  /**
   * Read a stored file into a Buffer.
   * @param {string} key
   * @returns {Buffer}
   */
  async getBuffer(key) {
    const filePath = this._safeResolve(key);
    return fs.readFile(filePath);
  }

  /**
   * Delete a stored file. Silently ignores missing files.
   * @param {string} key
   */
  async delete(key) {
    const filePath = this._safeResolve(key);
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

// ─── GCS adapter ───────────────────────────────────────────────────────────────
//
// This is a REAL implementation using @google-cloud/storage.
// It lazy-loads the SDK so the server still starts without it (giving a clear
// error only when a GCS operation is actually attempted).
//
// Authentication order (automatic via google-auth-library):
//   1. GOOGLE_APPLICATION_CREDENTIALS env var (path to service account JSON)
//   2. Workload Identity (GKE, Cloud Run, Compute Engine)
//   3. gcloud CLI credentials (local development with `gcloud auth application-default login`)
//
// Bucket policy: keep the bucket PRIVATE.
// No signed URLs are generated — the server reads/writes directly server-to-server.

class GCSStorageAdapter {
  /**
   * @param {string} bucketName  Value of GCS_BUCKET env var
   */
  constructor(bucketName) {
    this.bucketName = bucketName;
    this._storageClient = null; // lazy-initialised on first use
  }

  /**
   * Lazy-initialise the GCS Storage client (async, cached after first call).
   * @returns {import('@google-cloud/storage').Storage}
   */
  async _getClient() {
    if (this._storageClient) return this._storageClient;

    let Storage;
    try {
      const mod = await import('@google-cloud/storage');
      Storage = mod.Storage;
    } catch {
      throw new Error(
        'STORAGE_PROVIDER=gcs requires @google-cloud/storage. ' +
        'Run inside server/: npm install @google-cloud/storage'
      );
    }

    // Authentication is handled automatically by the Google Auth Library:
    // it reads GOOGLE_APPLICATION_CREDENTIALS or uses ADC.
    this._storageClient = new Storage();
    return this._storageClient;
  }

  /**
   * Upload a Buffer to GCS.
   * @param {string} key    Object name within the bucket (e.g. "orgId/uuid.pdf")
   * @param {Buffer} buffer PDF content
   * @returns {string}      gs:// URI (informational; not a public URL)
   */
  async save(key, buffer) {
    const client = await this._getClient();
    const file = client.bucket(this.bucketName).file(key);
    await file.save(buffer, {
      contentType: 'application/pdf',
      // Explicitly set object to private — belt-and-suspenders even if bucket
      // has uniform access control enabled.
      predefinedAcl: 'private',
      metadata: {
        cacheControl: 'private, no-cache',
      },
    });
    return `gs://${this.bucketName}/${key}`;
  }

  /**
   * Download a GCS object into a Buffer.
   * @param {string} key
   * @returns {Buffer}
   */
  async getBuffer(key) {
    const client = await this._getClient();
    const [buffer] = await client.bucket(this.bucketName).file(key).download();
    return buffer;
  }

  /**
   * Delete a GCS object. Silently ignores missing objects.
   * @param {string} key
   */
  async delete(key) {
    const client = await this._getClient();
    await client
      .bucket(this.bucketName)
      .file(key)
      .delete({ ignoreNotFound: true });
  }

  describe() {
    return `gcs:${this.bucketName}`;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function createStorageAdapter() {
  const provider = env.storageProvider ?? 'local';

  if (provider === 'gcs') {
    if (!env.gcsBucket) {
      throw new Error(
        'STORAGE_PROVIDER=gcs requires GCS_BUCKET to be set.\n' +
        'Add GCS_BUCKET=your-bucket-name to server/.env'
      );
    }
    return new GCSStorageAdapter(env.gcsBucket);
  }

  if (provider === 'local') {
    return new LocalStorageAdapter(env.storageLocalDir ?? 'uploads');
  }

  throw new Error(
    `Unknown STORAGE_PROVIDER "${provider}". Supported values: local, gcs`
  );
}

export const storage = createStorageAdapter();

// Named exports for testing
export { LocalStorageAdapter, GCSStorageAdapter };
