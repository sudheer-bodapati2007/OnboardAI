// src/services/socket.js
// Socket.IO client factory.
//
// Authentication reuses the existing HttpOnly JWT session cookie:
// `withCredentials: true` makes the browser attach it to the handshake
// (both the polling request and the WebSocket upgrade). No token is ever
// placed in a URL, query string, or log output.

import { io } from 'socket.io-client';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

let socket = null;

/**
 * Create (or return) the singleton authenticated socket.
 * Returns null when called outside an authenticated session — the caller
 * (RealtimeProvider) decides when to connect.
 */
export function createSocket() {
  if (socket) return socket;

  socket = io(BASE_URL, {
    withCredentials: true, // sends the HttpOnly session cookie cross-origin
    // Polling first guarantees connectivity through restrictive proxies;
    // the engine upgrades to WebSocket automatically once established.
    transports: ['polling', 'websocket'],
    reconnection: true, // safe auto-reconnect on network loss
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000, // capped backoff — never gives up
    timeout: 20_000,
    autoConnect: false, // provider connects explicitly after auth
  });

  return socket;
}

/** Disconnect and destroy the singleton (logout / unauthenticated). */
export function destroySocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/** The active socket, or null when not connected/authenticated. */
export function getSocket() {
  return socket;
}
