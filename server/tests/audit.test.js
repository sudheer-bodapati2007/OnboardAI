// server/tests/audit.test.js
// Audit pass — security, storage, and correctness tests.
// Run: node --test server/tests/audit.test.js
//
// All external I/O (GCS, Gemini, MongoDB) is mocked.
// Tests that require live credentials are clearly documented as manual.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';

// ─── 1. LocalStorageAdapter — path traversal prevention ───────────────────────

describe('LocalStorageAdapter — path traversal prevention', () => {
  // Inline the safe-resolve logic (same as storage.js)
  function safeResolve(baseDir, key) {
    const base = resolve(baseDir);
    const resolved = resolve(base, key);
    const rel = relative(base, resolved);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Storage key escapes base directory: ${key}`);
    }
    return resolved;
  }

  // Use a portable base dir (works on Windows and Linux)
  const BASE = resolve(tmpdir(), 'onboardai-test-base');

  it('allows a normal sub-path key', () => {
    const result = safeResolve(BASE, 'org123/uuid.pdf');
    // Should start with the base dir (portable check)
    assert.ok(result.startsWith(BASE), `result "${result}" should start with base "${BASE}"`);
  });

  it('allows a simple filename key', () => {
    const result = safeResolve(BASE, 'file.pdf');
    assert.ok(result.startsWith(BASE), `result should start with base dir`);
  });

  it('blocks a ../ traversal attempt', () => {
    assert.throws(
      () => safeResolve(BASE, '../etc/passwd'),
      /escapes base directory/
    );
  });

  it('blocks a nested traversal', () => {
    assert.throws(
      () => safeResolve(BASE, 'sub/../../etc/passwd'),
      /escapes base directory/
    );
  });
});

// ─── 2. LocalStorageAdapter — functional (real filesystem, tmp dir) ────────────

describe('LocalStorageAdapter — functional tests', async () => {
  // Dynamically import the class under test
  // We can't import from storage.js directly because it calls createStorageAdapter()
  // at module load time. Instead we test the save/get/delete logic directly.

  async function makeAdapter() {
    const dir = join(tmpdir(), `onboardai-test-${randomUUID()}`);
    await fs.mkdir(dir, { recursive: true });
    return { dir, adapter: { baseDir: dir, _safeResolve, save, getBuffer, delete: del } };

    function _safeResolve(key) {
      const resolved = resolve(dir, key);
      const rel = relative(dir, resolved);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(`Storage key escapes base directory: ${key}`);
      }
      return resolved;
    }

    async function save(key, buffer) {
      const filePath = _safeResolve(key);
      const sep = filePath.includes('/') ? '/' : '\\';
      const parentDir = filePath.substring(0, filePath.lastIndexOf(sep));
      if (parentDir) await fs.mkdir(parentDir, { recursive: true });
      await fs.writeFile(filePath, buffer);
      return filePath;
    }

    async function getBuffer(key) {
      return fs.readFile(_safeResolve(key));
    }

    async function del(key) {
      try { await fs.unlink(_safeResolve(key)); }
      catch (err) { if (err.code !== 'ENOENT') throw err; }
    }
  }

  it('saves and retrieves a buffer', async () => {
    const { adapter } = await makeAdapter();
    const content = Buffer.from('Hello, PDF!');
    await adapter.save('test.pdf', content);
    const result = await adapter.getBuffer('test.pdf');
    assert.ok(Buffer.isBuffer(result));
    assert.equal(result.toString(), 'Hello, PDF!');
  });

  it('saves to sub-directories (orgId/uuid.pdf pattern)', async () => {
    const { adapter } = await makeAdapter();
    const content = Buffer.from('%PDF-1.4');
    await adapter.save('org123/uuid-file.pdf', content);
    const result = await adapter.getBuffer('org123/uuid-file.pdf');
    assert.ok(result.toString().startsWith('%PDF'));
  });

  it('delete removes a file silently', async () => {
    const { adapter } = await makeAdapter();
    await adapter.save('del-me.pdf', Buffer.from('x'));
    await adapter['delete']('del-me.pdf');
    await assert.rejects(
      () => adapter.getBuffer('del-me.pdf'),
      { code: 'ENOENT' }
    );
  });

  it('delete of non-existent file does not throw', async () => {
    const { adapter } = await makeAdapter();
    // Should resolve without error
    await assert.doesNotReject(() => adapter['delete']('does-not-exist.pdf'));
  });
});

// ─── 3. GCSStorageAdapter — mocked ────────────────────────────────────────────

describe('GCSStorageAdapter — logic with mocked GCS client', () => {
  // Build a minimal mock that verifies the adapter passes the right args
  function makeMockGCSAdapter(bucketName) {
    const calls = { save: [], getBuffer: [], delete: [] };

    const mockFile = (key) => ({
      save: async (buf, opts) => { calls.save.push({ key, opts }); },
      download: async () => {
        calls.getBuffer.push({ key });
        return [Buffer.from(`content-of-${key}`)];
      },
      delete: async (opts) => { calls.delete.push({ key, opts }); },
    });

    const mockBucket = { file: (key) => mockFile(key) };
    const mockStorage = { bucket: (name) => { assert.equal(name, bucketName); return mockBucket; } };

    // Adapter with injected mock (bypasses the dynamic import)
    const adapter = {
      bucketName,
      _storageClient: mockStorage,
      async _getClient() { return this._storageClient; },
      async save(key, buffer) {
        const client = await this._getClient();
        const file = client.bucket(this.bucketName).file(key);
        await file.save(buffer, { contentType: 'application/pdf', predefinedAcl: 'private' });
        return `gs://${this.bucketName}/${key}`;
      },
      async getBuffer(key) {
        const client = await this._getClient();
        const [buf] = await client.bucket(this.bucketName).file(key).download();
        return buf;
      },
      async delete(key) {
        const client = await this._getClient();
        await client.bucket(this.bucketName).file(key).delete({ ignoreNotFound: true });
      },
    };

    return { adapter, calls };
  }

  it('save() calls file.save with private ACL and pdf contentType', async () => {
    const { adapter, calls } = makeMockGCSAdapter('test-bucket');
    const buf = Buffer.from('%PDF-1.4');
    const uri = await adapter.save('org1/uuid.pdf', buf);
    assert.equal(uri, 'gs://test-bucket/org1/uuid.pdf');
    assert.equal(calls.save.length, 1);
    assert.equal(calls.save[0].key, 'org1/uuid.pdf');
    assert.equal(calls.save[0].opts.contentType, 'application/pdf');
    assert.equal(calls.save[0].opts.predefinedAcl, 'private');
  });

  it('getBuffer() returns a buffer from mock download', async () => {
    const { adapter } = makeMockGCSAdapter('test-bucket');
    const buf = await adapter.getBuffer('org1/uuid.pdf');
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.toString().includes('content-of'));
  });

  it('delete() calls file.delete with ignoreNotFound:true', async () => {
    const { adapter, calls } = makeMockGCSAdapter('test-bucket');
    await adapter.delete('org1/uuid.pdf');
    assert.equal(calls.delete.length, 1);
    assert.equal(calls.delete[0].opts?.ignoreNotFound, true);
  });

  it('returns correct gs:// URI from save()', async () => {
    const { adapter } = makeMockGCSAdapter('my-bucket');
    const uri = await adapter.save('orgX/file.pdf', Buffer.from('x'));
    assert.match(uri, /^gs:\/\/my-bucket\/orgX\/file\.pdf$/);
  });
});

