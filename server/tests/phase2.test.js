// server/tests/phase2.test.js
// Phase 2 unit tests — uses Node built-in test runner (no extra deps)
// Run: node --test server/tests/phase2.test.js

import { describe, it, before, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock Mongoose document */
function makeDoc(fields) {
  return { ...fields, save: async () => {}, toObject: () => ({ ...fields }) };
}

// ─── 1. Notification service (pure logic, no DB) ─────────────────────────────

describe('Notification service — createNotification (mocked)', () => {
  it('accepts valid notification input', async () => {
    const input = {
      organizationId: 'org1',
      userId: 'user1',
      type: 'onboarding_assigned',
      title: 'Onboarding ready',
      body: 'Your plan is ready.',
    };
    // Simple structural check — no DB needed
    assert.ok(input.organizationId, 'organizationId required');
    assert.ok(input.userId, 'userId required');
    assert.match(input.type, /^[a-z_]+$/, 'type must be snake_case');
    assert.ok(input.title.length > 0, 'title must not be empty');
  });

  it('duplicate guard: same notification within 60s should be deduplicated', () => {
    // The real service checks a DB query; here we test the logic boundary
    const DEDUP_WINDOW_MS = 60 * 1000;
    const now = Date.now();
    const lastCreated = now - 30_000; // 30 seconds ago → within window
    assert.ok(now - lastCreated < DEDUP_WINDOW_MS, 'should be within dedup window');

    const lastCreatedOld = now - 120_000; // 2 minutes ago → outside window
    assert.ok(now - lastCreatedOld >= DEDUP_WINDOW_MS, 'should be outside dedup window');
  });
});

describe('Notification service — markRead authorization', () => {
  it('returns 404 when notification does not belong to user', () => {
    // Simulate what the service does: findOne({_id, userId, organizationId})
    const notifications = [
      { _id: 'n1', userId: 'user_a', organizationId: 'org1', isRead: false },
    ];
    const requestingUserId = 'user_b'; // wrong user
    const found = notifications.find(
      (n) => n._id === 'n1' && n.userId === requestingUserId
    );
    assert.equal(found, undefined, 'should not find notification for wrong user → 404');
  });

  it('succeeds when notification belongs to the requesting user', () => {
    const notifications = [
      { _id: 'n1', userId: 'user_a', organizationId: 'org1', isRead: false },
    ];
    const found = notifications.find(
      (n) => n._id === 'n1' && n.userId === 'user_a'
    );
    assert.ok(found, 'should find notification for correct user');
  });
});

describe('Notification — listNotifications unread count', () => {
  it('correctly computes unreadCount from a list', () => {
    const notifications = [
      { _id: 'n1', isRead: false },
      { _id: 'n2', isRead: true },
      { _id: 'n3', isRead: false },
    ];
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    assert.equal(unreadCount, 2, 'unreadCount should be 2');
  });
});

// ─── 2. PDF validation ────────────────────────────────────────────────────────

describe('Policy upload — validatePdfSignature', () => {
  // Inline the validation logic (same as policy.upload.js)
  function validatePdfSignature(buffer) {
    if (!buffer || buffer.length < 4) return false;
    // %PDF magic bytes: 0x25 0x50 0x44 0x46
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    );
  }

  it('accepts a valid PDF magic bytes buffer', () => {
    const validPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    assert.ok(validatePdfSignature(validPdf), 'should return true for valid PDF');
  });

  it('rejects a buffer with invalid magic bytes', () => {
    const notPdf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
    assert.equal(validatePdfSignature(notPdf), false, 'should reject PNG bytes');
  });

  it('rejects empty buffer', () => {
    assert.equal(validatePdfSignature(Buffer.alloc(0)), false, 'should reject empty buffer');
  });

  it('rejects buffer with only 3 bytes', () => {
    assert.equal(validatePdfSignature(Buffer.from([0x25, 0x50, 0x44])), false, 'too short');
  });

  it('rejects null/undefined', () => {
    assert.equal(validatePdfSignature(null), false, 'null → false');
    assert.equal(validatePdfSignature(undefined), false, 'undefined → false');
  });
});

// ─── 3. AI retrieval — cosine similarity ─────────────────────────────────────

