// src/components/ui/LoadingSpinner.jsx
import React from 'react';
import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8', xl: 'w-12 h-12' };
  return (
    <Loader2 className={`animate-spin text-navy-400 ${sizes[size]} ${className}`} />
  );
}

export function PageLoading({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
      <LoadingSpinner size="xl" />
      <p className="text-gray-400 text-sm">{message}</p>
    </div>
  );
}

export function FullPageLoading() {
  return (
    <div className="fixed inset-0 bg-midnight-950 flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-navy-600/20 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
        <p className="text-gray-400 text-sm">Loading OnboardAI…</p>
      </div>
    </div>
  );
}

