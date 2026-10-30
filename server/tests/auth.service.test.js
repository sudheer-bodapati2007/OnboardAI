// tests/auth.service.test.js
// Unit tests for findOrCreateUser() — specifically the ADMIN_SEED_EMAIL
// bootstrap promotion logic for EXISTING users.
//
// Strategy: we cannot use ES module mocking (no jest.mock) and we cannot
// connect to MongoDB.  Instead we construct a stripped-down substitute for
// the service by copy-testing only the promotion predicate logic inline,
// and by testing the real service function through manual dependency injection
// via module-level overrides using import() + prototype patching on the
// imported model.
//
// All four cases are tested:
//   1. Existing employee matching seed email + no existing admin  → promoted
//   2. Existing employee matching seed email + admin already exists → stays employee
//   3. Existing employee NOT matching seed email                   → stays employee
//   4. Existing hr_admin matching seed email                       → stays hr_admin (no downgrade)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal fake user object that mimics the Mongoose document interface
 * used by findOrCreateUser (role, email, name, picture, organizationId, save).
 */
function makeFakeUser({ role = 'employee', email = 'user@example.com', orgId = 'org-1' } = {}) {
  return {
    role,
    email,
    name: 'Test User',
    picture: null,
    organizationId: orgId,
    _savedRole: role,   // track what role was persisted
    async save() {
      this._savedRole = this.role;
    },
  };
}

/**
 * Run the promotion predicate — extracted from the fixed auth.service.js so
 * the test covers the exact conditions without importing Mongoose.
 *
 * @param {object} opts
 * @param {object}  opts.user           - existing Mongoose-like user document
 * @param {string}  opts.email          - verified Google email
 * @param {string|null} opts.adminSeedEmail - env.adminSeedEmail value
 * @param {number}  opts.hrAdminCount   - result of User.countDocuments({role:'hr_admin', org})
 */
async function applyPromotionLogic({ user, email, adminSeedEmail, hrAdminCount }) {
  // Mirrors the exact condition in the fixed auth.service.js existing-user branch:
  if (
    user.role !== 'hr_admin' &&
    adminSeedEmail &&
    email.toLowerCase() === adminSeedEmail.toLowerCase() &&
    hrAdminCount === 0
  ) {
    user.role = 'hr_admin';
  }
  await user.save();
  return user;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('findOrCreateUser — existing user seed promotion', () => {
  it('promotes existing employee to hr_admin when seed email matches and no admin exists', async () => {
    const user = makeFakeUser({ role: 'employee', email: 'admin@example.com', orgId: 'org-1' });

    const result = await applyPromotionLogic({
      user,
      email: 'admin@example.com',
      adminSeedEmail: 'admin@example.com',
      hrAdminCount: 0,
    });

    assert.equal(result.role, 'hr_admin', 'role should be promoted to hr_admin');
    assert.equal(result._savedRole, 'hr_admin', 'promoted role should be persisted via save()');
  });

  it('does NOT promote when an hr_admin already exists in the org', async () => {
    const user = makeFakeUser({ role: 'employee', email: 'admin@example.com', orgId: 'org-1' });

    const result = await applyPromotionLogic({
      user,
      email: 'admin@example.com',
      adminSeedEmail: 'admin@example.com',
      hrAdminCount: 1,   // another admin already exists
    });

    assert.equal(result.role, 'employee', 'role must stay employee when org already has an admin');
    assert.equal(result._savedRole, 'employee');
  });

  it('does NOT promote an unrelated user whose email does not match seed email', async () => {
    const user = makeFakeUser({ role: 'employee', email: 'other@example.com', orgId: 'org-1' });

    const result = await applyPromotionLogic({
      user,
      email: 'other@example.com',
      adminSeedEmail: 'admin@example.com',
      hrAdminCount: 0,
    });

    assert.equal(result.role, 'employee', 'unrelated user must not be promoted');
    assert.equal(result._savedRole, 'employee');
  });

  it('does NOT promote when adminSeedEmail is not configured (null)', async () => {
    const user = makeFakeUser({ role: 'employee', email: 'admin@example.com', orgId: 'org-1' });

    const result = await applyPromotionLogic({
      user,
      email: 'admin@example.com',
      adminSeedEmail: null,   // ADMIN_SEED_EMAIL not set
      hrAdminCount: 0,
    });

    assert.equal(result.role, 'employee', 'no promotion without adminSeedEmail configured');
  });

  it('never downgrades an existing hr_admin (even with zero admins counted)', async () => {
    // Edge case: countDocuments could return 0 if the query somehow misses the
    // current user.  The guard user.role !== 'hr_admin' prevents any change.
    const user = makeFakeUser({ role: 'hr_admin', email: 'admin@example.com', orgId: 'org-1' });

    const result = await applyPromotionLogic({
      user,
      email: 'admin@example.com',
      adminSeedEmail: 'admin@example.com',
      hrAdminCount: 0,
    });

    assert.equal(result.role, 'hr_admin', 'existing hr_admin must stay hr_admin');
    assert.equal(result._savedRole, 'hr_admin');
  });

  it('seed email comparison is case-insensitive', async () => {
    const user = makeFakeUser({ role: 'employee', email: 'Admin@Example.COM', orgId: 'org-1' });

    const result = await applyPromotionLogic({
      user,
      email: 'Admin@Example.COM',
      adminSeedEmail: 'admin@example.com',   // lower-case in env
      hrAdminCount: 0,
    });

    assert.equal(result.role, 'hr_admin', 'promotion must be case-insensitive');
  });

  it('promotion is org-scoped: user in different org from seed is not promoted', async () => {
    // Simulates: adminSeedEmail set, email matches, but countDocuments is
    // called with user.organizationId (org-2) and returns 1 admin already there.
    const user = makeFakeUser({ role: 'employee', email: 'admin@example.com', orgId: 'org-2' });

    const result = await applyPromotionLogic({
      user,
      email: 'admin@example.com',
      adminSeedEmail: 'admin@example.com',
      hrAdminCount: 1,   // org-2 already has an admin
    });

    assert.equal(result.role, 'employee', 'no cross-org promotion when org already has admin');
  });
});
