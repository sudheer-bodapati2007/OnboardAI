// src/pages/AIChatPage.jsx
// Available to all authenticated users.
// Session-based conversation (React state, not persisted to DB).
import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, AlertCircle, BookOpen, Loader2, Trash2 } from 'lucide-react';
import { aiApi } from '../services/api.js';

function SourceCard({ source }) {
  return (
    <div className="mt-2 p-2.5 rounded-lg bg-gray-800/70 border border-gray-700/50 text-xs">
      <div className="flex items-center gap-1.5 mb-1">
        <BookOpen className="w-3 h-3 text-navy-400 flex-shrink-0" />
        <span className="font-medium text-gray-300 truncate">{source.documentName}</span>
        {source.pageNumber && (
          <span className="text-gray-600 ml-auto flex-shrink-0">p.{source.pageNumber}</span>
        )}
      </div>
      {source.excerpt && (
        <p className="text-gray-500 line-clamp-2 leading-relaxed">{source.excerpt}</p>
      )}
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] flex items-end gap-2">
          <div className="px-4 py-2.5 rounded-2xl rounded-br-sm bg-navy-600 text-white text-sm leading-relaxed">
            {msg.content}
          </div>
          <div className="w-7 h-7 rounded-full bg-navy-700 flex items-center justify-center flex-shrink-0 mb-0.5">
            <User className="w-3.5 h-3.5 text-navy-300" />
          </div>
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-gray-300" />
        </div>
        <div>
          {/* Insufficient evidence notice */}
          {msg.insufficient && (
            <div className="flex items-start gap-2 mb-2 px-3 py-2 rounded-lg bg-amber-900/30 border border-amber-700/40 text-amber-300 text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>I couldn&apos;t find sufficient information in the uploaded policy documents to fully answer this question.</span>
            </div>
          )}

          {/* Error notice */}
          {msg.error && (
            <div className="flex items-start gap-2 mb-2 px-3 py-2 rounded-lg bg-red-900/30 border border-red-700/40 text-red-300 text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{msg.error}</span>
            </div>
          )}

          {/* Answer text */}
          <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm bg-gray-800 text-gray-100 text-sm leading-relaxed whitespace-pre-wrap">
            {msg.content}
          </div>

          {/* Sources */}
          {msg.sources && msg.sources.length > 0 && (
            <div className="mt-1">
              <p className="text-[11px] text-gray-600 px-1 mb-1">Sources</p>
              {msg.sources.map((s, i) => (
                <SourceCard key={i} source={s} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AIChatPage() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I can answer questions about your company\'s policies. Ask me anything based on the uploaded policy documents.',
      sources: [],
      insufficient: false,
    },
  ]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef(null);
  const inputRef              = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setLoading(true);

    // Optimistically add user message
    const userMsg = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // Build history (exclude the welcome message)
      const history = messages.slice(1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        text: m.content,
      }));

      const res = await aiApi.chat(question, history);
      const { answer, sources, insufficient } = res.data ?? {};

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: answer ?? 'Sorry, I could not generate a response.',
          sources: sources ?? [],
          insufficient: insufficient ?? false,
        },
      ]);
    } catch (err) {
      const status = err.status;
      let errMsg;
      if (status === 503) {
        errMsg = 'The AI assistant is not configured. Ask your administrator to add a GEMINI_API_KEY.';
      } else if (status === 429) {
        errMsg = 'Rate limit reached. Please wait a moment and try again.';
      } else {
        errMsg = err.message ?? 'Something went wrong. Please try again.';
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'I was unable to process your request.',
          error: errMsg,
          sources: [],
          insufficient: false,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: 'Hello! I can answer questions about your company\'s policies. Ask me anything based on the uploaded policy documents.',
        sources: [],
        insufficient: false,
      },
    ]);
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-navy-400" />
            AI Policy Assistant
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            Ask questions — answers are grounded in your uploaded policy documents.
          </p>
        </div>
        {messages.length > 1 && (
          <button
            onClick={clearChat}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all"
            title="Clear conversation"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto card p-4 space-y-4 mb-4">
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-gray-300" />
              </div>
              <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm bg-gray-800 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-navy-400 animate-spin" />
                <span className="text-xs text-gray-400">Thinking…</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about company policies, procedures, benefits…"
          rows={2}
          maxLength={1000}
          disabled={loading}
          className="input flex-1 resize-none text-sm py-3"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="btn-primary px-4 flex items-center justify-center self-stretch"
          title="Send (Enter)"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
      <p className="text-[11px] text-gray-700 text-right mt-1">{input.length}/1000</p>
    </div>
  );
}

