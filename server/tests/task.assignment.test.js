// tests/task.assignment.test.js
// Regression tests for flexible task assignment (HR adds a task to any
// employee at any lifecycle stage) and template task CRUD persistence.
//
// Covers:
//   - createTaskForEmployee persists a standalone pending task for an
//     employee whose onboarding is already COMPLETED, without touching the
//     employee record or any completed task (completed onboarding stays
//     completed).
//   - Realtime: task:created reaches the employee + HR rooms only;
//     dashboard:update reaches the org room; other-org sockets get nothing.
//   - Notification persisted for the employee only.
//   - Cross-org employeeId → 404 (organisation isolation).
//   - Invalid dueDate → 422; unknown employee → 404.
//   - requireHrAdmin rejects employee role (403) and allows hr_admin.
//   - Template task add / edit / delete persists in MongoDB; other
//     templates remain intact.
//
// Uses the same in-memory MongoDB + real socket verifier harness as
// realtime.persistence.test.js. Skips cleanly if the binary is unavailable.

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { createServer } from 'node:http';
import { io as Client } from 'socket.io-client';
import jwt from 'jsonwebtoken';

// ─── Env must exist before env.js is imported ─────────────────────────────────
process.env.JWT_SECRET ??= 'test-secret-for-task-assignment-suite';
process.env.CLIENT_URL ??= 'http://localhost:5173';

let MongoMemoryServer;
let mongoAvailable = true;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  mongoAvailable = false;
}

let mongod;
let uri;

if (mongoAvailable) {
  try {
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  } catch (err) {
    console.warn('[task.assignment] In-memory MongoDB unavailable, skipping:', err.message);
    mongoAvailable = false;
  }
}

