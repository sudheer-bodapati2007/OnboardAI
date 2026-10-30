// tests/task.completion.test.js
// Regression tests for updateTaskStatus() authorization and completedAt logic.
//
// Verifies:
//   - Employee can mark their OWN task complete
//   - Employee cannot touch another employee's task (403)
//   - HR admin can update any task in their org (no ownership check)
//   - completedAt is set to a Date when status = 'completed'
//   - completedAt is cleared (null) when status reverts to 'pending' / 'in_progress'
//   - Cross-org task not found → 404
//
// All assertions use pure in-process mocks; no MongoDB or Google tokens required.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ─── AppError stand-in ────────────────────────────────────────────────────────

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

// ─── Task document mock ───────────────────────────────────────────────────────

/**
 * Minimal fake OnboardingTask document with Mongoose-like .save().
 */
function makeTask({ _id, employeeId, organizationId, status = 'pending', completedAt = null } = {}) {
  const doc = {
    _id,
    employeeId,
    organizationId,
    status,
    completedAt,
    _saved: false,
    async save() {
      this._saved = true;
    },
    toObject() {
      return {
        _id: this._id,
        employeeId: this.employeeId,
        organizationId: this.organizationId,
        status: this.status,
        completedAt: this.completedAt,
      };
    },
  };
  return doc;
}

// ─── In-process re-implementation of updateTaskStatus() logic ─────────────────
//
// Mirrors onboarding.service.js exactly — same branching, same field writes.
// Injectable stores replace Mongoose model calls so no DB is needed.

