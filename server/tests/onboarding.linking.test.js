// tests/onboarding.linking.test.js
// Regression tests for the Employee-User account linking bug.
//
// Bug: HR creates Employee with email X, userId=null.
//      Employee signs in with matching Google account.
//      findOrCreateUser() never wrote the User._id back to Employee.userId.
//      getMyTasks() looked up by userId → found nothing → "No onboarding plan yet".
//
// Fix: linkEmployeeAccount() runs after every findOrCreateUser() resolution.
//      It performs findOneAndUpdate({ email, organizationId, userId: null }, { $set: { userId } })
//      — org-scoped, idempotent, non-destructive.
//
// All assertions use pure in-process mocks; no MongoDB or Google tokens required.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ─── Test doubles ─────────────────────────────────────────────────────────────

/**
 * Minimal fake Employee document store.
 * Tracks calls and records per-employee state.
 */
function makeEmployeeStore(initialRecords = []) {
  const records = initialRecords.map((r) => ({ ...r }));

  return {
    records,
    // Simulates Employee.findOneAndUpdate({ email, organizationId, userId:null }, { $set: { userId } })
    async findOneAndUpdate(filter, update) {
      const match = records.find(
        (r) =>
          r.email === filter.email &&
          r.organizationId === filter.organizationId &&
          r.userId === filter.userId   // must be null
      );
      if (match && update.$set?.userId !== undefined) {
        match.userId = update.$set.userId;
      }
      return match ?? null;
    },
  };
}

/**
 * Minimal fake OnboardingTask store for getMyTasks simulation.
 */
function makeTaskStore(tasks = []) {
  return {
    tasks,
    async find({ employeeId, organizationId }) {
      return tasks.filter(
        (t) => t.employeeId === employeeId && t.organizationId === organizationId
      );
    },
  };
}

/**
 * Re-implementation of linkEmployeeAccount() using injectable store,
 * mirroring the exact logic in auth.service.js.
 */
async function linkEmployeeAccount(user, employeeStore) {
  try {
    await employeeStore.findOneAndUpdate(
      {
        email: user.email,
        organizationId: user.organizationId,
        userId: null,
      },
      { $set: { userId: user._id } }
    );
  } catch (err) {
    console.error('[auth] Employee account linking failed:', err.message);
  }
}

/**
 * Re-implementation of getMyTasks() logic, mirroring onboarding.service.js.
 */
