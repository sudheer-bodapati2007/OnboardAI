// src/components/ui/ErrorMessage.jsx
import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function ErrorMessage({ message = 'Something went wrong', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mb-4 dark:bg-red-900/20 dark:border-red-800/50">
        <AlertCircle className="w-7 h-7 text-red-500 dark:text-red-400" />
      </div>
      <h3 className="text-base font-semibold text-slate-800 dark:text-gray-200 mb-1">Error</h3>
      <p className="text-slate-500 dark:text-gray-400 text-sm max-w-sm">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      )}
    </div>
  );
}

