// src/components/ui/Pagination.jsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="btn-secondary p-2 disabled:opacity-40"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <span className="text-sm text-gray-400 px-3">
        Page <span className="text-white font-medium">{page}</span> of{' '}
        <span className="text-white font-medium">{totalPages}</span>
      </span>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="btn-secondary p-2 disabled:opacity-40"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

