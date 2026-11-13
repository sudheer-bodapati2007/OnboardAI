// src/components/ui/ProgressBar.jsx
import React from 'react';

export function ProgressBar({ percent = 0, className = '' }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color =
    clamped >= 100
      ? 'bg-green-500'
      : clamped >= 60
      ? 'bg-navy-500'
      : clamped >= 30
      ? 'bg-yellow-500'
      : 'bg-red-500';

  return (
    <div className={`h-2 rounded-full bg-slate-200 dark:bg-gray-800 overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

