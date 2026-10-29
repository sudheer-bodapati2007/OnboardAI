// src/components/ui/Badge.jsx
import React from 'react';

const VARIANTS = {
  active: 'bg-green-900/50 text-green-400 border-green-800',
  onboarding: 'bg-blue-900/50 text-blue-400 border-blue-800',
  inactive: 'bg-gray-800 text-gray-400 border-gray-700',
  pending: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
  in_progress: 'bg-indigo-900/50 text-indigo-400 border-indigo-800',
  completed: 'bg-green-900/50 text-green-400 border-green-800',
  hr_admin: 'bg-purple-900/50 text-purple-400 border-purple-800',
  employee: 'bg-gray-800 text-gray-400 border-gray-700',
};

const LABELS = {
  active: 'Active',
  onboarding: 'Onboarding',
  inactive: 'Inactive',
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  hr_admin: 'HR Admin',
  employee: 'Employee',
};

export function Badge({ variant, label, className = '' }) {
  const classes = VARIANTS[variant] ?? VARIANTS.inactive;
  const text = label ?? LABELS[variant] ?? variant;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${classes} ${className}`}>
      {text}
    </span>
  );
}

