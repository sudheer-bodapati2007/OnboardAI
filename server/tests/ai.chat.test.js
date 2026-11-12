// tests/ai.chat.test.js
// Regression tests for the AI Policy Assistant chat error handling and retry logic.
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

let envMock = {
  geminiApiKey: 'test-key',
  geminiChatModel: 'gemini-3.8-flash',
  geminiEmbedModel: 'gemini-embedding-001',
  geminiRequestTimeoutMs: 500,
  geminiEmbedTimeoutMs: 500,
  geminiMaxRetries: 2,
};

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
  it('returns an answer on successful generation', async () => {
    const result = await answerQuestion('org1', 'hello', aiDeps);
    assert.equal(result.answer, 'The answer is 42.');
    assert.equal(result.insufficient, true);
    assert.deepEqual(result.sources, []);
  });

  it('throws 503 when GEMINI_API_KEY is not configured', async () => {
    envMock.geminiApiKey = null;
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 503, 'configured');
    envMock.geminiApiKey = 'test-key';
  });

  it('retries on 503 then succeeds', async () => {
    let calls = 0;
    impls.generateContent = async () => {
      calls++;
      if (calls < 3) throw new Error('503 Service Unavailable: This model is currently experiencing high demand.');
      return { response: { text: () => 'Success after retry' } };
    };
    const result = await answerQuestion('org1', 'hello', aiDeps);
    assert.equal(result.answer, 'Success after retry');
    assert.equal(calls, 3);
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('throws 503 after exhausting retries on repeated 503 failures', async () => {
    impls.generateContent = async () => {
      throw new Error('503 Service Unavailable: This model is currently experiencing high demand.');
    };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 503, 'temporarily unavailable due to high demand');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('throws 429 on quota exhaustion', async () => {
    impls.generateContent = async () => { throw new Error('429 Quota exceeded for model'); };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 429, 'rate-limited');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('throws 429 after retries on repeated 429 with retry info', async () => {
    impls.generateContent = async () => {
      throw new Error('429 Rate limited. retry_after: 5');
    };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 429, 'rate-limited');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('throws 502 for invalid API key (non-retryable)', async () => {
    impls.generateContent = async () => { throw new Error('API key invalid'); };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 502, 'temporarily unavailable');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('throws 502 for invalid model (non-retryable)', async () => {
    impls.generateContent = async () => { throw new Error('model not found'); };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 502, 'model is not available');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('throws 504 on request timeout', async () => {
    impls.generateContent = async () => { throw new Error('ETIMEDOUT'); };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 504, 'timed out');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('does not retry permanent errors (invalid model)', async () => {
    let calls = 0;
    impls.generateContent = async () => {
      calls++;
      throw new Error('model not found');
    };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 502, 'model is not available');
    assert.equal(calls, 1, 'should not retry invalid model errors');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('returns sources when chunks are retrieved', async () => {
    impls.retrieveRelevantChunks = async () => [
      {
        documentName: 'Leave Policy.pdf',
        pageNumber: 3,
        text: 'Each eligible full-time employee receives 18 days of paid annual leave per calendar year.',
        score: 0.9,
      },
    ];
    impls.generateContent = async () => ({ response: { text: () => '18 days.' } });

    const result = await answerQuestion('org1', 'leave days', aiDeps);

    assert.equal(result.insufficient, false);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].documentName, 'Leave Policy.pdf');
    assert.equal(result.sources[0].pageNumber, 3);
  });

  it('renders sources safely when the chunk has no page number or malformed fields', async () => {
    impls.retrieveRelevantChunks = async () => [
      { documentName: null, pageNumber: undefined, text: undefined, score: 0.6 },
    ];
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });

    const result = await answerQuestion('org1', 'q', aiDeps);

    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].documentName, 'Policy document');
    assert.equal(result.sources[0].pageNumber, null);
    assert.equal(result.sources[0].excerpt, '');
  });

  it('throws 502 with a clear message on an empty Gemini response', async () => {
    impls.generateContent = async () => ({ response: { text: () => '' } });
    await expectAppError(
      answerQuestion('org1', 'hello', aiDeps),
      502,
      'empty response'
    );
  });

  it('throws 502 with a clear message on a whitespace-only Gemini response', async () => {
    impls.generateContent = async () => ({ response: { text: () => '   \n  ' } });
    await expectAppError(
      answerQuestion('org1', 'hello', aiDeps),
      502,
      'empty response'
    );
  });

  it('throws 502 when the Gemini response is malformed (text() missing)', async () => {
    impls.generateContent = async () => ({ response: {} });
    await expectAppError(
      answerQuestion('org1', 'hello', aiDeps),
      502,
      'empty response'
    );
  });

  it('does not treat an empty response as retryable (single call)', async () => {
    let calls = 0;
    impls.generateContent = async () => {
      calls++;
      return { response: { text: () => '' } };
    };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 502, 'empty response');
    assert.equal(calls, 1, 'empty responses should not be retried');
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('stops retrying once the total time budget is exhausted (single call)', async () => {
    envMock.geminiTotalTimeoutMs = 0; // no budget for any retry
    let calls = 0;
    impls.generateContent = async () => {
      calls++;
      throw new Error('503 Service Unavailable: This model is currently experiencing high demand.');
    };
    await expectAppError(answerQuestion('org1', 'hello', aiDeps), 503, 'rate-limited|high demand|temporarily');
    assert.equal(calls, 1, 'a zero budget must not allow any retry');
    envMock.geminiTotalTimeoutMs = undefined;
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('allows retries within the budget and succeeds', async () => {
    envMock.geminiTotalTimeoutMs = 30000;
    let calls = 0;
    impls.generateContent = async () => {
      calls++;
      if (calls === 1) throw new Error('503 Service Unavailable: This model is currently experiencing high demand.');
      return { response: { text: () => 'Answer within budget' } };
    };
    const result = await answerQuestion('org1', 'hello', aiDeps);
    assert.equal(result.answer, 'Answer within budget');
    assert.equal(calls, 2);
    envMock.geminiTotalTimeoutMs = undefined;
    impls.generateContent = async () => ({ response: { text: () => 'ok' } });
  });

  it('maps MongoDB retrieval failures to an operational 503', async () => {
    impls.retrieveRelevantChunks = async () => {
      throw new Error('MongoServerError: connection 2 destroyed');
    };
    await expectAppError(
      answerQuestion('org1', 'hello', aiDeps),
      503,
      'Could not read the policy documents'
    );
    impls.retrieveRelevantChunks = async () => [];
  });
});