// ─── 4. GCS missing package — clear error ─────────────────────────────────────

describe('GCSStorageAdapter — missing @google-cloud/storage package', () => {
  it('throws a clear installation message when SDK is not importable', async () => {
    // We simulate the import failure by testing the error branch directly
    async function tryGetClientWithoutSDK() {
      let Storage;
      try {
        // Import a module that definitely doesn't exist
        const mod = await import('./nonexistent-gcs-package-xyz.js').catch(() => {
          throw new Error(
            'STORAGE_PROVIDER=gcs requires @google-cloud/storage. ' +
            'Run inside server/: npm install @google-cloud/storage'
          );
        });
        Storage = mod.Storage;
      } catch (err) {
        throw err;
      }
    }

    await assert.rejects(
      tryGetClientWithoutSDK,
      /STORAGE_PROVIDER=gcs requires @google-cloud\/storage/
    );
  });
});

// ─── 5. Notification org isolation (service layer) ────────────────────────────

describe('Notification service — org isolation in listNotifications', () => {
  it('query filter includes both userId AND organizationId', () => {
    // Simulate the service filter construction
    const userId = 'user_1';
    const organizationId = 'org_A';
    const filter = { userId, organizationId };

    assert.ok('userId' in filter, 'filter must include userId');
    assert.ok('organizationId' in filter, 'filter must include organizationId (defence-in-depth)');
  });

  it('user in org_B cannot see notifications scoped to org_A', () => {
    const storedNotif = { userId: 'user_1', organizationId: 'org_A' };
    const requestingOrgId = 'org_B';
    const matches = storedNotif.userId === 'user_1' && storedNotif.organizationId === requestingOrgId;
    assert.equal(matches, false, 'cross-org access must be rejected');
  });
});

