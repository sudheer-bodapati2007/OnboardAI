// src/components/ui/Badge.jsx
import React from 'react';

const VARIANTS = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-green-900/50 dark:text-green-400 dark:border-green-800',
  onboarding: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-blue-900/50 dark:text-blue-400 dark:border-blue-800',
  inactive: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  pending: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-yellow-900/50 dark:text-yellow-400 dark:border-yellow-800',
  in_progress: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-400 dark:border-indigo-800',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-green-900/50 dark:text-green-400 dark:border-green-800',
  hr_admin: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/50 dark:text-purple-400 dark:border-purple-800',
  employee: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
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