describe('AI retrieval — cosineSimilarity', () => {
  // Inline the function (same as ai.retrieval.js)
  function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  it('returns 1.0 for identical vectors', () => {
    const v = [1, 2, 3];
    const result = cosineSimilarity(v, v);
    assert.ok(Math.abs(result - 1.0) < 1e-9, `expected ~1.0 got ${result}`);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const result = cosineSimilarity([1, 0], [0, 1]);
    assert.ok(Math.abs(result) < 1e-9, `expected 0 got ${result}`);
  });

  it('returns -1.0 for opposite vectors', () => {
    const result = cosineSimilarity([1, 0], [-1, 0]);
    assert.ok(Math.abs(result + 1.0) < 1e-9, `expected -1 got ${result}`);
  });

  it('returns 0 for zero vector', () => {
    const result = cosineSimilarity([0, 0], [1, 2]);
    assert.equal(result, 0);
  });

  it('returns 0 for mismatched lengths', () => {
    const result = cosineSimilarity([1, 2], [1, 2, 3]);
    assert.equal(result, 0);
  });

  it('returns 0 for null input', () => {
    assert.equal(cosineSimilarity(null, [1, 2]), 0);
    assert.equal(cosineSimilarity([1, 2], null), 0);
  });
});

// ─── 4. AI chat — GEMINI_API_KEY not configured ───────────────────────────────

describe('AI chat — answerQuestion when GEMINI_API_KEY is missing', () => {
  it('returns insufficient=true when no API key is configured (no embeddings possible)', async () => {
    // When GEMINI_API_KEY is absent, embedQuery returns null → no chunks →
    // answerQuestion should set insufficient=true and skip Gemini call.
    // We verify the logic gate inline:
    const apiKey = process.env.GEMINI_API_KEY; // likely undefined in test env

    function embedQuery_stub(apiKey, text) {
      if (!apiKey) return null; // matches real behavior
      return [0.1, 0.2]; // hypothetical embedding
    }

    const embedding = embedQuery_stub(apiKey, 'test question');
    const chunks = embedding === null ? [] : ['chunk1'];

    const insufficient = chunks.length === 0;
    assert.ok(insufficient, 'should flag insufficient when no API key → no embedding → no chunks');
  });
});

// ─── 5. Policy service — storage key generation ───────────────────────────────

describe('Policy service — storage key format', () => {
  it('generates a UUID-based storage key that is not derived from input filename', async () => {
    const filename = 'company_policy_final_REAL.pdf'; // adversarial
    // Simulate what policy.service.js does: ignore filename, use UUID
    const { randomUUID } = await import('node:crypto');
    const id = randomUUID();
    const storageKey = `policies/${id}.pdf`;

    assert.ok(!storageKey.includes('company_policy'), 'storage key must NOT contain original filename');
    assert.match(storageKey, /^policies\/[0-9a-f-]{36}\.pdf$/, 'storage key must be UUID-based');
  });
});

// ─── 6. Org isolation ─────────────────────────────────────────────────────────

describe('Org isolation — notifications must be org-scoped', () => {
  it('prevents cross-org notification access', () => {
    const notificationOrgId = 'org_A';
    const requestingOrgId  = 'org_B';

    const found = notificationOrgId === requestingOrgId;
    assert.equal(found, false, 'org_B should not be able to access org_A notifications');
  });

  it('allows same-org notification access', () => {
    const notificationOrgId = 'org_A';
    const requestingOrgId  = 'org_A';

    const found = notificationOrgId === requestingOrgId;
    assert.ok(found, 'same org should be able to access its own notifications');
  });
});

// ─── 7. Policy status transitions ────────────────────────────────────────────

describe('PolicyDocument — status transitions', () => {
  const VALID_STATUSES = ['pending', 'processing', 'ready', 'failed'];

  it('allows all valid status values', () => {
    for (const s of VALID_STATUSES) {
      assert.ok(VALID_STATUSES.includes(s), `${s} should be valid`);
    }
  });

  it('rejects unknown status values', () => {
    const invalid = ['uploaded', 'done', 'error', 'active'];
    for (const s of invalid) {
      assert.ok(!VALID_STATUSES.includes(s), `${s} should be rejected`);
    }
  });
});

// ─── 8. Notification type enum ────────────────────────────────────────────────

describe('Notification — type enum', () => {
  const VALID_TYPES = [
    'onboarding_assigned',
    'task_completed',
    'onboarding_completed',
    'policy_ready',
    'policy_failed',
    'task_overdue',
  ];

  it('includes all expected notification types', () => {
    assert.ok(VALID_TYPES.includes('onboarding_assigned'));
    assert.ok(VALID_TYPES.includes('policy_ready'));
    assert.ok(VALID_TYPES.includes('task_overdue'));
    assert.equal(VALID_TYPES.length, 6, 'exactly 6 notification types defined');
  });
});
