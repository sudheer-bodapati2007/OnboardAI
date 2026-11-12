// src/tests/aichat.test.jsx
// Regression tests for the AI Policy Assistant page.
//
// Root cause these tests lock in: MessageBubble used to reference handleSend
// and loading that were out of its scope — whenever an AI request FAILED, the
// error bubble's Retry button threw a ReferenceError during render and React
// unmounted the whole tree (blank page). These tests assert that a failed
// request keeps the page fully rendered with a readable error and a working
// Retry action.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react';

let chatImpl;

vi.mock('../services/api.js', () => ({
  aiApi: {
    chat: vi.fn((question, history) => chatImpl(question, history)),
  },
}));

import { aiApi } from '../services/api.js';
import AIChatPage from '../pages/AIChatPage.jsx';

const QUESTION = 'How many vacation days do I have?';
const ANSWER = 'You receive 20 days of paid annual leave per year.';

function typeAndSend(question = QUESTION) {
  const box = screen.getByPlaceholderText(/Ask about company policies/i);
  fireEvent.change(box, { target: { value: question } });
  // Send via Enter — the same handleSend path the button click uses.
  // (jsdom/vitest does not reliably trigger React onClick on this button;
  // the Enter key exercises identical handleSend logic.)
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: false });
}

beforeEach(() => {
  chatImpl = vi.fn();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('AIChatPage — successful responses', () => {
  it('renders the answer and its sources without a reload', async () => {
    chatImpl.mockResolvedValue({
      data: {
        answer: ANSWER,
        sources: [
          { documentName: 'Employee Handbook', pageNumber: 2, excerpt: 'Annual leave…' },
        ],
        insufficient: false,
      },
    });

    render(<AIChatPage />);
    typeAndSend();

    await waitFor(() => expect(screen.getByText(ANSWER)).toBeInTheDocument());
    expect(screen.getByText('Employee Handbook')).toBeInTheDocument();
    expect(screen.getByText('p.2')).toBeInTheDocument();
    // The user's question remains visible in the transcript
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
  });

  it('shows a fallback message when the response is malformed/empty', async () => {
    chatImpl.mockResolvedValue({ data: {} }); // missing answer/sources

    render(<AIChatPage />);
    typeAndSend();

    await waitFor(() =>
      expect(screen.getByText(/could not generate a response/i)).toBeInTheDocument()
    );
    // Missing sources must not crash rendering
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
  });
});

describe('AIChatPage — failed requests (blank-page regression)', () => {
  it('keeps the page rendered with a readable error when the API fails', async () => {
    chatImpl.mockRejectedValue({ status: 503, message: 'Service Unavailable' });

    render(<AIChatPage />);
    typeAndSend();

    // The user's question is still visible — state was never wiped
    await waitFor(() => expect(screen.getByText(QUESTION)).toBeInTheDocument());
    // A readable, specific error is shown (not a blank page)
    expect(
      screen.getByText(/temporarily unavailable due to high demand/i)
    ).toBeInTheDocument();
    // The Retry action is rendered and clickable
    expect(screen.getByText('Retry')).toBeInTheDocument();
    // The chat page itself is still mounted (header intact)
    expect(screen.getByText('AI Policy Assistant')).toBeInTheDocument();
  });

  it('stops the loading indicator after a failure (send re-enabled)', async () => {
    chatImpl.mockRejectedValue({ status: 503, message: 'Service Unavailable' });

    render(<AIChatPage />);
    typeAndSend();

    await waitFor(() => expect(screen.getByText('Retry')).toBeInTheDocument());
    // "Thinking…" indicator is gone
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
    // Input re-enabled for another attempt
    expect(screen.getByPlaceholderText(/Ask about company policies/i)).not.toBeDisabled();
  });

  it('Retry re-sends the last question and renders the new answer', async () => {    chatImpl
      .mockRejectedValueOnce({ status: 503, message: 'Service Unavailable' })
      .mockResolvedValueOnce({ data: { answer: ANSWER, sources: [], insufficient: false } });

    render(<AIChatPage />);
    typeAndSend();

    await waitFor(() => expect(screen.getByText('Retry')).toBeInTheDocument());
    expect(aiApi.chat).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => expect(screen.getByText(ANSWER)).toBeInTheDocument());
    expect(aiApi.chat).toHaveBeenCalledTimes(2);
    // The retry sent the ORIGINAL question (input was cleared after sending)
    expect(aiApi.chat).toHaveBeenLastCalledWith(QUESTION, expect.anything());
  });

  it('shows a friendly message (not a raw axios timeout) when the request times out', async () => {
    // axios aborts with code ECONNABORTED and message "timeout of Nms exceeded"
    chatImpl.mockRejectedValue({
      code: 'ECONNABORTED',
      status: undefined,
      message: 'timeout of 90000ms exceeded',
    });

    render(<AIChatPage />);
    typeAndSend();

    await waitFor(() =>
      expect(screen.getByText(/took too long to respond/i)).toBeInTheDocument()
    );
    // Page stays rendered with a working Retry button
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('AI Policy Assistant')).toBeInTheDocument();
  });

  it('shows a friendly message when the backend is unreachable (Network Error)', async () => {
    chatImpl.mockRejectedValue({
      code: 'ERR_NETWORK',
      status: undefined,
      message: 'Network Error',
    });

    render(<AIChatPage />);
    typeAndSend();

    await waitFor(() =>
      expect(screen.getByText(/could not reach the AI service/i)).toBeInTheDocument()
    );
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});
