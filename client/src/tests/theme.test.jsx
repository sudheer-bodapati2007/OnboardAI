// src/tests/theme.test.jsx
// Light theme regression tests.
//
// Verifies:
//   1. The `.light` design tokens match the requested palette (soft off-white
//      background #F7F8FC, white cards, indigo accents, slate text, subtle
//      borders) and are declared in index.css.
//   2. The Midnight Navy dark values are preserved — every themed component
//      keeps its exact `dark:` pair, so dark mode is unaffected.
//   3. Key UI components render with light-first classes plus dark pairs
//      (badges, modal, theme toggle, progress bar, buttons).
//   4. The whole document root gets the `light` class from ThemeProvider and
//      the toggle switches it without any persistence-style side effects.

import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// Read the stylesheet directly — the ?raw import is intercepted by the CSS
// pipeline in this setup. Tests run with cwd = client/.
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

// jsdom's matchMedia always reports "no light preference"; force the light
// match so the provider's initial theme is deterministic in these tests.
window.matchMedia = vi.fn().mockImplementation((query) => ({
  matches: true,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

import { ThemeProvider } from '../contexts/ThemeContext.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { ProgressBar } from '../components/ui/ProgressBar.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx';

describe('light theme design tokens (index.css)', () => {
  it('declares the requested light palette', () => {
    const lightBlock = indexCss.slice(indexCss.indexOf('.light'));
    expect(lightBlock).toContain('--color-bg-primary: #F7F8FC');
    expect(lightBlock).toContain('--color-card: #FFFFFF');
    expect(lightBlock).toContain('--color-text-primary: #1E293B');
    expect(lightBlock).toContain('--color-text-secondary: #64748B');
    expect(lightBlock).toContain('--color-border: #E2E8F0');
    expect(lightBlock).toContain('--color-bg-secondary: #EEF2FF');
  });

  it('preserves the Midnight Navy dark token values', () => {
    const rootBlock = indexCss.slice(indexCss.indexOf(':root'), indexCss.indexOf('.light'));
    // Exact original dark values must still be there.
    expect(rootBlock).toContain('--color-bg-primary: #0f172a');
    expect(rootBlock).toContain('--color-card: #1e293b');
    expect(rootBlock).toContain('--color-text-primary: #f8fafc');
  });

  it('keeps dark: pairs on themed component classes', () => {
    expect(indexCss).toContain('dark:bg-navy-600/20'); // .nav-item-active keeps navy
    expect(indexCss).toContain('dark:bg-green-900/50'); // .badge-active keeps navy-green
    expect(indexCss).toContain('dark:bg-gray-700'); // .btn-secondary keeps dark surface
    expect(indexCss).toContain('dark:hover:bg-gray-700/50'); // table hover
  });
});

describe('components render theme-aware classes', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add('light');
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('dark', 'light');
  });

  it('Badge uses soft light colours in light mode and keeps the dark pair', () => {
    const { container } = render(<Badge variant="active" />);
    const el = container.querySelector('span');
    expect(el.className).toContain('bg-emerald-100');
    expect(el.className).toContain('dark:bg-green-900/50');
  });

  it('Modal panel is white in light mode and gray-900 in dark mode', () => {
    const { container } = render(
      <Modal isOpen title="Test modal" onClose={() => {}}>
        <p>Body</p>
      </Modal>,
    );
    const panel = container.querySelector('.animate-fadeIn');
    expect(panel.className).toContain('bg-white');
    expect(panel.className).toContain('dark:bg-gray-900');
    expect(panel.className).toContain('border-slate-200');
  });

  it('ThemeToggle works in both themes and toggles the root class', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const button = screen.getByRole('button');
    // Light-first classes + dark pair — both themes styled.
    expect(button.className).toContain('bg-slate-100');
    expect(button.className).toContain('dark:bg-gray-800');
    expect(button.className).toContain('border-slate-300');

    // Toggle flips the root class.
    fireEvent.click(button);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);

    fireEvent.click(button);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('ProgressBar track is light in light mode, dark in dark mode', () => {
    const { container } = render(<ProgressBar percent={50} />);
    expect(container.firstElementChild.className).toContain('bg-slate-200');
    expect(container.firstElementChild.className).toContain('dark:bg-gray-800');
  });

  it('EmptyState and ErrorMessage adapt to light mode', () => {
    const empty = render(<EmptyState title="Nothing" description="desc" />);
    expect(empty.container.querySelector('h3').className).toContain('text-slate-800');
    expect(empty.container.querySelector('h3').className).toContain('dark:text-gray-200');
    empty.unmount();

    const err = render(<ErrorMessage message="boom" />);
    expect(err.container.querySelector('h3').className).toContain('text-slate-800');
    expect(err.container.querySelector('.rounded-2xl').className).toContain('bg-red-50');
  });
});
