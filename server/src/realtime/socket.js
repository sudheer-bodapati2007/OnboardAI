// src/realtime/socket.js
// Socket.IO integration for real-time synchronisation.
//
// Security model:
//  - The JWT session cookie (HttpOnly, same as the REST API) is verified during
//    the socket handshake. No token is ever accepted from the URL/query/headers
//    supplied by the client.
//  - The authenticated user, their organisation and their role are loaded from
//    the database — never from client-supplied data.
//  - Room membership is assigned SERVER-SIDE only:
//      org:<organizationId>  — every authenticated user of the organisation
//      hr:<organizationId>   — hr_admin users of the organisation only
//      user:<userId>         — one user's private channel
//  - Clients cannot join arbitrary rooms; there is no client "join" listener.
//  - Mongo remains the source of truth. Socket events only announce changes.
//
// Testability: createRealtimeServer(httpServer, { verifyHandshakeUser }) lets
// tests inject a fake verifier so the routing/isolation logic can be tested
// without a database.

import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

let io = null; // singleton Socket.IO server

// ─── Handshake authentication ─────────────────────────────────────────────────

/** Minimal cookie-header parser (avoids pulling cookie-parser internals). */
function parseCookieHeader(header) {
  const jar = {};
  if (!header) return jar;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    let value = part.slice(idx + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep raw value — decoding must never break auth
    }
    jar[key] = value;
  }
  return jar;
}

/**
 * Default handshake verifier: reads the HttpOnly JWT session cookie from the
 * handshake request, verifies it and loads the user from MongoDB.
 * Throws when the connection must be rejected.
 */
export async function verifyHandshakeUser(handshake) {
  const token = parseCookieHeader(handshake.headers?.cookie).token;
  if (!token) throw new AppError('Authentication required', 401);

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new AppError('Invalid or expired session', 401);
  }

  const user = await User.findById(payload.userId).select('_id role organizationId isActive').lean();
  if (!user) throw new AppError('User account not found', 401);
  if (!user.isActive) throw new AppError('Account is deactivated', 403);

  return user;
}

// ─── Server bootstrap ─────────────────────────────────────────────────────────

/**
 * Attach Socket.IO to an HTTP server.
 * `options.verifyUser` overrides the handshake verifier (tests only).
 */
export function createRealtimeServer(httpServer, options = {}) {
  const verifyUser = options.verifyUser ?? verifyHandshakeUser;

  io = new SocketIOServer(httpServer, {
    // Same origin policy as the REST API — the Vercel frontend in production,
    // the Vite dev server locally. Never a wildcard with credentials.
    cors: {
      origin: env.clientUrl,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    // Polling first (works behind restrictive proxies), then upgrade to WS.
    // Both transports are fully supported by Render.
    transports: ['polling', 'websocket'],
    // Long-lived sockets should not be killed mid-use by proxies.
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 1e6,
  });

  io.use(async (socket, next) => {
    try {
      const user = await verifyUser(socket.handshake);
      if (!user?.organizationId || !user?._id) {
        return next(new Error('Invalid session'));
      }
      socket.data.userId = user._id.toString();
      socket.data.organizationId = user.organizationId.toString();
      socket.data.role = user.role;
      next();
    } catch (err) {
      // Return only a generic reason — never leak internals or token details.
      next(new Error(err?.statusCode === 403 ? 'Account is deactivated' : 'Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, organizationId, role } = socket.data;

    // Server-side room assignment ONLY. The client never chooses rooms.
    socket.join(`org:${organizationId}`);
    socket.join(`user:${userId}`);
    if (role === 'hr_admin') {
      socket.join(`hr:${organizationId}`);
    }

    // Explicitly REJECT any client attempt to self-authorise a room join.
    // (Defence-in-depth: there is no legitimate 'join' event; ignore hostile ones.)
    socket.on('room:join', (cb) => {
      const ack = typeof cb === 'function' ? cb : () => {};
      ack({ ok: false, error: 'Room membership is managed by the server' });
    });

    // Client heartbeat is informational only — Mongo + reconnect handle state.
    socket.on('ping:client', (cb) => {
      if (typeof cb === 'function') cb({ ok: true, serverTime: Date.now() });
    });
  });

  return io;
}

/** Attach to the app's HTTP server using the default verifier. */
export function initRealtime(httpServer) {
  return createRealtimeServer(httpServer);
}

// ─── Emit helpers (fire-and-forget, never throw) ─────────────────────────────

/**
 * Emit an event to every socket in the given rooms. Returns true if at least
 * one socket was targeted. Failures are swallowed — persistence already
 * happened in MongoDB, so a delivery failure must never break the request.
 */
function safeEmit(event, payload, rooms) {
  try {
    if (!io) return false;
    for (const room of rooms) {
      io.to(room).emit(event, payload);
    }
    return true;
  } catch (err) {
    console.error(`[Realtime] Emit failed for ${event}:`, err.message);
    return false;
  }
}

/** Private channel: exactly one user. */
export function emitToUser(userId, event, payload) {
  if (!userId) return false;
  return safeEmit(event, payload, [`user:${String(userId)}`]);
}

/** Whole organisation (HR admins AND employees of that org). */
export function emitToOrg(organizationId, event, payload) {
  if (!organizationId) return false;
  return safeEmit(event, payload, [`org:${String(organizationId)}`]);
}

/** HR admins of an organisation only. */
export function emitToHr(organizationId, event, payload) {
  if (!organizationId) return false;
  return safeEmit(event, payload, [`hr:${String(organizationId)}`]);
}

export function getIO() {
  return io;
}

// ─── Payload sanitisers — only fields the client needs, nothing sensitive ────

function idOf(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.toString();
}

export function sanitizeTask(task) {
  if (!task) return null;
  return {
    _id: idOf(task._id),
    employeeId: idOf(task.employeeId),
    title: task.title ?? '',
    description: task.description ?? '',
    category: task.category ?? 'General',
    status: task.status ?? 'pending',
    dueDate: task.dueDate ?? null,
    completedAt: task.completedAt ?? null,
    order: task.order ?? 0,
    updatedAt: task.updatedAt ?? null,
  };
}

export function sanitizeEmployee(employee) {
  if (!employee) return null;
  return {
    _id: idOf(employee._id),
    fullName: employee.fullName ?? '',
    email: employee.email ?? '',
    jobTitle: employee.jobTitle ?? '',
    department: employee.department ?? '',
    status: employee.status ?? 'active',
    startDate: employee.startDate ?? null,
    profileImageUrl: employee.profileImageUrl ?? null,
  };
}

export function sanitizeNotification(notification) {
  if (!notification) return null;
  return {
    _id: idOf(notification._id),
    type: notification.type,
    title: notification.title ?? '',
    body: notification.body ?? '',
    relatedEmployeeId: notification.relatedEmployeeId
      ? idOf(notification.relatedEmployeeId)
      : null,
    relatedTaskId: notification.relatedTaskId ? idOf(notification.relatedTaskId) : null,
    relatedPolicyId: notification.relatedPolicyId
      ? idOf(notification.relatedPolicyId)
      : null,
    isRead: !!notification.isRead,
    createdAt: notification.createdAt ?? null,
  };
}
