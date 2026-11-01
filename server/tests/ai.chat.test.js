// tests/ai.chat.test.js
// Regression tests for the AI Policy Assistant chat error handling.
//
// Uses the answerQuestion dependency-injection seam so no real API key,
// network call, or database is required.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion } from '../src/modules/ai/ai.chat.js';

// Mutable implementation hooks; wrappers below read them at call time so each
// test can drive a different code path.
const impls = {
  generateContent: async () => ({ response: { text: () => 'The answer is 42.' } }),
  embedQuery: async () => [0.1, 0.2],
  retrieveRelevantChunks: async () => [],
};

class FakeGenAI {
  constructor() {}
  getGenerativeModel() {
    return { generateContent: (prompt) => impls.generateContent(prompt) };
  }
}

let envMock = { geminiApiKey: 'test-key', geminiChatModel: 'gemini-1.5-flash', geminiEmbedModel: 'text-embedding-004' };

const aiDeps = {
  env: envMock,
  GoogleGenerativeAI: FakeGenAI,
  embedQuery: (q) => impls.embedQuery(q),
  retrieveRelevantChunks: (org, emb) => impls.retrieveRelevantChunks(org, emb),
};

async function expectAppError(promise, statusCode, messagePart) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, statusCode, `expected status ${statusCode} got ${err.statusCode}`);
    if (messagePart) assert.match(err.message, new RegExp(messagePart, 'i'));
    return true;
  });
}

describe('answerQuestion', () => {
  it('throws 503 when GEMINI_API_KEY is not configured', async () => {
    envMock.geminiApiKey = null;
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 503, 'configured');
    envMock.geminiApiKey = 'test-key';
  });

  it('throws 429 on Gemini quota/rate-limit errors', async () => {
    impls.generateContent = async () => { throw new Error('quota exceeded for model'); };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 429, 'rate-limited');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('throws 504 on Gemini timeout errors', async () => {
    impls.generateContent = async () => { throw new Error('ETIMEDOUT'); };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 504, 'timed out');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('throws 502 for an invalid/unavailable model without exposing internals', async () => {
    impls.generateContent = async () => { throw new Error('model not found'); };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 502, 'model is not available');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('throws 502 for generic Gemini failures without exposing internals', async () => {
    impls.generateContent = async () => { throw new Error('some internal google error'); };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 502, 'temporarily unavailable');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('returns an answer when Gemini succeeds (no chunks → insufficient)', async () => {
    envMock.geminiApiKey = 'test-key';
    impls.embedQuery = async () => [0.1, 0.2];
    impls.retrieveRelevantChunks = async () => [];
    impls.generateContent = async () => ({ response: { text: () => 'The answer is 42.' } });

    const result = await answerQuestion('org1', 'what is the leave policy?', aiDeps);

    assert.equal(result.answer, 'The answer is 42.');
    assert.equal(result.insufficient, true);
    assert.deepEqual(result.sources, []);
  });

  it('returns sources when chunks are retrieved', async () => {
    impls.retrieveRelevantChunks = async () => [
      {
        documentName: 'Leave Policy.pdf',
        pageNumber: 3,
        text: 'Employees accrue 20 days of leave per year.',
        score: 0.9,
      },
    ];
    impls.generateContent = async () => ({ response: { text: () => '20 days.' } });

    const result = await answerQuestion('org1', 'leave days', aiDeps);

    assert.equal(result.insufficient, false);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].documentName, 'Leave Policy.pdf');
    assert.equal(result.sources[0].pageNumber, 3);
  });
});
