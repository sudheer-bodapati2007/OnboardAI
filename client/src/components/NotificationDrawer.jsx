// src/components/NotificationDrawer.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, CheckCheck, Inbox } from 'lucide-react';
import { notificationsApi } from '../services/api.js';

const TYPE_COLORS = {
  onboarding_assigned: 'bg-blue-500',
  task_completed:      'bg-green-500',
  onboarding_completed:'bg-emerald-500',
  policy_ready:        'bg-purple-500',
  policy_failed:       'bg-red-500',
  task_overdue:        'bg-amber-500',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationDrawer() {
  const [open, setOpen]           = useState(false);
  const [items, setItems]         = useState([]);
  const [unread, setUnread]       = useState(0);
  const [loading, setLoading]     = useState(false);
  const drawerRef                 = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await notificationsApi.list({ limit: 30 });
      setItems(res.data?.notifications ?? []);
      setUnread(res.data?.unreadCount ?? 0);
    } catch {
      // silently ignore — bell count just stays stale
    }
  }, []);

  // Initial load + periodic refresh every 60s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const handleMarkRead = async (id) => {
    try {
      await notificationsApi.markRead(id);
      setItems((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnread((c) => Math.max(0, c - 1));
    } catch {}
  };

  const handleMarkAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } catch {}
  };

  return (
    <div className="relative" ref={drawerRef}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen((o) => !o); if (!open) fetchNotifications(); }}
        className="relative p-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-white/5 transition-all"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-navy-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                className="flex items-center gap-1 text-xs text-navy-400 hover:text-navy-300 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-800">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <Inbox className="w-8 h-8 text-gray-600 mb-2" />
                <p className="text-sm text-gray-500">No notifications yet</p>
              </div>
            ) : (
              items.map((n) => (
                <div
                  key={n._id}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors ${
                    !n.isRead ? 'bg-navy-900/20' : ''
                  }`}
                >
                  {/* Color dot */}
                  <div
                    className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                      TYPE_COLORS[n.type] ?? 'bg-gray-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-100 truncate">{n.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-gray-600 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && (
                    <button
                      onClick={() => handleMarkRead(n._id)}
                      title="Mark as read"
                      className="mt-0.5 p-1 rounded text-gray-600 hover:text-green-400 transition-colors flex-shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

