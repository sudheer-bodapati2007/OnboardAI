// src/tests/employee.addtask.test.jsx
// Regression tests for the "Add Task" feature on the Employee Detail page.
//
// Verifies that HR can assign an additional task to an employee whose
// onboarding is already COMPLETED:
//   1. The Add Task button is always visible (independent of onboarding
//      progress) and opens the modal.
//   2. Submitting the form calls employeesApi.createTask with the entered
//      title, description, category and due date.
//   3. Existing completed tasks remain listed and untouched.
//   4. Validation: the submit button stays disabled until a title is entered.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const apiMock = vi.hoisted(() => ({
  employeesApi: {
    get: vi.fn(),
    getTasks: vi.fn(),
    createTask: vi.fn(),
    startOnboarding: vi.fn(),
    updateStatus: vi.fn(),
    uploadProfileImage: vi.fn(),
  },
  onboardingApi: {
    listTemplates: vi.fn(),
  },
}));
vi.mock('../services/api.js', () => apiMock);

vi.mock('../contexts/RealtimeContext.jsx', () => ({
  useSocketEvent: () => {},
  useRealtimeReconnect: () => {},
}));

import EmployeeDetailPage from '../pages/EmployeeDetailPage.jsx';

const EMPLOYEE = {
  _id: 'emp-1',
  fullName: 'Emp One',
  email: 'emp@orga.test',
  jobTitle: 'Engineer',
  department: 'Engineering',
  manager: '',
  startDate: '2026-01-01T00:00:00.000Z',
  status: 'active',
};

// Onboarding COMPLETED: every task completed.
const COMPLETED_TASKS = [
  { _id: 'task-1', title: 'Sign contract', description: '', category: 'HR',
    status: 'completed', completedAt: '2026-01-05T10:00:00.000Z', dueDate: '2026-01-05', order: 1 },
  { _id: 'task-2', title: 'Laptop setup', description: '', category: 'IT Setup',
    status: 'completed', completedAt: '2026-01-06T10:00:00.000Z', dueDate: '2026-01-06', order: 2 },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/employees/emp-1']}>
      <Routes>
        <Route path="/employees/:id" element={<EmployeeDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiMock.employeesApi.get.mockResolvedValue({ data: { employee: EMPLOYEE } });
  apiMock.employeesApi.getTasks.mockResolvedValue({ data: { tasks: COMPLETED_TASKS } });
  apiMock.employeesApi.createTask.mockResolvedValue({ data: { task: {} } });
  apiMock.onboardingApi.listTemplates.mockResolvedValue({ data: { templates: [] } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EmployeeDetailPage — Add Task after onboarding completion', () => {

  it('shows the Add Task button and the completed tasks', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Emp One')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument();

    // Completed onboarding is visible: both completed tasks listed.
    expect(await screen.findByText('Sign contract')).toBeInTheDocument();
    expect(screen.getByText('Laptop setup')).toBeInTheDocument();
    expect(screen.getByText(/2\/2 tasks/)).toBeInTheDocument();
  });

  it('opens the modal and submits the new task with the entered fields', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Add Task/i }));
    expect(screen.getByText(/Add Task — Emp One/)).toBeInTheDocument();

    // Submit is disabled until a title exists.
    const submit = screen.getByRole('button', { name: /Assign Task/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Shadow the customer success team/i), {
      target: { value: 'Security awareness training' },
    });
    fireEvent.change(screen.getByPlaceholderText(/What should the employee do/i), {
      target: { value: 'Complete the annual training module.' },
    });
    fireEvent.change(document.querySelector('input[type="date"]'), {
      target: { value: '2026-12-01' },
    });

    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(apiMock.employeesApi.createTask).toHaveBeenCalledTimes(1),
    );
    const [employeeId, payload] = apiMock.employeesApi.createTask.mock.calls[0];
    expect(employeeId).toBe('emp-1');
    expect(payload).toEqual({
      title: 'Security awareness training',
      description: 'Complete the annual training module.',
      category: 'General',
      dueDate: '2026-12-01',
    });

    // Modal closes after success.
    await waitFor(() =>
      expect(screen.queryByText(/Add Task — Emp One/)).not.toBeInTheDocument(),
    );
  });

  it('completed tasks remain listed and unchanged after the new task is added', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Sign contract')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Add Task/i }));
    fireEvent.change(screen.getByPlaceholderText(/Shadow the customer success team/i), {
      target: { value: 'Extra task' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Assign Task/i }));

    await waitFor(() => expect(apiMock.employeesApi.createTask).toHaveBeenCalledTimes(1));

    // The page refetches; completed tasks are still rendered as completed.
    await waitFor(() =>
      expect(apiMock.employeesApi.getTasks.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    expect(await screen.findByText('Sign contract')).toBeInTheDocument();
    expect(screen.getByText('Laptop setup')).toBeInTheDocument();
  });
});
