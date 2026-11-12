// src/contexts/AIChatContext.jsx
// In-memory AI chat conversation shared across route changes.
//
// The provider is mounted ABOVE the React Router Routes in App.jsx, so it
// stays mounted while the user navigates between pages — the conversation
// survives navigation (AI Assistant → Policies → AI Assistant).
//
// Deliberately NOT persisted anywhere (no localStorage, sessionStorage,
// IndexedDB, or database): the state lives only in this page session's
// memory, so a browser refresh or closed tab discards it and the assistant
// starts from its welcome message again.
//
// Per-user isolation: the conversation resets whenever the authenticated user
// changes (e.g. switching Google accounts without a full page reload), so one
// user's chat can never leak into another user's session.

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext.jsx';

const WELCOME_MESSAGE = {
  role: 'assistant',
  content:
    "Hello! I can answer questions about your company's policies. Ask me anything based on the uploaded policy documents.",
  sources: [],
  insufficient: false,
};

export const freshConversation = () => [WELCOME_MESSAGE];

const AIChatContext = createContext(null);

export function AIChatProvider({ children }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState(freshConversation);
  // The last question actually sent — retry re-sends this, because the
  // input box is cleared after the first attempt. Kept here so Retry still
  // works if the user navigates away and back to a failed request.
  const [lastQuestion, setLastQuestion] = useState(null);

  // Stable identifier for the authenticated user (Mongo `_id`, `id`, or email).
  const userKey = user?._id ?? user?.id ?? user?.email ?? null;

  // Reset the conversation when the authenticated user changes (login as a
  // different account or logout). The effect also runs on first mount, which
  // is harmless — the conversation is already fresh. No persistence: this
  // never fires on route changes, only on identity changes.
  useEffect(() => {
    setMessages(freshConversation());
    setLastQuestion(null);
  }, [userKey]);

  const clearChat = () => {
    setLastQuestion(null);
    setMessages(freshConversation());
  };

  const value = useMemo(
    () => ({ messages, setMessages, lastQuestion, setLastQuestion, clearChat }),
    [messages, lastQuestion]
  );

  return <AIChatContext.Provider value={value}>{children}</AIChatContext.Provider>;
}

export function useAIChat() {
  const ctx = useContext(AIChatContext);
  if (!ctx) {
    throw new Error('useAIChat must be used within an AIChatProvider');
  }
  return ctx;
}
