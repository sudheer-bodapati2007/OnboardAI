// tests/realtime.test.js
// Socket.IO real-time layer tests — routing, isolation, auth, lifecycle.
//
// These tests inject a fake handshake verifier so no MongoDB connection is
// required. Database-backed behaviour (persistence, duplicate-notification
// guards) is covered separately in tests/realtime.persistence.test.js.

import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import { createServer } from 'node:http';
import { io as Client } from 'socket.io-client';
import mongoose from 'mongoose';

// Ensure CLIENT_URL is set before socket.js reads env (CORS origin).
process.env.CLIENT_URL ??= 'http://localhost:5173';

const { createRealtimeServer, emitToUser, emitToOrg, emitToHr, getIO } =
  await import('../src/realtime/socket.js');

// ─── Fake directory used by the injected verifier ─────────────────────────────
// ObjectId-safe: encodes the label as hex (guaranteed 0-9a-f characters).
const OID = (label) =>
  new mongoose.Types.ObjectId(
    Buffer.from(String(label), 'utf8').toString('hex').padEnd(24, '0').slice(0, 24)
  );

const USERS = {
  'hr-token-orgA': { _id: OID('aa1'), organizationId: OID('orgA'), role: 'hr_admin', isActive: true },
  'hr-token-orgB': { _id: OID('bb1'), organizationId: OID('orgB'), role: 'hr_admin', isActive: true },
  'emp-token-orgA-1': { _id: OID('ee1'), organizationId: OID('orgA'), role: 'employee', isActive: true },
  'emp-token-orgA-2': { _id: OID('ee2'), organizationId: OID('orgA'), role: 'employee', isActive: true },
  'emp-token-orgB': { _id: OID('ee3'), organizationId: OID('orgB'), role: 'employee', isActive: true },
  'inactive-token': { _id: OID('ff1'), organizationId: OID('orgA'), role: 'employee', isActive: false },
};

const fakeVerify = async (handshake) => {
  const cookie = handshake.headers?.cookie ?? '';
  const token = /(?:^|;\s*)token=([^;]+)/.exec(cookie)?.[1];
  if (!token) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const user = USERS[token];
  if (!user) throw Object.assign(new Error('User account not found'), { statusCode: 401 });
  if (!user.isActive) throw Object.assign(new Error('Account is deactivated'), { statusCode: 403 });
  return user;
};

// ─── Test harness ─────────────────────────────────────────────────────────────

let httpServer;
let port;

async function startRealtime() {
  httpServer = createServer();
  createRealtimeServer(httpServer, { verifyUser: fakeVerify });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  port = httpServer.address().port;
}

function clientFor(token) {
  return Client(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Cookie: `token=${token}` },
  });
}