if (!mongoAvailable) {
  describe('task assignment (skipped — in-memory MongoDB unavailable)', () => {
    it('skips cleanly', () => {
      assert.ok(true, 'mongodb-memory-server could not start; integration tests skipped');
    });
  });
} else {
  await (await import('mongoose')).default.connect(uri);

  const { Organization } = await import('../src/models/Organization.js');
  const { User } = await import('../src/models/User.js');
  const { Employee } = await import('../src/models/Employee.js');
  const { OnboardingTask } = await import('../src/models/OnboardingTask.js');
  const { OnboardingTemplate } = await import('../src/models/OnboardingTemplate.js');
  const { Notification } = await import('../src/models/Notification.js');
  const { createRealtimeServer, getIO } = await import('../src/realtime/socket.js');
  const OnboardingService = await import('../src/modules/onboarding/onboarding.service.js');
  const { requireHrAdmin } = await import('../src/middleware/auth.js');
  const { createTaskSchema } = await import('../src/modules/onboarding/onboarding.validation.js');

  // ─── Seed data ───────────────────────────────────────────────────────────────
  const seed = {};

  before(async () => {
    seed.orgA = await Organization.create({ name: 'Org A' });
    seed.orgB = await Organization.create({ name: 'Org B' });

    seed.hr = await User.create({
      googleId: 'g-hr', email: 'hr@orga.test', name: 'HR Admin',
      role: 'hr_admin', organizationId: seed.orgA._id, isActive: true,
    });
    seed.empUser = await User.create({
      googleId: 'g-emp', email: 'emp@orga.test', name: 'Emp One',
      role: 'employee', organizationId: seed.orgA._id, isActive: true,
    });
    seed.emp2User = await User.create({
      googleId: 'g-emp2', email: 'emp2@orga.test', name: 'Emp Two',
      role: 'employee', organizationId: seed.orgA._id, isActive: true,
    });
    seed.empUserB = await User.create({
      googleId: 'g-empb', email: 'empb@orgb.test', name: 'Emp B',
      role: 'employee', organizationId: seed.orgB._id, isActive: true,
    });

    // Employee whose onboarding is COMPLETED: all tasks completed long ago,
    // employee record is active. Nothing about this employee may change
    // when HR later assigns an additional task.
    seed.emp = await Employee.create({
      organizationId: seed.orgA._id, userId: seed.empUser._id,
      fullName: 'Emp One', email: 'emp@orga.test',
      jobTitle: 'Engineer', department: 'Engineering', status: 'active',
      startDate: new Date('2026-01-01'),
    });
    seed.completedTaskA = await OnboardingTask.create({
      organizationId: seed.orgA._id, employeeId: seed.emp._id,
      title: 'Sign contract', category: 'HR', status: 'completed',
      completedAt: new Date('2026-01-05T10:00:00Z'), order: 1,
    });
    seed.completedTaskB = await OnboardingTask.create({
      organizationId: seed.orgA._id, employeeId: seed.emp._id,
      title: 'Laptop setup', category: 'IT Setup', status: 'completed',
      completedAt: new Date('2026-01-06T10:00:00Z'), order: 2,
    });

    seed.emp2 = await Employee.create({
      organizationId: seed.orgA._id, userId: seed.emp2User._id,
      fullName: 'Emp Two', email: 'emp2@orga.test',
      jobTitle: 'Designer', department: 'Design', status: 'onboarding',
      startDate: new Date('2026-02-01'),
    });

    seed.empB = await Employee.create({
      organizationId: seed.orgB._id, userId: seed.empUserB._id,
      fullName: 'Emp B', email: 'empb@orgb.test',
      jobTitle: 'Analyst', department: 'Finance', status: 'active',
      startDate: new Date('2026-01-15'),
    });

    // Templates for the CRUD tests.
    seed.templateA = await OnboardingTemplate.create({
      organizationId: seed.orgA._id, name: 'Template A', roleTarget: 'Engineer',
      tasks: [
        { title: 'A task one', description: '', category: 'General', dueDayOffset: 0, order: 0 },
        { title: 'A task two', description: '', category: 'IT Setup', dueDayOffset: 1, order: 1 },
      ],
    });
    seed.templateB = await OnboardingTemplate.create({
      organizationId: seed.orgA._id, name: 'Template B', roleTarget: 'Designer',
      tasks: [{ title: 'B task one', description: '', category: 'HR', dueDayOffset: 0, order: 0 }],
    });
  });

  // ─── Realtime server + clients ───────────────────────────────────────────────
  let httpServer, port;
  const tokenFor = (user) =>
    'token=' + jwt.sign({ userId: user._id.toString(), role: user.role }, process.env.JWT_SECRET);

  function clientFor(user) {
    return Client(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Cookie: tokenFor(user) },
    });
  }

  const waitForConnect = (socket) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 3000);
    socket.once('connect', () => { clearTimeout(t); resolve(); });
    socket.once('connect_error', (e) => { clearTimeout(t); reject(e); });
  });

  const nextEvent = (socket, event, timeout = 3000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (p) => { clearTimeout(t); resolve(p); });
  });

  const expectNoEvent = (socket, event, quietMs = 400) => new Promise((resolve, reject) => {
    const t = setTimeout(resolve, quietMs);
    socket.once(event, () => { clearTimeout(t); reject(new Error(`unexpected ${event}`)); });
  });

  const waitFor = async (fn, timeoutMs = 3000) => {
    const start = Date.now();
    for (;;) {
      const value = await fn(); // resolves with the truthy value, not a flag
      if (value) return value;
      if (Date.now() - start > timeoutMs) return null;
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  before(async () => {
    httpServer = createServer();
    createRealtimeServer(httpServer);
    await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
    port = httpServer.address().port;
  });

  after(async () => {
    getIO()?.close();
    await new Promise((r) => httpServer.close(r));
    await (await import('mongoose')).default.disconnect();
    await mongod.stop();
  });

  // ─── HR assigns additional task after onboarding completion ─────────────────
  describe('createTaskForEmployee — assignment after onboarding completion', () => {

    it('persists a standalone pending task without touching the employee record or completed tasks', async () => {
      const empBefore = await Employee.findById(seed.emp._id).lean();
      const tasksBefore = await OnboardingTask.find({ employeeId: seed.emp._id }).lean();

      const task = await OnboardingService.createTaskForEmployee(
        seed.orgA._id,
        seed.emp._id,
        {
          title: 'Shadow the support team',
          description: 'One week of shadowing.',
          category: 'Training',
          dueDate: '2026-12-01',
        },
      );

      // New task: standalone, pending, correct ownership, order continues.
      assert.equal(task.status, 'pending');
      assert.equal(task.templateId, null, 'HR-assigned task must not belong to a template journey');
      assert.equal(String(task.organizationId), String(seed.orgA._id));
      assert.equal(String(task.employeeId), String(seed.emp._id));
      assert.equal(task.title, 'Shadow the support team');
      assert.equal(task.category, 'Training');
      assert.ok(task.dueDate instanceof Date, 'dueDate must be parsed to a Date');
      assert.equal(task.order, 3, 'order must continue after the last existing task');

      // Employee record untouched — completed onboarding stays completed.
      const empAfter = await Employee.findById(seed.emp._id).lean();
      assert.equal(empAfter.status, empBefore.status, 'employee status must not change');
      assert.deepEqual(
        { ...empBefore, updatedAt: undefined },
        { ...empAfter, updatedAt: undefined },
        'employee document must be unchanged',
      );

      // Existing completed tasks untouched (same ids, status, completedAt).
      const tasksAfter = await OnboardingTask.find({
        employeeId: seed.emp._id, _id: { $ne: task._id },
      }).lean();
      assert.equal(tasksAfter.length, tasksBefore.length);
      for (const before of tasksBefore) {
        const after = tasksAfter.find((t) => String(t._id) === String(before._id));
        assert.ok(after, 'existing task must still exist');
        assert.equal(after.status, 'completed');
        assert.equal(after.completedAt?.toISOString(), before.completedAt.toISOString());
      }
    });

    it('emits task:created to the employee and HR rooms only; other org receives nothing', async () => {
      const empSock = clientFor(seed.empUser);
      const emp2Sock = clientFor(seed.emp2User);
      const hrSock = clientFor(seed.hr);
      const orgBSock = clientFor(seed.empUserB);
      await Promise.all([
        waitForConnect(empSock), waitForConnect(emp2Sock),
        waitForConnect(hrSock), waitForConnect(orgBSock),
      ]);

      const empGot = nextEvent(empSock, 'task:created');
      const hrGot = nextEvent(hrSock, 'task:created');
      // dashboard:update goes to the whole org room on EVERY create —
      // register the listener before the first service call so it cannot be
      // missed, and assert the payload of that first emission.
      const dashGot = nextEvent(hrSock, 'dashboard:update');
      const orgBDashQuiet = expectNoEvent(orgBSock, 'dashboard:update');
      const orgBTaskQuiet = expectNoEvent(orgBSock, 'task:created');
      const emp2TaskQuiet = expectNoEvent(emp2Sock, 'task:created');

      const task = await OnboardingService.createTaskForEmployee(
        seed.orgA._id, seed.emp._id,
        { title: 'Realtime check task', description: '', category: 'General', dueDate: null },
      );

      const empPayload = await empGot;
      assert.equal(empPayload.employeeId, String(seed.emp._id));
      assert.equal(empPayload.tasks[0].title, 'Realtime check task');
      assert.equal(empPayload.tasks[0].status, 'pending');

      const hrPayload = await hrGot;
      assert.equal(hrPayload.employeeName, 'Emp One');
      assert.equal(hrPayload.tasks[0]._id, String(task._id));

      const dashPayload = await dashGot;
      assert.equal(dashPayload.reason, 'task_created');

      await orgBTaskQuiet;
      await emp2TaskQuiet;
      // orgB must not receive orgA's dashboard signal either.
      await orgBDashQuiet;

      empSock.disconnect(); emp2Sock.disconnect(); hrSock.disconnect(); orgBSock.disconnect();
    });

    it('persists a task_assigned notification for the employee only', async () => {
      const task = await OnboardingService.createTaskForEmployee(
        seed.orgA._id, seed.emp._id,
        { title: 'Notify me please', description: '', category: 'General', dueDate: null },
      );

      const found = await waitFor(() =>
        Notification.findOne({
          userId: seed.empUser._id,
          type: 'task_assigned',
          relatedTaskId: task._id,
        }).lean(),
      );
      assert.ok(found, 'employee must receive a persisted task_assigned notification');
      assert.equal(String(found.organizationId), String(seed.orgA._id));
      assert.equal(String(found.relatedEmployeeId), String(seed.emp._id));

      const emp2Notified = await Notification.countDocuments({
        userId: seed.emp2User._id,
        type: 'task_assigned',
        relatedTaskId: task._id,
      });
      assert.equal(emp2Notified, 0, 'other employees must NOT be notified');
    });

    it('rejects a cross-org employeeId with 404 (organisation isolation)', async () => {
      const beforeCount = await OnboardingTask.countDocuments({ employeeId: seed.empB._id });

      await assert.rejects(
        () => OnboardingService.createTaskForEmployee(
          seed.orgA._id,          // HR acts under org A…
          seed.empB._id,          // …but targets org B's employee
          { title: 'Sneaky task', description: '', category: 'General', dueDate: null },
        ),
        (err) => {
          assert.equal(err.statusCode, 404);
          assert.match(err.message, /not found/i);
          return true;
        },
      );

      const afterCount = await OnboardingTask.countDocuments({ employeeId: seed.empB._id });
      assert.equal(afterCount, beforeCount, 'no task may be created for the cross-org employee');
    });

    it('rejects an invalid dueDate with 422', async () => {
      await assert.rejects(
        () => OnboardingService.createTaskForEmployee(
          seed.orgA._id, seed.emp._id,
          { title: 'Bad date task', description: '', category: 'General', dueDate: 'not-a-date' },
        ),
        (err) => {
          assert.equal(err.statusCode, 422);
          assert.match(err.message, /due date/i);
          return true;
        },
      );
    });

    it('rejects an unknown employeeId with 404', async () => {
      await assert.rejects(
        () => OnboardingService.createTaskForEmployee(
          seed.orgA._id, '000000000000000000000000',
          { title: 'Ghost task', description: '', category: 'General', dueDate: null },
        ),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
    });
  });

  // ─── Route authorization ─────────────────────────────────────────────────────
  describe('requireHrAdmin — role authorization for task assignment', () => {

    function runMiddleware(mw, req) {
      return new Promise((resolve) => {
        const res = {};
        mw(req, res, (...args) => resolve(args));
      });
    }

    it('rejects an employee role with 403', async () => {
      const [err] = await runMiddleware(requireHrAdmin, {
        user: { _id: seed.empUser._id, role: 'employee', organizationId: seed.orgA._id },
      });
      assert.ok(err instanceof Error, 'employee must not pass requireHrAdmin');
      assert.equal(err.statusCode, 403);
    });

    it('allows hr_admin through', async () => {
      const args = await runMiddleware(requireHrAdmin, {
        user: { _id: seed.hr._id, role: 'hr_admin', organizationId: seed.orgA._id },
      });
      assert.deepEqual(args, [], 'hr_admin must pass with no error');
    });

    it('unauthenticated request is rejected with 401', async () => {
      const [err] = await runMiddleware(requireHrAdmin, {});
      assert.equal(err.statusCode, 401);
    });
  });

  // ─── Template task CRUD ──────────────────────────────────────────────────────
  describe('template task add / edit / delete (MongoDB persistence)', () => {

    it('adds a task to an existing template and persists it', async () => {
      const tasks = [
        ...(await OnboardingTemplate.findById(seed.templateA._id)).tasks.map((t) => t.toObject()),
        { title: 'Brand new task', description: 'Added by HR', category: 'Compliance', dueDayOffset: 5, order: 2 },
      ];
      const updated = await OnboardingService.updateTemplate(seed.orgA._id, seed.templateA._id, { tasks });

      assert.equal(updated.tasks.length, 3);
      const added = updated.tasks.find((t) => t.title === 'Brand new task');
      assert.ok(added, 'new task must be persisted');
      assert.equal(added.category, 'Compliance');

      const reloaded = (await OnboardingTemplate.findById(seed.templateA._id).lean()).tasks;
      assert.ok(reloaded.some((t) => t.title === 'Brand new task'), 'must persist in MongoDB');
    });

    it('edits an existing template task and persists the change', async () => {
      const template = await OnboardingTemplate.findById(seed.templateA._id).lean();
      const tasks = template.tasks.map((t) =>
        t.title === 'A task one'
          ? { ...t, title: 'A task one (edited)', description: 'Updated description' }
          : t.toObject?.() ?? t,
      );
      await OnboardingService.updateTemplate(seed.orgA._id, seed.templateA._id, { tasks });

      const reloaded = (await OnboardingTemplate.findById(seed.templateA._id).lean()).tasks;
      const edited = reloaded.find((t) => t.title === 'A task one (edited)');
      assert.ok(edited, 'edited title must be persisted');
      assert.equal(edited.description, 'Updated description');
      assert.ok(!reloaded.some((t) => t.title === 'A task one'), 'old title must be gone');
    });

    it('deletes a task from a template; remaining tasks and OTHER templates stay intact', async () => {
      const template = await OnboardingTemplate.findById(seed.templateA._id).lean();
      const tasks = template.tasks.filter((t) => t.title !== 'A task one (edited)')
        .map((t) => t.toObject?.() ?? t);
      const updated = await OnboardingService.updateTemplate(seed.orgA._id, seed.templateA._id, { tasks });

      assert.equal(updated.tasks.length, 2, 'one task must have been removed');
      assert.ok(updated.tasks.some((t) => t.title === 'A task two'), 'remaining task stays');
      assert.ok(updated.tasks.some((t) => t.title === 'Brand new task'), 'remaining task stays');

      // Other templates untouched.
      const templateB = (await OnboardingTemplate.findById(seed.templateB._id).lean()).tasks;
      assert.equal(templateB.length, 1);
      assert.equal(templateB[0].title, 'B task one', 'template B must remain intact');
    });

    it('cross-org template update returns 404', async () => {
      await assert.rejects(
        () => OnboardingService.updateTemplate(
          seed.orgB._id, seed.templateA._id, { name: 'Hijacked' },
        ),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
      const unchanged = await OnboardingTemplate.findById(seed.templateA._id).lean();
      assert.equal(unchanged.name, 'Template A', 'template must be unchanged');
    });

    it('updateTemplate with an unknown id returns 404', async () => {
      await assert.rejects(
        () => OnboardingService.updateTemplate(
          seed.orgA._id, '000000000000000000000000', { name: 'Nope' },
        ),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
    });
  });

  // ─── Validation schema ───────────────────────────────────────────────────────
  describe('createTaskSchema validation', () => {

    it('rejects an empty title', () => {
      assert.throws(() => createTaskSchema.parse({ title: '' }));
      assert.throws(() => createTaskSchema.parse({}));
    });

    it('applies defaults for optional fields', () => {
      const parsed = createTaskSchema.parse({ title: 'Valid task' });
      assert.equal(parsed.description, '');
      assert.equal(parsed.category, 'General');
    });

    it('accepts an optional ISO dueDate string', () => {
      const parsed = createTaskSchema.parse({ title: 'Valid task', dueDate: '2026-12-01' });
      assert.equal(parsed.dueDate, '2026-12-01');
    });
  });
}
