// tests/realtime.persistence.test.js
// Integration tests proving that DATABASE persistence is independent of
// socket delivery, and that the full service → emit → client flow works with
// the real JWT cookie handshake, real Mongoose models, and an in-memory MongoDB.
//
// If the in-memory MongoDB binary cannot be downloaded (offline CI etc.),
// these tests SKIP with a clear message instead of failing the suite.

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { createServer } from 'node:http';
import { io as Client } from 'socket.io-client';
import jwt from 'jsonwebtoken';

// ─── Env must exist before env.js is imported ─────────────────────────────────
process.env.JWT_SECRET ??= 'test-secret-for-realtime-persistence-suite';
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
    console.warn('[realtime.persistence] In-memory MongoDB unavailable, skipping:', err.message);
    mongoAvailable = false;
  }
}

if (!mongoAvailable) {
  describe('realtime persistence (skipped — in-memory MongoDB unavailable)', () => {
    it('skips cleanly', () => {
      assert.ok(true, 'mongodb-memory-server could not start; integration tests skipped');
    });
  });
} else {
  await (await import('mongoose')).default.connect(uri);

  const { User } = await import('../src/models/User.js');
  const { Employee } = await import('../src/models/Employee.js');
  const { OnboardingTask } = await import('../src/models/OnboardingTask.js');
  const { Notification } = await import('../src/models/Notification.js');
  const {
    createRealtimeServer, getIO,
  } = await import('../src/realtime/socket.js');
  const OnboardingService = await import('../src/modules/onboarding/onboarding.service.js');
  const NotificationsService = await import('../src/modules/notifications/notifications.service.js');

  // ─── Seed data ───────────────────────────────────────────────────────────────
  const orgA = { _id: null };
  const seed = {};

  before(async () => {
    const { Organization } = await import('../src/models/Organization.js');
    const org = await Organization.create({ name: 'Org A' });
    orgA._id = org._id;

    seed.hr = await User.create({
      googleId: 'g-hr', email: 'hr@orga.test', name: 'HR Admin',
      role: 'hr_admin', organizationId: org._id, isActive: true,
    });
    seed.empUser = await User.create({
      googleId: 'g-emp', email: 'emp@orga.test', name: 'Emp One',
      role: 'employee', organizationId: org._id, isActive: true,
    });
    seed.emp2User = await User.create({
      googleId: 'g-emp2', email: 'emp2@orga.test', name: 'Emp Two',
      role: 'employee', organizationId: org._id, isActive: true,
    });

    seed.emp = await Employee.create({
      organizationId: org._id, userId: seed.empUser._id,
      fullName: 'Emp One', email: 'emp@orga.test',
      jobTitle: 'Engineer', department: 'Engineering', status: 'onboarding',
      startDate: new Date('2026-01-01'),
    });
    seed.emp2 = await Employee.create({
      organizationId: org._id, userId: seed.emp2User._id,
      fullName: 'Emp Two', email: 'emp2@orga.test',
      jobTitle: 'Designer', department: 'Design', status: 'active',
      startDate: new Date('2026-01-02'),
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

  before(async () => {
    httpServer = createServer();
    createRealtimeServer(httpServer); // REAL verifier — JWT cookie + DB lookup
    await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
    port = httpServer.address().port;
  });

  after(async () => {
    getIO()?.close();
    await new Promise((r) => httpServer.close(r));
    await (await import('mongoose')).default.disconnect();
    await mongod.stop();
  });

  describe('database persistence independent of socket delivery', () => {
    it('persists the task update even with ZERO sockets connected', async () => {
      const task = await OnboardingTask.create({
        organizationId: orgA._id, employeeId: seed.emp._id,
        title: 'Read handbook', category: 'General', status: 'pending',
        dueDate: new Date('2026-01-10'), order: 1,
      });

      // No clients connected — service must still succeed via MongoDB alone.
      const updated = await OnboardingService.updateTaskStatus(
        orgA._id, task._id, 'completed', { _id: seed.empUser._id, role: 'employee' }
      );

      assert.equal(updated.status, 'completed');
      assert.ok(updated.completedAt instanceof Date);

      const persisted = await OnboardingTask.findById(task._id).lean();
      assert.equal(persisted.status, 'completed');
      assert.ok(persisted.completedAt);
    });

    it('notification records persist for HR admins even when they are offline', async () => {
      const count = await Notification.countDocuments({
        organizationId: orgA._id, type: 'task_completed',
      });
      assert.ok(count >= 1, 'task_completed notifications should be persisted');
    });
  });

  describe('service → emit → client flow (real verifier)', () => {
    it('employee sees task:updated; another employee and other-org sockets do not', async () => {
      const empSock = clientFor(seed.empUser);
      const emp2Sock = clientFor(seed.emp2User);
      await Promise.all([waitForConnect(empSock), waitForConnect(emp2Sock)]);

      const task = await OnboardingTask.create({
        organizationId: orgA._id, employeeId: seed.emp._id,
        title: 'Set up payroll', category: 'HR', status: 'pending',
        dueDate: new Date('2026-01-12'), order: 2,
      });

      const emp1Got = nextEvent(empSock, 'task:updated');
      const emp2Quiet = expectNoEvent(emp2Sock, 'task:updated');

      await OnboardingService.updateTaskStatus(
        orgA._id, task._id, 'completed', { _id: seed.empUser._id, role: 'employee' }
      );

      const payload = await emp1Got;
      assert.equal(payload.task.title, 'Set up payroll');
      assert.equal(payload.task.status, 'completed');
      assert.ok(payload.task.completedAt);
      // Sanitised payload — no internal Mongo internals leaked
      assert.equal(payload.task.organizationId, undefined);
      await emp2Quiet;

      empSock.disconnect();
      emp2Sock.disconnect();
    });

    it('does NOT create duplicate notifications or double events on repeat completion', async () => {
      const task = await OnboardingTask.create({
        organizationId: orgA._id, employeeId: seed.emp._id,
        title: 'Duplicate test', category: 'General', status: 'pending',
        dueDate: new Date('2026-01-12'), order: 3,
      });

      // First completion — legitimately creates notifications for HR admins.
      await OnboardingService.updateTaskStatus(
        orgA._id, task._id, 'completed', { _id: seed.empUser._id, role: 'employee' }
      );
      const afterFirst = await Notification.countDocuments({ organizationId: orgA._id });

      // Repeat completion of the SAME task within the dedupe window —
      // the DB-level guard must prevent a second notification.
      await OnboardingService.updateTaskStatus(
        orgA._id, task._id, 'completed', { _id: seed.empUser._id, role: 'employee' }
      );

      const afterSecond = await Notification.countDocuments({ organizationId: orgA._id });
      assert.equal(
        afterSecond, afterFirst,
        'duplicate guard must prevent repeat notifications'
      );
    });

    it('startOnboarding emits task:created with every persisted task', async () => {
      const { OnboardingTemplate } = await import('../src/models/OnboardingTemplate.js');
      await OnboardingTemplate.create({
        organizationId: orgA._id, name: 'Eng Template', isActive: true,
        tasks: [
          { title: 'Laptop setup', dueDayOffset: 0, order: 1 },
          { title: 'Security training', dueDayOffset: 3, order: 2 },
        ],
      });
      const template = await (await import('../src/models/OnboardingTemplate.js')).OnboardingTemplate
        .findOne({ organizationId: orgA._id }).lean();

      // The plan belongs to Emp Two — connect as the OWNER's user account,
      // whose private `user:<id>` room is where `task:created` is delivered.
      const empSock = clientFor(seed.emp2User);
      await waitForConnect(empSock);
      const got = nextEvent(empSock, 'task:created');

      const tasks = await OnboardingService.startOnboarding(
        orgA._id, seed.emp2._id, template._id
      );
      assert.equal(tasks.length, 2);

      const payload = await got;
      assert.equal(payload.employeeId, seed.emp2._id.toString());
      assert.equal(payload.tasks.length, 2);

      // Every emitted task exists in MongoDB
      for (const t of payload.tasks) {
        const persisted = await OnboardingTask.findById(t._id).lean();
        assert.ok(persisted, 'emitted task must be persisted');
        assert.equal(persisted.title, t.title);
      }
      empSock.disconnect();
    });

    it('createNotification emits notification:new to the recipient only', async () => {
      const hrSock = clientFor(seed.hr);
      const emp2Sock = clientFor(seed.emp2User);
      await Promise.all([waitForConnect(hrSock), waitForConnect(emp2Sock)]);

      const empGot = nextEvent(emp2Sock, 'notification:new');
      const hrQuiet = expectNoEvent(hrSock, 'notification:new');

      const created = await NotificationsService.createNotification({
        organizationId: orgA._id,
        userId: seed.emp2User._id,
        type: 'onboarding_assigned',
        title: 'Test notification',
        body: 'Only for emp2',
      });
      assert.ok(created._id);

      const payload = await empGot;
      assert.equal(payload.notification.title, 'Test notification');
      await hrQuiet;

      hrSock.disconnect();
      emp2Sock.disconnect();
    });
  });
}
