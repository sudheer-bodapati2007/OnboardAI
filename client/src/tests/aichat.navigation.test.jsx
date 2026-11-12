// src/tests/aichat.navigation.test.jsx
// Regression tests for preserving the AI Assistant conversation during
// navigation within the SPA.
//
// Root cause these tests lock in: messages used to live in useState inside
// AIChatPage, so navigating away unmounted the page and remounting it reset
// the conversation to the welcome message. The conversation now lives in
// AIChatContext, mounted above the React Router Routes, so it survives route
// changes, resets when the authenticated user changes, and is never
// persisted (a fresh provider mount — equivalent to a page refresh — starts
// a new conversation).

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';

let chatImpl;

vi.mock('../services/api.js', () => ({
  aiApi: {
    chat: vi.fn((question, history) => chatImpl(question, history)),
  },
}));

// Controllable authenticated user (mutate authMock.user to simulate an
// account switch without a full page reload).
const authMock = vi.hoisted(() => ({ user: { _id: 'user-1', role: 'hr_admin' } }));
vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => authMock,
}));

import { aiApi } from '../services/api.js';
import { AIChatProvider } from '../contexts/AIChatContext.jsx';
import AIChatPage from '../pages/AIChatPage.jsx';

const Q1 = 'How many vacation days do I have?';
const Q2 = 'What is the work-from-home policy?';
const A1 = 'You receive 20 days of paid annual leave per year.';
const A2 = 'Hybrid work: 3 days in office, 2 days remote.';

function PoliciesStub() {
  return (
    <div>
      <p>Policies page</p>
      <Link to="/ai-chat">Back to assistant</Link>
    </div>
  );
}

// The provider sits ABOVE the router, mirroring App.jsx — it stays mounted
// while routes change, which is exactly why the chat survives navigation.
function renderApp() {
  return render(
    <AIChatProvider>
      <MemoryRouter initialEntries={['/ai-chat']}>
        <nav>
          <Link to="/ai-chat">AI Chat</Link>
          <Link to="/policies">Policies</Link>
        </nav>
        <Routes>
          <Route path="/ai-chat" element={<AIChatPage />} />
          <Route path="/policies" element={<PoliciesStub />} />
        </Routes>
      </MemoryRouter>
    </AIChatProvider>
  );
}

function ask(question) {
  const box = screen.getByPlaceholderText(/Ask about company policies/i);
  fireEvent.change(box, { target: { value: question } });
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: false });
}

// The message list container (class "card" in AIChatPage).
const messageList = () => document.querySelector('div.card');

function goPolicies() {
  fireEvent.click(screen.getByText('Policies', { selector: 'a' }));
}
function goChat() {
  fireEvent.click(screen.getByText('AI Chat'));
}