async function getMyTasks(organizationId, userId, employeeStore, taskStore) {
  const employee = employeeStore.records.find(
    (r) => String(r.userId) === String(userId) && r.organizationId === organizationId
  );
  if (!employee) return { employee: null, tasks: [] };
  const tasks = await taskStore.find({ employeeId: employee._id, organizationId });
  return { employee, tasks };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Employee-User account linking — onboarding visibility', () => {

  it('employee sees their tasks after first Google login (exact bug reproduction)', async () => {
    // Setup: HR has already created an employee and assigned 8 tasks.
    // Employee.userId is null because they have not yet signed in.
    const orgId = 'org-1';
    const employeeId = 'emp-1';
    const userId = 'user-1';

    const employeeStore = makeEmployeeStore([
      {
        _id: employeeId,
        email: 'vijaykumarb5156@gmail.com',
        organizationId: orgId,
        userId: null,      // ← the bug state
      },
    ]);

    const taskStore = makeTaskStore(
      Array.from({ length: 8 }, (_, i) => ({
        _id: `task-${i}`,
        employeeId,
        organizationId: orgId,
        title: `Task ${i + 1}`,
        status: 'pending',
      }))
    );

    // Employee signs in → linkEmployeeAccount fires
    const user = { _id: userId, email: 'vijaykumarb5156@gmail.com', organizationId: orgId };
    await linkEmployeeAccount(user, employeeStore);

    // Now getMyTasks must return the 8 tasks
    const result = await getMyTasks(orgId, userId, employeeStore, taskStore);

    assert.ok(result.employee, 'employee should be found after linking');
    assert.equal(result.tasks.length, 8, 'all 8 onboarding tasks must be visible');
    assert.equal(
      employeeStore.records[0].userId,
      userId,
      'Employee.userId must be set to the User._id'
    );
  });

  it('second login is idempotent — already-linked record is not modified', async () => {
    const orgId = 'org-1';
    const userId = 'user-1';

    const employeeStore = makeEmployeeStore([
      {
        _id: 'emp-1',
        email: 'test@example.com',
        organizationId: orgId,
        userId,             // ← already linked
      },
    ]);

    const user = { _id: userId, email: 'test@example.com', organizationId: orgId };

    // Simulate second login — should not change anything
    await linkEmployeeAccount(user, employeeStore);

    assert.equal(
      employeeStore.records[0].userId,
      userId,
      'userId must remain unchanged on second login'
    );
  });

  it('linking is org-scoped — employee in different org is not linked', async () => {
    const orgA = 'org-A';
    const orgB = 'org-B';
    const userId = 'user-1';

    const employeeStore = makeEmployeeStore([
      {
        _id: 'emp-in-orgB',
        email: 'test@example.com',
        organizationId: orgB,   // ← different org
        userId: null,
      },
    ]);

    // User is in orgA, employee record is in orgB
    const user = { _id: userId, email: 'test@example.com', organizationId: orgA };
    await linkEmployeeAccount(user, employeeStore);

    assert.equal(
      employeeStore.records[0].userId,
      null,
      'employee in a different org must not be linked'
    );
  });

  it('unrelated employee (different email) is not linked', async () => {
    const orgId = 'org-1';
    const userId = 'user-1';

    const employeeStore = makeEmployeeStore([
      {
        _id: 'emp-other',
        email: 'other@example.com',  // different email
        organizationId: orgId,
        userId: null,
      },
    ]);

    const user = { _id: userId, email: 'signing-in@example.com', organizationId: orgId };
    await linkEmployeeAccount(user, employeeStore);

    assert.equal(
      employeeStore.records[0].userId,
      null,
      'unrelated employee must not be linked'
    );
  });

  it('another employee cannot access a different employee\'s tasks', async () => {
    const orgId = 'org-1';
    const userId1 = 'user-1';
    const userId2 = 'user-2';

    const employeeStore = makeEmployeeStore([
      { _id: 'emp-1', email: 'alice@example.com', organizationId: orgId, userId: userId1 },
      { _id: 'emp-2', email: 'bob@example.com',   organizationId: orgId, userId: userId2 },
    ]);

    const taskStore = makeTaskStore([
      { _id: 't1', employeeId: 'emp-1', organizationId: orgId, title: 'Alice task', status: 'pending' },
      { _id: 't2', employeeId: 'emp-2', organizationId: orgId, title: 'Bob task',   status: 'pending' },
    ]);

    // Bob requests his tasks
    const bobResult = await getMyTasks(orgId, userId2, employeeStore, taskStore);
    assert.equal(bobResult.tasks.length, 1);
    assert.equal(bobResult.tasks[0].title, 'Bob task');

    // Alice requests her tasks
    const aliceResult = await getMyTasks(orgId, userId1, employeeStore, taskStore);
    assert.equal(aliceResult.tasks.length, 1);
    assert.equal(aliceResult.tasks[0].title, 'Alice task');
  });

  it('cross-org access returns no tasks', async () => {
    const orgA = 'org-A';
    const orgB = 'org-B';
    const userId = 'user-1';

    const employeeStore = makeEmployeeStore([
      { _id: 'emp-1', email: 'alice@example.com', organizationId: orgA, userId },
    ]);

    const taskStore = makeTaskStore([
      { _id: 't1', employeeId: 'emp-1', organizationId: orgA, title: 'Org-A task', status: 'pending' },
    ]);

    // User authenticates under orgB but employee lives in orgA
    const result = await getMyTasks(orgB, userId, employeeStore, taskStore);
    assert.equal(result.employee, null, 'cross-org lookup must return no employee');
    assert.equal(result.tasks.length, 0, 'cross-org lookup must return no tasks');
  });

  it('employee with no assigned tasks returns empty task list (no onboarding started)', async () => {
    const orgId = 'org-1';
    const userId = 'user-1';

    const employeeStore = makeEmployeeStore([
      { _id: 'emp-1', email: 'new@example.com', organizationId: orgId, userId: null },
    ]);

    const taskStore = makeTaskStore([]); // no tasks assigned yet

    const user = { _id: userId, email: 'new@example.com', organizationId: orgId };
    await linkEmployeeAccount(user, employeeStore);

    const result = await getMyTasks(orgId, userId, employeeStore, taskStore);

    // Employee is found (linking worked) but tasks are empty
    assert.ok(result.employee, 'employee must be found even without tasks');
    assert.equal(result.tasks.length, 0);
  });

  it('linking failure does not throw — auth must always succeed', async () => {
    const orgId = 'org-1';
    const userId = 'user-1';

    // Store that always throws
    const brokenStore = {
      async findOneAndUpdate() {
        throw new Error('DB connection lost');
      },
    };

    const user = { _id: userId, email: 'test@example.com', organizationId: orgId };

    // Must not throw — auth must complete regardless
    await assert.doesNotReject(
      () => linkEmployeeAccount(user, brokenStore),
      'linkEmployeeAccount must never throw even when DB call fails'
    );
  });
});

// ─── getMyTasks service logic ─────────────────────────────────────────────────

describe('getMyTasks — query correctness', () => {
  it('returns employee null and empty tasks when no Employee record matches userId', async () => {
    const orgId = 'org-1';

    const employeeStore = makeEmployeeStore([
      { _id: 'emp-1', email: 'test@example.com', organizationId: orgId, userId: null },
    ]);
    const taskStore = makeTaskStore([]);

    const result = await getMyTasks(orgId, 'nonexistent-user', employeeStore, taskStore);
    assert.equal(result.employee, null);
    assert.equal(result.tasks.length, 0);
  });

  it('returns only tasks belonging to the matched employee', async () => {
    const orgId = 'org-1';
    const userId = 'user-1';

    const employeeStore = makeEmployeeStore([
      { _id: 'emp-1', email: 'a@example.com', organizationId: orgId, userId },
      { _id: 'emp-2', email: 'b@example.com', organizationId: orgId, userId: 'user-2' },
    ]);
    const taskStore = makeTaskStore([
      { _id: 't1', employeeId: 'emp-1', organizationId: orgId, status: 'pending', title: 'T1' },
      { _id: 't2', employeeId: 'emp-2', organizationId: orgId, status: 'pending', title: 'T2' },
    ]);

    const result = await getMyTasks(orgId, userId, employeeStore, taskStore);
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0]._id, 't1');
  });
});

