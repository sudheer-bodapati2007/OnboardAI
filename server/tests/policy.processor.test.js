// tests/policy.processor.js
// Regression tests for policy document processing.
//
// recoverStuckProcessing() is tested with an injected fake model (no MongoDB).
// processDocument() is tested via its optional dependency-injection seam, so no
// database, real PDF, or Gemini call is required.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recoverStuckProcessing, processDocument } from '../src/modules/policy/policy.processor.js';

// ─── recoverStuckProcessing — injected fake model ─────────────────────────────

function makeStore(initialDocs = []) {
  const store = initialDocs.map((d) => ({ ...d, updatedAt: new Date(d.updatedAt) }));
  return {
    store,
    updateMany: async (filter, update) => {
      let modified = 0;
      for (const d of store) {
        const statusOk = filter.status === undefined || d.status === filter.status;
        let updatedAtOk = true;
        const ltBound = filter.updatedAt && filter.updatedAt['$lt'];
        if (ltBound) {
          updatedAtOk = d.updatedAt < ltBound;
        }
        if (statusOk && updatedAtOk) {
          Object.assign(d, update['$set']);
          modified++;
        }
      }
      return { modifiedCount: modified };
    },
  };
}

const FAILED_MESSAGE =
  'Processing did not complete. The document was interrupted (for example, the server restarted). Please re-upload it.';

describe('recoverStuckProcessing', () => {
  it('marks all processing documents as failed regardless of age', async () => {
    const model = makeStore([
      { _id: 'd1', organizationId: 'org1', status: 'processing', updatedAt: new Date(Date.now() - 2 * 60 * 1000) },
      { _id: 'd2', organizationId: 'org1', status: 'processing', updatedAt: new Date(Date.now() - 40 * 60 * 1000) },
    ]);

    const result = await recoverStuckProcessing({ Model: model });

    assert.equal(result.modifiedCount, 2);
    assert.equal(model.store[0].status, 'failed');
    assert.equal(model.store[1].status, 'failed');
    assert.equal(model.store[0].errorMessage, FAILED_MESSAGE);
    assert.equal(model.store[1].errorMessage, FAILED_MESSAGE);
  });

  it('leaves ready and failed documents untouched', async () => {
    const model = makeStore([
      { _id: 'd3', organizationId: 'org1', status: 'ready', updatedAt: new Date(Date.now() - 40 * 60 * 1000) },
      { _id: 'd4', organizationId: 'org1', status: 'failed', updatedAt: new Date(Date.now() - 40 * 60 * 1000) },
    ]);

    const result = await recoverStuckProcessing({ Model: model });

    assert.equal(result.modifiedCount, 0);
    assert.equal(model.store[0].status, 'ready');
    assert.equal(model.store[1].status, 'failed');
  });

  it('is idempotent — running twice is safe', async () => {
    const model = makeStore([
      { _id: 'd5', organizationId: 'org1', status: 'processing', updatedAt: new Date(Date.now() - 40 * 60 * 1000) },
    ]);

    await recoverStuckProcessing({ Model: model });
    const second = await recoverStuckProcessing({ Model: model });

    assert.equal(second.modifiedCount, 0);
    assert.equal(model.store[0].status, 'failed');
  });
});

// ─── processDocument — dependency-injection seam ──────────────────────────────

const envDep = {
  geminiApiKey: null, // embedding skipped in tests
  geminiEmbedModel: 'text-embedding-004',
  geminiChatModel: 'gemini-1.5-flash',
};

let currentDoc;
let ppImpl = async () => ({ text: 'Hello world. This is a test document. ', numpages: 1 });

const PD = { findById: async () => currentDoc };
const PC = {
  deleteMany: async () => {},
  insertMany: async () => {},
};
const st = { getBuffer: async () => Buffer.from('%PDF-1.4 fake') };

function newDoc(overrides = {}) {
  const saveCalls = [];
  currentDoc = {
    _id: 'd1',
    organizationId: 'org1',
    status: 'pending',
    storageKey: 'org1/file.pdf',
    errorMessage: null,
    pageCount: 0,
    chunkCount: 0,
    ...overrides,
    save: async function () {
      saveCalls.push({ status: this.status, errorMessage: this.errorMessage });
    },
  };
  return { doc: currentDoc, saveCalls };
}

const deps = { PolicyDocument: PD, PolicyChunk: PC, storage: st, env: envDep };