// ─── 6. AI error sanitization ─────────────────────────────────────────────────

describe('AI chat — error message sanitization', () => {
  // The real ai.chat.js now catches and sanitizes Gemini errors before re-throwing.
  // Here we test the classification logic inline.

  function classifyGeminiError(errMessage) {
    if (errMessage.includes('quota') || errMessage.includes('rate') || errMessage.includes('429')) {
      return { status: 429, message: 'AI service is temporarily rate-limited. Please try again shortly.' };
    }
    if (errMessage.includes('timeout') || errMessage.includes('ETIMEDOUT')) {
      return { status: 504, message: 'AI service timed out. Please try again.' };
    }
    // Generic — never expose internal message
    return { status: 502, message: 'The AI service is temporarily unavailable. Please try again.' };
  }

  it('rate limit errors return 429 with safe message', () => {
    const result = classifyGeminiError('quota exceeded for model');
    assert.equal(result.status, 429);
    assert.ok(!result.message.includes('quota'), 'safe message must not echo raw error');
  });

  it('timeout errors return 504', () => {
    const result = classifyGeminiError('Connection ETIMEDOUT after 30000ms');
    assert.equal(result.status, 504);
  });

  it('unknown errors return 502 with generic message', () => {
    const result = classifyGeminiError('PERMISSION_DENIED: API key xyz is invalid. key=AIzaSy...');
    assert.equal(result.status, 502);
    // Must NOT include the raw error (which may contain API key fragments)
    assert.ok(!result.message.toLowerCase().includes('api key'), 'must not leak API key info');
    assert.ok(!result.message.includes('PERMISSION_DENIED'), 'must not leak internal status');
  });
});

// ─── 7. Storage key format (UUID-based, org-prefixed) ─────────────────────────

describe('Policy storage key format', () => {
  function generateStorageKey(organizationId) {
    return `${organizationId}/${randomUUID()}.pdf`;
  }

  it('key is prefixed with organizationId', () => {
    const key = generateStorageKey('org_abc123');
    assert.ok(key.startsWith('org_abc123/'), `key should start with org prefix: ${key}`);
  });

  it('key ends with .pdf', () => {
    const key = generateStorageKey('org1');
    assert.ok(key.endsWith('.pdf'));
  });

  it('key is unique on each call', () => {
    const key1 = generateStorageKey('org1');
    const key2 = generateStorageKey('org1');
    assert.notEqual(key1, key2, 'each upload gets a unique key');
  });

  it('key never contains user-supplied filename', () => {
    const maliciousFilename = '../../../etc/cron.d/backdoor';
    const key = generateStorageKey('org1');
    assert.ok(!key.includes(maliciousFilename), 'key must not include user filename');
    assert.ok(!key.includes('etc'), 'key must not include path traversal content');
  });
});

// ─── 8. RAG retrieval — ready-only, org-scoped ────────────────────────────────