beforeEach(() => {
  chatImpl = vi.fn();
  authMock.user = { _id: 'user-1', role: 'hr_admin' };
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('AI chat survives navigation', () => {
  it('keeps the conversation when navigating to Policies and back', async () => {
    chatImpl.mockResolvedValue({ data: { answer: A1, sources: [], insufficient: false } });

    renderApp();
    ask(Q1);
    await waitFor(() => expect(screen.getByText(A1)).toBeInTheDocument());

    goPolicies();
    expect(screen.getByText('Policies page')).toBeInTheDocument();
    expect(screen.queryByText(A1)).not.toBeInTheDocument(); // page unmounted

    goChat();
    // Both the user's question and the assistant's answer are restored
    // exactly as before navigation.
    expect(screen.getByText(Q1)).toBeInTheDocument();
    expect(screen.getByText(A1)).toBeInTheDocument();
    expect(screen.getByText('AI Policy Assistant')).toBeInTheDocument();
  });

  it('keeps multiple questions and answers in their original order', async () => {
    chatImpl
      .mockResolvedValueOnce({ data: { answer: A1, sources: [], insufficient: false } })
      .mockResolvedValueOnce({ data: { answer: A2, sources: [], insufficient: false } });

    renderApp();
    ask(Q1);
    await waitFor(() => expect(screen.getByText(A1)).toBeInTheDocument());
    ask(Q2);
    await waitFor(() => expect(screen.getByText(A2)).toBeInTheDocument());

    goPolicies();
    goChat();

    expect(screen.getByText(Q1)).toBeInTheDocument();
    expect(screen.getByText(A1)).toBeInTheDocument();
    expect(screen.getByText(Q2)).toBeInTheDocument();
    expect(screen.getByText(A2)).toBeInTheDocument();

    // Original conversation order: Q1, A1, Q2, A2.
    const text = messageList().textContent;
    expect(text.indexOf(Q1)).toBeLessThan(text.indexOf(A1));
    expect(text.indexOf(A1)).toBeLessThan(text.indexOf(Q2));
    expect(text.indexOf(Q2)).toBeLessThan(text.indexOf(A2));
  });

  it('keeps source references attached to the correct assistant messages', async () => {
    chatImpl
      .mockResolvedValueOnce({
        data: {
          answer: A1,
          sources: [{ documentName: 'Leave Policy.pdf', pageNumber: 3, excerpt: 'Annual leave…' }],
          insufficient: false,
        },
      })
      .mockResolvedValueOnce({
        data: {
          answer: A2,
          sources: [{ documentName: 'WFH Policy.pdf', pageNumber: 5, excerpt: 'Hybrid work…' }],
          insufficient: false,
        },
      });

    renderApp();
    ask(Q1);
    await waitFor(() => expect(screen.getByText(A1)).toBeInTheDocument());
    ask(Q2);
    await waitFor(() => expect(screen.getByText(A2)).toBeInTheDocument());

    goPolicies();
    goChat();

    expect(screen.getByText('Leave Policy.pdf')).toBeInTheDocument();
    expect(screen.getByText('p.3')).toBeInTheDocument();
    expect(screen.getByText('WFH Policy.pdf')).toBeInTheDocument();
    expect(screen.getByText('p.5')).toBeInTheDocument();

    // Each source sits in the same message block as its own answer.
    const leaveIdx = messageList().textContent.indexOf('Leave Policy.pdf');
    expect(leaveIdx).toBeGreaterThan(messageList().textContent.indexOf(A1));
    expect(leaveIdx).toBeLessThan(messageList().textContent.indexOf(A2));
  });

  it('preserves error messages and Retry works after navigating away and back', async () => {
    chatImpl
      .mockRejectedValueOnce({ status: 503, message: 'Service Unavailable' })
      .mockResolvedValueOnce({ data: { answer: A1, sources: [], insufficient: false } });

    renderApp();
    ask(Q1);
    await waitFor(() => expect(screen.getByText('Retry')).toBeInTheDocument());
    expect(screen.getByText(/temporarily unavailable due to high demand/i)).toBeInTheDocument();

    // Navigate away and back — the failed request and its Retry survive.
    goPolicies();
    goChat();
    expect(screen.getByText('Retry')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByText(A1)).toBeInTheDocument());
    expect(aiApi.chat).toHaveBeenCalledTimes(2);
    // The retry re-sent the ORIGINAL question (input box was cleared).
    expect(aiApi.chat).toHaveBeenLastCalledWith(Q1, expect.anything());
  });

  it('a fresh provider mount (page refresh) starts a new conversation', async () => {
    chatImpl.mockResolvedValue({ data: { answer: A1, sources: [], insufficient: false } });

    renderApp();
    ask(Q1);
    await waitFor(() => expect(screen.getByText(A1)).toBeInTheDocument());

    // Simulate a browser refresh: the whole app remounts, creating a brand
    // new AIChatProvider (chat is in-memory only — nothing was persisted).
    cleanup();
    renderApp();

    expect(screen.getByText(/Hello! I can answer questions about your company/i)).toBeInTheDocument();
    expect(screen.queryByText(Q1)).not.toBeInTheDocument();
    expect(screen.queryByText(A1)).not.toBeInTheDocument();
  });

  it('switching authenticated users resets the conversation (no cross-user leak)', async () => {
    chatImpl.mockResolvedValue({ data: { answer: A1, sources: [], insufficient: false } });

    const { rerender } = renderApp();
    ask(Q1);
    await waitFor(() => expect(screen.getByText(A1)).toBeInTheDocument());

    // Account changes without a full page reload (auth context updates).
    authMock.user = { _id: 'user-2', role: 'employee' };
    rerender(
      <AIChatProvider>
        <MemoryRouter initialEntries={['/ai-chat']}>
          <nav>
            <Link to="/ai-chat">AI Chat</Link>
            <Link to="/policies">Policies</Link>
          </nav>
          <Routes>
            <Route path="/ai-chat" element={<AIChatPage />} />
            <Route path="/policies" element={<PoliciesStub />} />
          </Routes>
        </MemoryRouter>
      </AIChatProvider>
    );

    await waitFor(() =>
      expect(screen.getByText(/Hello! I can answer questions about your company/i)).toBeInTheDocument()
    );
    // The previous user's conversation is gone.
    expect(screen.queryByText(Q1)).not.toBeInTheDocument();
    expect(screen.queryByText(A1)).not.toBeInTheDocument();
  });
});
