// src/contexts/RealtimeContext.jsx
// Real-time synchronisation provider built on Socket.IO.
//
// Responsibilities:
//  - Connects the singleton socket AFTER successful authentication.
//  - Disconnects on logout (user becomes null).
//  - Exposes `connected` and a `reconnectCount` so pages can refresh data
//    once after a genuine network reconnect (never on a timer).
//
// useSocketEvent(event, handler):
//  - Registers exactly ONE listener per (socket, event) pair per component
//    lifecycle — StrictMode double-mounting cannot create duplicates because
//    every effect registers/unregisters symmetrically.
//  - The latest handler is always invoked (kept in a ref), so handlers that
//    close over changing state never cause listener re-registration.
//
// useRealtimeReconnect(callback):
//  - Fires ONCE per successful reconnection (not on initial connect), letting
//    pages pull the latest persisted state from Mongo after offline periods.

import React, {
  createContext, useContext, useEffect, useRef, useState,
} from 'react';
import { useAuth } from './AuthContext.jsx';
import { createSocket, destroySocket } from '../services/socket.js';

const RealtimeContext = createContext(null);

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const socketRef = useRef(null);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      // Logout or session expiry — tear down the socket completely.
      destroySocket();
      socketRef.current = null;
      setConnected(false);
      return undefined;
    }

    const socket = createSocket();
    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onReconnect = () => setReconnectCount((c) => c + 1);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    // `reconnect` fires only when a dropped connection is re-established —
    // never on the first successful connect.
    socket.io.on('reconnect', onReconnect);

    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect', onReconnect);
      destroySocket();
      socketRef.current = null;
      setConnected(false);
    };
  }, [userId]);

  return (
    <RealtimeContext.Provider value={{ socket: socketRef.current, connected, reconnectCount }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside RealtimeProvider');
  return ctx;
}

/**
 * Subscribe to a socket event with safe lifecycle handling.
 * The handler is stored in a ref so changing closures never re-register
 * the underlying listener, and listeners are always removed on unmount.
 */
export function useSocketEvent(event, handler) {
  const { socket } = useRealtime();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!socket) return undefined;
    const listener = (...args) => handlerRef.current(...args);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}

/**
 * Fetch the latest persisted data once after every genuine reconnection.
 * The callback is invoked at most once per reconnect, never on page load.
 */
export function useRealtimeReconnect(callback) {
  const { reconnectCount, connected } = useRealtime();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (reconnectCount > 0 && connected) {
      callbackRef.current();
    }
  }, [reconnectCount, connected]);
}