describe('processDocument', () => {
  // Reset ppImpl before each test so earlier tests don't leak state.
  beforeEach(() => {
    ppImpl = async () => ({ text: 'Hello world. This is a test document. ', numpages: 1 });
  });

  it('transitions status to ready on successful processing', async () => {
    const { saveCalls } = newDoc();
    const result = await processDocument('d1', { ...deps, pdfParse: async (b) => ppImpl() });

    assert.equal(result.status, 'ready');
    assert.equal(currentDoc.status, 'ready');
    assert.equal(currentDoc.pageCount, 1);
    assert.equal(currentDoc.chunkCount, 1);
    assert.ok(saveCalls.some((s) => s.status === 'processing'), 'should persist processing first');
    assert.ok(saveCalls.some((s) => s.status === 'ready'), 'should persist ready at the end');
  });

  it('transitions status to failed when PDF parsing fails and never stays processing', async () => {
    const { saveCalls } = newDoc();
    ppImpl = async () => { throw new Error('corrupt pdf'); };
    const result = await processDocument('d2', { ...deps, pdfParse: async (b) => ppImpl() });

    assert.equal(result.status, 'failed');
    assert.equal(currentDoc.status, 'failed');
    assert.equal(currentDoc.errorMessage, 'PDF parse failed: corrupt pdf');
    assert.ok(saveCalls.some((s) => s.status === 'processing'), 'processing was persisted');
    assert.ok(saveCalls.some((s) => s.status === 'failed'), 'failed was persisted — not stuck processing');
  });

  it('transitions status to failed when storage read fails', async () => {
    const { saveCalls } = newDoc();
    const failingStorage = { getBuffer: async () => { throw new Error('file missing'); } };
    const result = await processDocument('d3', { ...deps, storage: failingStorage });

    assert.equal(result.status, 'failed');
    assert.equal(currentDoc.status, 'failed');
    assert.ok(saveCalls.some((s) => s.status === 'failed'), 'failed was persisted — not stuck processing');
  });

  it('reprocessing deletes old chunks before inserting new ones (no duplication)', async () => {
    const { saveCalls } = newDoc();
    let deleteCalls = 0;
    let insertCalls = 0;
    const trackingPC = {
      deleteMany: async () => { deleteCalls++; },
      insertMany: async (docs) => { insertCalls += docs.length; },
    };
    ppImpl = async () => ({ text: 'Page one text. ', numpages: 1, pages: [{ text: 'Page one text. ', page: 1 }] });

    const result = await processDocument('d4', {
      ...deps,
      PolicyChunk: trackingPC,
      pdfParse: async (b) => ppImpl(),
    });

    assert.equal(result.status, 'ready');
    assert.equal(deleteCalls, 1, 'old chunks should be deleted before inserting new ones');
    assert.ok(insertCalls > 0, 'new chunks should be inserted');
  });

  it('document is not marked ready until chunks are stored', async () => {
    const { saveCalls } = newDoc();
    let insertCalled = false;
    const trackingPC = {
      deleteMany: async () => {},
      insertMany: async () => { insertCalled = true; },
    };

    await processDocument('d5', {
      ...deps,
      PolicyChunk: trackingPC,
      pdfParse: async (b) => ppImpl(),
    });

    assert.equal(insertCalled, true);
    assert.equal(currentDoc.status, 'ready', 'document marked ready only after chunks stored');
  });

  it('failed embedding does not destroy existing document record', async () => {
    const { saveCalls } = newDoc({ status: 'ready', chunkCount: 3 });
    // Make PDF parse fail — processor should mark document as failed
    // but the existing record should not be deleted.
    ppImpl = async () => { throw new Error('PDF parse failed: corrupt'); };

    const result = await processDocument('d6', {
      ...deps,
      pdfParse: async (b) => ppImpl(),
    });

    assert.equal(result.status, 'failed');
    assert.equal(currentDoc.status, 'failed');
    assert.ok(currentDoc._id, 'document record still exists after failure');
    assert.ok(saveCalls.some((s) => s.status === 'failed'), 'failed status persisted');
  });

  it('reprocessing is idempotent — same document processed twice produces same result', async () => {
    const results = [];
    for (let i = 0; i < 2; i++) {
      const { saveCalls } = newDoc({ status: 'pending' });
      const result = await processDocument(`d7-${i}`, {
        ...deps,
        pdfParse: async (b) => ppImpl(),
      });
      results.push(result.status);
    }

    assert.equal(results[0], 'ready');
    assert.equal(results[1], 'ready');
  });
});