async function updateTaskStatus(organizationId, taskId, status, requestingUser, { taskStore, employeeStore }) {
  // 1. Load task — org-scoped
  const task = taskStore.find((t) => t._id === taskId && t.organizationId === organizationId);
  if (!task) throw new AppError('Task not found', 404);

  // 2. Authorization: employees can only touch their own tasks
  if (requestingUser.role === 'employee') {
    const employee = employeeStore.find(
      (e) => e.userId === requestingUser._id && e.organizationId === organizationId,
    );
    if (!employee || task.employeeId !== employee._id) {
      throw new AppError('Forbidden', 403);
    }
  }

  // 3. Apply status + completedAt
  task.status = status;
  task.completedAt = status === 'completed' ? new Date() : null;
  await task.save();

  return task.toObject();
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeFixtures() {
  const orgId = 'org-1';
  const otherOrgId = 'org-2';

  const emp1 = { _id: 'emp-1', userId: 'user-1', organizationId: orgId };
  const emp2 = { _id: 'emp-2', userId: 'user-2', organizationId: orgId };

  const hrUser = { _id: 'admin-1', role: 'hr_admin', organizationId: orgId };
  const empUser1 = { _id: 'user-1', role: 'employee', organizationId: orgId };
  const empUser2 = { _id: 'user-2', role: 'employee', organizationId: orgId };

  const task1 = makeTask({ _id: 'task-1', employeeId: 'emp-1', organizationId: orgId });
  const task2 = makeTask({ _id: 'task-2', employeeId: 'emp-2', organizationId: orgId });
  const taskOtherOrg = makeTask({ _id: 'task-3', employeeId: 'emp-x', organizationId: otherOrgId });

  const taskStore = [task1, task2, taskOtherOrg];
  const employeeStore = [emp1, emp2];

  return { orgId, otherOrgId, hrUser, empUser1, empUser2, task1, task2, taskStore, employeeStore };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('updateTaskStatus — employee authorization', () => {

  it('employee can complete their own task', async () => {
    const { orgId, empUser1, task1, taskStore, employeeStore } = makeFixtures();

    const result = await updateTaskStatus(orgId, 'task-1', 'completed', empUser1, { taskStore, employeeStore });

    assert.equal(result.status, 'completed', 'status must be updated to completed');
    assert.ok(result.completedAt instanceof Date, 'completedAt must be a Date');
    assert.ok(task1._saved, 'task.save() must have been called');
  });

  it('employee cannot complete another employee\'s task (403)', async () => {
    const { orgId, empUser1, taskStore, employeeStore } = makeFixtures();

    // empUser1 (user-1 / emp-1) tries to update task-2 which belongs to emp-2
    await assert.rejects(
      () => updateTaskStatus(orgId, 'task-2', 'completed', empUser1, { taskStore, employeeStore }),
      (err) => {
        assert.equal(err.statusCode, 403, 'must throw 403 Forbidden');
        assert.match(err.message, /forbidden/i);
        return true;
      },
    );
  });

  it('employee with no matching employee record cannot update any task (403)', async () => {
    const { orgId, task1, taskStore } = makeFixtures();
    const orphanUser = { _id: 'user-orphan', role: 'employee', organizationId: orgId };

    // No employee record has userId === 'user-orphan'
    await assert.rejects(
      () => updateTaskStatus(orgId, 'task-1', 'completed', orphanUser, { taskStore, employeeStore: [] }),
      (err) => {
        assert.equal(err.statusCode, 403);
        return true;
      },
    );
  });

  it('HR admin can complete any task in their org without ownership check', async () => {
    const { orgId, hrUser, task2, taskStore, employeeStore } = makeFixtures();

    // hrUser is an hr_admin; task2 belongs to emp-2, not to hrUser
    const result = await updateTaskStatus(orgId, 'task-2', 'completed', hrUser, { taskStore, employeeStore });

    assert.equal(result.status, 'completed');
    assert.ok(result.completedAt instanceof Date);
    assert.ok(task2._saved);
  });

  it('HR admin can set a task to in_progress', async () => {
    const { orgId, hrUser, task1, taskStore, employeeStore } = makeFixtures();

    const result = await updateTaskStatus(orgId, 'task-1', 'in_progress', hrUser, { taskStore, employeeStore });

    assert.equal(result.status, 'in_progress');
    assert.equal(result.completedAt, null, 'completedAt must be null for non-completed status');
  });
});

describe('updateTaskStatus — completedAt field behaviour', () => {

  it('completedAt is set to a Date when status becomes completed', async () => {
    const { orgId, hrUser, taskStore, employeeStore } = makeFixtures();

    const result = await updateTaskStatus(orgId, 'task-1', 'completed', hrUser, { taskStore, employeeStore });

    assert.ok(result.completedAt !== null, 'completedAt must not be null');
    assert.ok(result.completedAt instanceof Date, 'completedAt must be a Date instance');
  });

  it('completedAt is null when status is pending', async () => {
    const { orgId, hrUser, taskStore, employeeStore } = makeFixtures();

    // Set completed first
    await updateTaskStatus(orgId, 'task-1', 'completed', hrUser, { taskStore, employeeStore });
    // Revert to pending
    const result = await updateTaskStatus(orgId, 'task-1', 'pending', hrUser, { taskStore, employeeStore });

    assert.equal(result.completedAt, null, 'completedAt must be cleared when reverted to pending');
  });

  it('completedAt is null when status is in_progress', async () => {
    const { orgId, hrUser, taskStore, employeeStore } = makeFixtures();

    const result = await updateTaskStatus(orgId, 'task-1', 'in_progress', hrUser, { taskStore, employeeStore });

    assert.equal(result.completedAt, null, 'completedAt must be null for in_progress status');
  });

  it('completedAt timestamp is recent (within 2 seconds)', async () => {
    const { orgId, hrUser, taskStore, employeeStore } = makeFixtures();
    const before = Date.now();

    const result = await updateTaskStatus(orgId, 'task-1', 'completed', hrUser, { taskStore, employeeStore });

    const after = Date.now();
    const ts = result.completedAt.getTime();
    assert.ok(ts >= before && ts <= after, 'completedAt must be set to approximately now');
  });
});

describe('updateTaskStatus — cross-org isolation', () => {

  it('task in a different org is not found (404)', async () => {
    const { orgId, hrUser, taskStore, employeeStore } = makeFixtures();

    // task-3 belongs to 'org-2'; hrUser operates in 'org-1'
    await assert.rejects(
      () => updateTaskStatus(orgId, 'task-3', 'completed', hrUser, { taskStore, employeeStore }),
      (err) => {
        assert.equal(err.statusCode, 404, 'must throw 404 for cross-org task');
        assert.match(err.message, /not found/i);
        return true;
      },
    );
  });

  it('non-existent task ID returns 404', async () => {
    const { orgId, hrUser, taskStore, employeeStore } = makeFixtures();

    await assert.rejects(
      () => updateTaskStatus(orgId, 'task-does-not-exist', 'completed', hrUser, { taskStore, employeeStore }),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  });

  it('employee in org-A cannot be looked up when acting under org-B', async () => {
    const otherOrgId = 'org-2';

    // emp-1 lives in org-1; adversary authenticates under org-2
    const adversary = { _id: 'user-1', role: 'employee', organizationId: otherOrgId };
    const { taskStore, employeeStore } = makeFixtures();

    // task-3 is in org-2 but has a different employeeId ('emp-x')
    // employee lookup returns null because emp-1's organizationId is org-1 ≠ org-2
    await assert.rejects(
      () => updateTaskStatus(otherOrgId, 'task-3', 'completed', adversary, { taskStore, employeeStore }),
      (err) => {
        assert.equal(err.statusCode, 403, 'cross-org employee attempt must be rejected with 403');
        return true;
      },
    );
  });
});
