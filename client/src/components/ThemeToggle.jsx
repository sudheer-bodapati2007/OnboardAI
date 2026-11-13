// src/components/ThemeToggle.jsx
// Light/dark theme toggle with sun/moon icons.
import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext.jsx';

export function ThemeToggle() {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
        bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-200 hover:text-slate-900
        dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
    >
      {isDark ? (
        <>
          <Sun className="w-4 h-4 text-yellow-400" />
          <span>Light</span>
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-gray-400" />
          <span>Dark</span>
        </>
      )}
    </button>
  );
}
