// src/components/ErrorBoundary.jsx
// Last-resort guard for unexpected React rendering exceptions.
//
// Without this, any uncaught render error anywhere in the tree unmounts the
// entire React root and the user sees a blank page. This boundary catches the
// error, shows a readable fallback UI, logs the details to the console for
// debugging, and offers recovery actions — it never silently hides the error.

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surfaced for debugging; never shown to end users (no stack traces in UI).
    console.error('[ErrorBoundary] Unhandled UI error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-950">
        <div className="max-w-lg w-full p-6 rounded-xl bg-gray-900 border border-red-800/50 text-center space-y-4">
          <div className="flex justify-center">
            <span className="p-3 rounded-full bg-red-900/30 border border-red-800/50">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </span>
          </div>
          <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
          <p className="text-sm text-gray-400">
            The page hit an unexpected error while rendering. Your data is safe —
            this is a display problem only.
          </p>
          <p className="text-xs text-gray-600 font-mono break-words">
            {String(error?.message ?? error)}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={this.handleReset}
              className="btn-primary px-4 py-2 text-sm flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 underline"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
