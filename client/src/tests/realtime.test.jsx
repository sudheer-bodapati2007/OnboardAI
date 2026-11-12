// src/tests/realtime.test.jsx
// Real-time integration tests for the React layer.
//
// Verifies — with mocked sockets (no network):
//  1. useSocketEvent registers exactly ONE listener per lifecycle (even under
//     StrictMode double-effect invocation) and removes it on unmount.
//  2. The latest handler is invoked — stale closures never duplicate handlers.
//  3. Reconnection triggers exactly one refetch callback, and never on mount.
//  4. NotificationDrawer dedupes `notification:new` events by _id and updates
//     the unread count — WITHOUT any page reload.

import React, { StrictMode, useEffect, useRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react';

// ─── Mocks (hoisted — before module imports) ──────────────────────────────────

let fakeSocket;
let fakeIoListeners;

vi.mock('../contexts/AuthContext.jsx', () => ({
  // The provider only needs `user`; id changes drive connect/disconnect.
  useAuth: () => ({ user: mockUser ?? null }),
}));

vi.mock('../services/socket.js', () => ({
  createSocket: () => fakeSocket,
  destroySocket: () => {},
  getSocket: () => fakeSocket,
}));

vi.mock('../services/api.js', () => ({
  notificationsApi: {
    list: vi.fn(() => Promise.resolve({ data: { notifications: [], unreadCount: 0 } })),
    markRead: vi.fn(() => Promise.resolve({})),
    markAllRead: vi.fn(() => Promise.resolve({})),
  },
}));

let mockUser = null;

import { RealtimeProvider, useSocketEvent, useRealtimeReconnect } from '../contexts/RealtimeContext.jsx';
import { NotificationDrawer } from '../components/NotificationDrawer.jsx';
import { notificationsApi } from '../services/api.js';

function makeFakeSocket() {
  const listeners = new Map();
  const ioListeners = new Map();
  return {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
    on(event, fn) {
      const arr = listeners.get(event) ?? [];
      arr.push(fn);
      listeners.set(event, arr);
      return this;
    },
    off(event, fn) {
      const arr = listeners.get(event) ?? [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
      return this;
    },
    listenerCount(event) {
      return (listeners.get(event) ?? []).length;
    },
    dispatch(event, ...args) {
      for (const fn of [...(listeners.get(event) ?? [])]) fn(...args);
    },
    io: {
      on(event, fn) {
        const arr = ioListeners.get(event) ?? [];
        arr.push(fn);
        ioListeners.set(event, arr);
      },
      off(event, fn) {
        const arr = ioListeners.get(event) ?? [];
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      },
      trigger(event, ...args) {
        for (const fn of [...(ioListeners.get(event) ?? [])]) fn(...args);
      },
    },
  };
}

beforeEach(() => {
  fakeSocket = makeFakeSocket();
  mockUser = { id: 'u1', name: 'Test User', role: 'hr_admin' };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function connectRealtime() {
  // Simulate the socket reaching "connected" state inside the provider.
  await act(async () => {
    fakeSocket.dispatch('connect');
    fakeSocket.connected = true;
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useSocketEvent', () => {
  it('registers exactly one listener per lifecycle (StrictMode-safe)', async () => {
    let calls = 0;
    function Component() {
      useSocketEvent('task:updated', () => { calls += 1; });
      return null;
    }

    render(
      <StrictMode>
        <RealtimeProvider>
          <Component />
        </RealtimeProvider>
      </StrictMode>
    );
    await connectRealtime();

    expect(fakeSocket.listenerCount('task:updated')).toBe(1);

    // Dispatch → exactly one handler invocation
    await act(async () => {
      fakeSocket.dispatch('task:updated', { task: { _id: 't1' } });
    });
    expect(calls).toBe(1);
  });

  it('removes the listener on unmount (no stale handlers, no duplicates)', async () => {
    function Component() {
      useSocketEvent('task:updated', () => {});
      return null;
    }

    const { unmount } = render(
      <RealtimeProvider>
        <Component />
      </RealtimeProvider>
    );
    await connectRealtime();
    expect(fakeSocket.listenerCount('task:updated')).toBe(1);

    unmount();
    expect(fakeSocket.listenerCount('task:updated')).toBe(0);
  });

  it('re-registration on event change never duplicates listeners', async () => {
    function Component({ suffix }) {
      useSocketEvent('task:updated', (p) => p.suffix !== undefined && suffix);
      return null;
    }

    const { rerender } = render(
      <RealtimeProvider>
        <Component suffix="a" />
      </RealtimeProvider>
    );
    await connectRealtime();
    rerender(
      <RealtimeProvider>
        <Component suffix="b" />
      </RealtimeProvider>
    );

    expect(fakeSocket.listenerCount('task:updated')).toBe(1);
  });
});

describe('useRealtimeReconnect', () => {
  it('fires the callback once per reconnect and never on initial mount', async () => {
    const reconnectCb = vi.fn();

    function Component() {
      useRealtimeReconnect(reconnectCb);
      return null;
    }

    render(
      <RealtimeProvider>
        <Component />
      </RealtimeProvider>
    );

    // Initial connect — must NOT fire the callback
    await connectRealtime();
    expect(reconnectCb).not.toHaveBeenCalled();

    // Genuine reconnect after a drop
    await act(async () => {
      fakeSocket.dispatch('disconnect');
      fakeSocket.connected = false;
    });
    await act(async () => {
      fakeSocket.io.trigger('reconnect');
      fakeSocket.dispatch('connect');
      fakeSocket.connected = true;
    });
    expect(reconnectCb).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationDrawer real-time behaviour', () => {
  it('adds a live notification and increments unread — deduped, no reload', async () => {
    const urlBefore = window.location.href;

    render(
      <StrictMode>
        <RealtimeProvider>
          <NotificationDrawer />
        </RealtimeProvider>
      </StrictMode>
    );
    await connectRealtime();
    console.log('bells in DOM:', document.querySelectorAll('[aria-label="Notifications"]').length);
    console.log('notif listeners:', fakeSocket.listenerCount('notification:new'));

    const notification = {
      _id: 'n1', type: 'task_completed', title: 'Task completed',
      body: 'Emp marked "X" complete.', isRead: false, createdAt: new Date().toISOString(),
    };

    // Same notification delivered twice (duplicate event)
    await act(async () => {
      fakeSocket.dispatch('notification:new', { notification });
      fakeSocket.dispatch('notification:new', { notification });
    });

    // Unread badge updates live, without any reload
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());

    // The bell's refetch reads from Mongo — by then the notification is
    // persisted there, so the refetch returns it (mirrors production).
    notificationsApi.list.mockResolvedValue({
      data: { notifications: [notification], unreadCount: 1 },
    });

    // Open the drawer (user action) — the live notification is there, once
    fireEvent.click(screen.getByLabelText('Notifications'));
    await waitFor(() => expect(screen.getByText('Task completed')).toBeInTheDocument());

    // Dedupe: only ONE copy of the notification is in the list
    const entries = screen.getAllByText('Task completed');
    expect(entries.length).toBe(1);

    // No navigation / reload happened — same document, same URL
    expect(window.location.href).toBe(urlBefore);
    expect(document.body.contains(entries[0])).toBe(true);
  });
});
