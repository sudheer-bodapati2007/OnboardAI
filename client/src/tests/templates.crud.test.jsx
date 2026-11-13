// src/tests/templates.crud.test.jsx
// Regression tests for template task management on the Templates page.
//
// Verifies the UI flow that wraps the existing CRUD endpoints:
//   1. HR opens a template and sees its tasks in the edit modal.
//   2. Clicking delete shows an inline confirmation FIRST — the task is NOT
//      removed until "Delete" is confirmed.
//   3. "Cancel" dismisses the confirmation and keeps the task.
//   4. Confirming "Delete" removes the row and saving persists the reduced
//      tasks array via PATCH (updateTemplate).
//   5. "Add Task" appends an editable row that is included when saving.
//   6. Editing an existing task's title is included when saving.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

const apiMock = vi.hoisted(() => ({
  onboardingApi: {
    listTemplates: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
  },
}));
vi.mock('../services/api.js', () => apiMock);

import TemplatesPage from '../pages/TemplatesPage.jsx';

const TPL = {
  _id: 'tpl-1',
  name: 'Software Engineer',
  description: 'Engineering onboarding',
  roleTarget: 'Software Engineer',
  tasks: [
    { _id: 'task-1', title: 'Sign contract', description: '', category: 'HR', dueDayOffset: 0 },
    { _id: 'task-2', title: 'Laptop setup', description: '', category: 'IT Setup', dueDayOffset: 1 },
  ],
};

function renderPage() {
  return render(<TemplatesPage />);
}

beforeEach(() => {
  apiMock.onboardingApi.listTemplates.mockResolvedValue({ data: { templates: [TPL] } });
  apiMock.onboardingApi.createTemplate.mockResolvedValue({ data: { template: TPL } });
  apiMock.onboardingApi.updateTemplate.mockResolvedValue({ data: { template: TPL } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openEditModal() {
  renderPage();
  await waitFor(() => expect(screen.getByText('Software Engineer')).toBeInTheDocument());
  // The edit button is the first btn-ghost in the template row actions.
  const buttons = document.querySelectorAll('button.btn-ghost');
  fireEvent.click(buttons[0]);
  await waitFor(() => expect(screen.getByText('Edit Template')).toBeInTheDocument());
}

describe('TemplatesPage — template task CRUD with delete confirmation', () => {

  it('shows the template tasks in the edit modal', async () => {
    await openEditModal();
    expect(screen.getByDisplayValue('Sign contract')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Laptop setup')).toBeInTheDocument();
  });

  it('asks for confirmation before removing a task — Cancel keeps it', async () => {
    await openEditModal();

    const removeButtons = screen.getAllByLabelText('Remove task');
    expect(removeButtons).toHaveLength(2);

    // First click: confirmation appears, task NOT removed yet.
    fireEvent.click(removeButtons[0]);
    await waitFor(() =>
      expect(screen.getByText(/Delete “Sign contract”. This cannot be undone./i)).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue('Sign contract')).toBeInTheDocument(); // still present
    expect(apiMock.onboardingApi.updateTemplate).not.toHaveBeenCalled();

    // Cancel: confirmation dismissed, task still there.
    fireEvent.click(screen.getByLabelText('Cancel delete'));
    expect(screen.queryByText(/This cannot be undone/i)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Sign contract')).toBeInTheDocument();
  });

  it('confirming Delete removes the row and saving persists the reduced array', async () => {
    await openEditModal();

    fireEvent.click(screen.getAllByLabelText('Remove task')[0]);
    await waitFor(() => expect(screen.getByText(/This cannot be undone/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Confirm delete'));
    await waitFor(() =>
      expect(screen.queryByDisplayValue('Sign contract')).not.toBeInTheDocument(),
    );
    // The remaining task is untouched.
    expect(screen.getByDisplayValue('Laptop setup')).toBeInTheDocument();

    // Save → PATCH with exactly the remaining task.
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(apiMock.onboardingApi.updateTemplate).toHaveBeenCalledTimes(1));

    const [id, payload] = apiMock.onboardingApi.updateTemplate.mock.calls[0];
    expect(id).toBe('tpl-1');
    expect(payload.tasks).toHaveLength(1);
    expect(payload.tasks[0].title).toBe('Laptop setup');
    expect(payload.tasks[0].category).toBe('IT Setup');
  });

  it('Add Task appends a new editable row included in the saved payload', async () => {
    await openEditModal();

    fireEvent.click(screen.getByRole('button', { name: /Add Task/i }));
    const newTitle = screen.getByPlaceholderText('Task 3 title…');
    fireEvent.change(newTitle, { target: { value: 'Security training' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(apiMock.onboardingApi.updateTemplate).toHaveBeenCalledTimes(1));

    const [, payload] = apiMock.onboardingApi.updateTemplate.mock.calls[0];
    expect(payload.tasks).toHaveLength(3);
    expect(payload.tasks[2].title).toBe('Security training');
    expect(payload.tasks[2].category).toBe('General');
  });

  it('editing an existing task title is persisted on save', async () => {
    await openEditModal();

    fireEvent.change(screen.getByDisplayValue('Laptop setup'), {
      target: { value: 'Laptop setup and access badges' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(apiMock.onboardingApi.updateTemplate).toHaveBeenCalledTimes(1));

    const [, payload] = apiMock.onboardingApi.updateTemplate.mock.calls[0];
    expect(payload.tasks).toHaveLength(2);
    expect(payload.tasks[1].title).toBe('Laptop setup and access badges');
  });
});