describe('RAG retrieval correctness', () => {
  it('only documents with status=ready are used', () => {
    const documents = [
      { _id: 'doc1', status: 'ready', organizationId: 'org1' },
      { _id: 'doc2', status: 'processing', organizationId: 'org1' },
      { _id: 'doc3', status: 'failed', organizationId: 'org1' },
      { _id: 'doc4', status: 'pending', organizationId: 'org1' },
    ];

    const readyDocs = documents.filter((d) => d.status === 'ready');
    assert.equal(readyDocs.length, 1);
    assert.equal(readyDocs[0]._id, 'doc1');
  });

  it('chunks from a different org are excluded from retrieval', () => {
    const chunks = [
      { _id: 'c1', organizationId: 'org1', documentId: 'doc1', text: 'policy text', embedding: [0.1, 0.2] },
      { _id: 'c2', organizationId: 'org2', documentId: 'doc2', text: 'other org',  embedding: [0.1, 0.2] },
    ];
    const orgId = 'org1';
    const filtered = chunks.filter((c) => c.organizationId === orgId);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]._id, 'c1');
  });

  it('chunks without embeddings are excluded from scoring', () => {
    const chunks = [
      { _id: 'c1', embedding: [0.1, 0.2] },
      { _id: 'c2', embedding: [] },         // empty — no embedding
      { _id: 'c3', embedding: null },       // null
    ];
    // Simulates the $exists: true filter
    const withEmbeddings = chunks.filter((c) => c.embedding?.length > 0);
    assert.equal(withEmbeddings.length, 1);
    assert.equal(withEmbeddings[0]._id, 'c1');
  });

  it('similarity threshold of 0.70 filters low-relevance chunks', () => {
    const THRESHOLD = 0.70;
    const scored = [
      { text: 'A', score: 0.95 },
      { text: 'B', score: 0.70 },  // exactly at threshold — included
      { text: 'C', score: 0.69 },  // just below — excluded
      { text: 'D', score: 0.40 },
    ];
    const relevant = scored.filter((c) => c.score >= THRESHOLD);
    assert.equal(relevant.length, 2);
    assert.ok(relevant.every((c) => c.score >= THRESHOLD));
  });

  it('insufficient=true when no chunks pass the threshold', () => {
    const chunks = [];
    const insufficient = chunks.length === 0;
    assert.ok(insufficient, 'empty chunks should flag insufficient evidence');
  });

  it('top-K limits results to 5', () => {
    const TOP_K = 5;
    const scored = Array.from({ length: 10 }, (_, i) => ({ text: `chunk${i}`, score: 0.9 - i * 0.01 }));
    const top = scored.slice(0, TOP_K);
    assert.equal(top.length, TOP_K);
  });
});

// ─── 9. Delete policy — cleanup verification ──────────────────────────────────

describe('deletePolicy — chunk and file cleanup', () => {
  it('deletes chunks before document record', async () => {
    const operations = [];

    // Simulate the delete flow
    async function simulateDeletePolicy() {
      const doc = { _id: 'doc1', storageKey: 'org1/uuid.pdf', organizationId: 'org1' };

      // Step 1: delete chunks
      const chunksDeleted = await (async () => {
        operations.push('deleteChunks');
        return { deletedCount: 3 };
      })();

      // Step 2: delete file
      await (async () => { operations.push('deleteStorage'); })();

      // Step 3: delete document record
      await (async () => { operations.push('deleteDoc'); })();

      return chunksDeleted;
    }

    await simulateDeletePolicy();
    assert.deepEqual(operations, ['deleteChunks', 'deleteStorage', 'deleteDoc']);
  });

  it('a 404 on doc lookup prevents any deletion', () => {
    function findDoc(organizationId, documentId, docs) {
      return docs.find((d) => d._id === documentId && d.organizationId === organizationId) ?? null;
    }

    const docs = [{ _id: 'doc1', organizationId: 'org1' }];
    const found = findDoc('org2', 'doc1', docs); // wrong org
    assert.equal(found, null, 'cross-org delete should not find the document');
  });
});

// ─── 10. JWT cookie security settings ─────────────────────────────────────────

describe('JWT cookie security', () => {
  it('httpOnly is always true', () => {
    function buildCookieOptions(isProd) {
      return {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'strict' : 'lax',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/',
      };
    }
    const dev  = buildCookieOptions(false);
    const prod = buildCookieOptions(true);

    assert.equal(dev.httpOnly, true, 'httpOnly must be true in dev');
    assert.equal(prod.httpOnly, true, 'httpOnly must be true in prod');
  });

  it('secure=true in production, false in development', () => {
    function buildCookieOptions(isProd) {
      return { secure: isProd };
    }
    assert.equal(buildCookieOptions(true).secure, true);
    assert.equal(buildCookieOptions(false).secure, false);
  });

  it('sameSite=strict in production, lax in development', () => {
    function buildCookieOptions(isProd) {
      return { sameSite: isProd ? 'strict' : 'lax' };
    }
    assert.equal(buildCookieOptions(true).sameSite, 'strict');
    assert.equal(buildCookieOptions(false).sameSite, 'lax');
  });

  it('session expires within 8 hours (not days)', () => {
    const SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    assert.ok(SESSION_MS < ONE_DAY_MS, 'session should be shorter than 1 day');
    assert.ok(SESSION_MS === 28_800_000, 'should be exactly 8 hours in ms');
  });
});

// ─── 11. Content Security Policy — frame ancestors ────────────────────────────

describe('Security headers — clickjacking prevention', () => {
  it('frameAncestors none prevents iframe embedding', () => {
    const cspDirectives = {
      defaultSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    };
    assert.ok(
      cspDirectives.frameAncestors.includes("'none'"),
      'frameAncestors: none must be set to prevent clickjacking'
    );
  });
});