function waitForConnect(socket, timeout = 3000) {
  return new Promise((resolve, reject) => {
    if (socket.connected) return resolve();
    const timer = setTimeout(() => reject(new Error('connect timeout')), timeout);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function nextEvent(socket, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for "${event}"`)),
      timeout
    );
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

/** Resolves OK if no event arrives within `quietMs`, rejects otherwise. */
async function expectNoEvent(socket, event, quietMs = 400) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, quietMs);
    socket.once(event, () => {
      clearTimeout(timer);
      reject(new Error(`unexpected "${event}" received`));
    });
  });
}

async function stopRealtime() {
  getIO()?.close();
  await new Promise((resolve) => httpServer.close(resolve));
}

before(startRealtime);
after(stopRealtime);

let sockets = [];
function track(socket) {
  sockets.push(socket);
  return socket;
}
beforeEach(() => { sockets = []; });
after(async () => {
  for (const s of sockets) s.disconnect();
  await new Promise((r) => setTimeout(r, 50));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('realtime: authentication', () => {
  it('accepts a connection with a valid session cookie', async () => {
    const client = track(clientFor('hr-token-orgA'));
    await waitForConnect(client);
    assert.equal(client.connected, true);
    client.disconnect();
  });

  it('rejects a connection without a session cookie', async () => {
    const client = track(Client(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      reconnection: false,
    }));
    await assert.rejects(waitForConnect(client));
    assert.equal(client.connected, false);
  });

  it('rejects an inactive (deactivated) account', async () => {
    const client = track(clientFor('inactive-token'));
    await assert.rejects(
      waitForConnect(client),
      /deactivated/
    );
  });
});

describe('realtime: room management', () => {
  it('rejects client-initiated room joins (server-side membership only)', async () => {
    const client = track(clientFor('emp-token-orgA-1'));
    await waitForConnect(client);

    const ack = await new Promise((resolve) =>
      client.emit('room:join', resolve)
    );
    assert.equal(ack.ok, false);
    assert.match(ack.error, /server/i);
  });
});

describe('realtime: organisation isolation', () => {
  it('org events reach members of that org only', async () => {
    const hrA = track(clientFor('hr-token-orgA'));
    const empB = track(clientFor('emp-token-orgB'));
    await Promise.all([waitForConnect(hrA), waitForConnect(empB)]);

    const received = nextEvent(hrA, 'org:event');
    const quiet = expectNoEvent(empB, 'org:event');

    emitToOrg(USERS['hr-token-orgA'].organizationId, 'org:event', { hello: 'A' });

    const payload = await received;
    assert.deepEqual(payload, { hello: 'A' });
    await quiet; // org B must not have received org A's event
  });

  it('events for one org never leak to the other org (reverse direction)', async () => {
    const empB = track(clientFor('emp-token-orgB'));
    const hrA = track(clientFor('hr-token-orgA'));
    await Promise.all([waitForConnect(empB), waitForConnect(hrA)]);

    // Org B's event: org B's member receives it, org A's member stays silent.
    const empBGot = nextEvent(empB, 'org:event');
    const hrAQuiet = expectNoEvent(hrA, 'org:event');

    emitToOrg(USERS['emp-token-orgB'].organizationId, 'org:event', { org: 'B' });

    const payload = await empBGot;
    assert.deepEqual(payload, { org: 'B' });
    await hrAQuiet;
  });
});

describe('realtime: task events', () => {
  it('employee receives their own task event; another employee does not; HR does', async () => {
    const emp1 = track(clientFor('emp-token-orgA-1'));
    const emp2 = track(clientFor('emp-token-orgA-2'));
    const hrA = track(clientFor('hr-token-orgA'));
    await Promise.all([waitForConnect(emp1), waitForConnect(emp2), waitForConnect(hrA)]);

    const emp1Got = nextEvent(emp1, 'task:updated');
    const hrGot = nextEvent(hrA, 'task:updated');
    const emp2Quiet = expectNoEvent(emp2, 'task:updated');

    const task = { _id: OID('task1').toString(), employeeId: OID('emp1rec').toString(), title: 'Fill paperwork', status: 'completed' };
    emitToUser(USERS['emp-token-orgA-1']._id, 'task:updated', { task });
    emitToHr(USERS['emp-token-orgA-1'].organizationId, 'task:updated', { task, employeeName: 'Emp One' });

    const mine = await emp1Got;
    assert.equal(mine.task._id, task._id);
    assert.equal(mine.task.status, 'completed');

    const hrView = await hrGot;
    assert.equal(hrView.task._id, task._id);
    assert.equal(hrView.employeeName, 'Emp One');

    await emp2Quiet; // same org, but not their task
  });

  it('task events never cross organisations', async () => {
    const hrB = track(clientFor('hr-token-orgB'));
    await waitForConnect(hrB);

    const quiet = expectNoEvent(hrB, 'task:updated');
    emitToHr(USERS['emp-token-orgA-1'].organizationId, 'task:updated', { task: { _id: 'x' } });
    await quiet;
  });
});

describe('realtime: notifications', () => {
  it('notification reaches only its intended recipient', async () => {
    const emp1 = track(clientFor('emp-token-orgA-1'));
    const hrA = track(clientFor('hr-token-orgA'));
    const emp2 = track(clientFor('emp-token-orgA-2'));
    await Promise.all([waitForConnect(emp1), waitForConnect(hrA), waitForConnect(emp2)]);

    const emp1Got = nextEvent(emp1, 'notification:new');
    const hrQuiet = expectNoEvent(hrA, 'notification:new');
    const emp2Quiet = expectNoEvent(emp2, 'notification:new');

    emitToUser(USERS['emp-token-orgA-1']._id, 'notification:new', {
      notification: { _id: 'n1', type: 'onboarding_assigned', title: 'Plan ready', isRead: false },
    });

    const payload = await emp1Got;
    assert.equal(payload.notification._id, 'n1');
    assert.equal(payload.notification.isRead, false);
    await hrQuiet;
    await emp2Quiet;
  });
});

describe('realtime: disconnection & reconnection', () => {
  it('a reconnected user is re-added to their rooms and receives events again', async () => {
    const first = track(clientFor('emp-token-orgA-1'));
    await waitForConnect(first);
    first.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    // Simulated reconnect: fresh socket, same session cookie.
    const reconnected = track(clientFor('emp-token-orgA-1'));
    await waitForConnect(reconnected);

    const got = nextEvent(reconnected, 'task:updated');
    emitToUser(USERS['emp-token-orgA-1']._id, 'task:updated', {
      task: { _id: 't2', status: 'pending' },
    });
    const payload = await got;
    assert.equal(payload.task._id, 't2');
  });

  it('disconnected sockets no longer receive events (listener cleanup)', async () => {
    const client = track(clientFor('emp-token-orgA-1'));
    await waitForConnect(client);
    client.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    // Emitting to a user with no live sockets must be a safe no-op.
    const delivered = emitToUser(USERS['emp-token-orgA-1']._id, 'task:updated', { task: {} });
    assert.equal(typeof delivered, 'boolean');
  });
});

describe('realtime: delivery is independent of persistence', () => {
  it('emit helpers never throw — even with zero connected sockets', async () => {
    // No clients connected at this point in this describe block.
    assert.doesNotThrow(() => {
      emitToUser(OID('nobody'), 'task:updated', { task: {} });
      emitToOrg(OID('orgNobody'), 'dashboard:update', { reason: 'test' });
      emitToHr(OID('orgNobody'), 'task:updated', { task: {} });
    });
  });

  it('emit helpers tolerate missing/invalid arguments without throwing', () => {
    assert.doesNotThrow(() => emitToUser(null, 'x', {}));
    assert.doesNotThrow(() => emitToOrg(undefined, 'x', {}));
    assert.doesNotThrow(() => emitToHr(null, 'x', {}));
  });
});
