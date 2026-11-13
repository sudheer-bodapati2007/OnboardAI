// src/pages/EmployeeDetailPage.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, UserX, UserCheck, Briefcase, Mail,
  Calendar, ClipboardList, Play, CheckCircle2, Clock, AlertCircle, Plus,
} from 'lucide-react';
import { employeesApi, onboardingApi } from '../services/api.js';
import { Badge } from '../components/ui/Badge.jsx';
import { ProgressBar } from '../components/ui/ProgressBar.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { PageLoading } from '../components/ui/LoadingSpinner.jsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { useSocketEvent, useRealtimeReconnect } from '../contexts/RealtimeContext.jsx';

const TASK_CATEGORIES = ['Documentation', 'IT Setup', 'Training', 'Meetings', 'HR', 'Compliance', 'General'];

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [startingOnboarding, setStartingOnboarding] = useState(false);
  const [onboardingError, setOnboardingError] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // ── Add Task (HR assigns an additional task at any lifecycle stage) ──
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', category: 'General', dueDate: '' });
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskError, setTaskError] = useState(null);

  function openAddTask() {
    setTaskForm({ title: '', description: '', category: 'General', dueDate: '' });
    setTaskError(null);
    setShowAddTaskModal(true);
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    setCreatingTask(true);
    setTaskError(null);
    try {
      await employeesApi.createTask(id, {
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        category: taskForm.category,
        dueDate: taskForm.dueDate || null,
      });
      setShowAddTaskModal(false);
      // Realtime `task:created` also triggers a silent refetch; this makes
      // the new row appear immediately even without a socket connection.
      fetchData(true);
    } catch (err) {
      setTaskError(err.message);
    } finally {
      setCreatingTask(false);
    }
  }

  const fetchData = useCallback(async (silent = false) => {
    // Silent refetches (real-time events, reconnect) update the data in place
    // instead of replacing the whole page with a spinner.
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [empRes, tasksRes, templatesRes] = await Promise.all([
        employeesApi.get(id),
        employeesApi.getTasks(id),
        onboardingApi.listTemplates(),
      ]);
      setEmployee(empRes.data.employee);
      setTasks(tasksRes.data.tasks ?? []);
      setTemplates(templatesRes.data.templates ?? []);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time updates — targeted, silent, and filtered to the viewed employee.
  // HR-only page: task events arrive on the `hr:<orgId>` room.
  useSocketEvent('task:created', (payload) => {
    if (payload?.employeeId === id) fetchData(true);
  });
  useSocketEvent('task:updated', (payload) => {
    if (payload?.employeeId === id) fetchData(true);
  });
  // Profile edits are pushed with the full sanitised employee — patch in place.
  useSocketEvent('employee:updated', (payload) => {
    if (payload?.employee?._id === id) setEmployee(payload.employee);
  });
  useRealtimeReconnect(() => fetchData(true));

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const completionPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const now = new Date();
  const overdueCount = tasks.filter(
    (t) => t.status !== 'completed' && t.dueDate && new Date(t.dueDate) < now
  ).length;

  async function handleStartOnboarding() {
    if (!selectedTemplate) return;
    setStartingOnboarding(true);
    setOnboardingError(null);
    try {
      await employeesApi.startOnboarding(id, selectedTemplate);
      setShowOnboardingModal(false);
      fetchData();
    } catch (err) {
      setOnboardingError(err.message);
    } finally {
      setStartingOnboarding(false);
    }
  }

  async function handleStatusChange(newStatus) {
    setStatusUpdating(true);
    try {
      const res = await employeesApi.updateStatus(id, newStatus);
      setEmployee(res.data.employee);
    } catch {
      // ignore UI error for quick toggle
    } finally {
      setStatusUpdating(false);
    }
  }

  if (loading) return <PageLoading />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;
  if (!employee) return null;

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/employees')} className="btn-ghost p-2 mt-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{employee.fullName}</h1>
              <p className="text-slate-500 dark:text-gray-400 text-sm">{employee.jobTitle} · {employee.department}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant={employee.status} />
              <button
                onClick={() => navigate(`/employees/${id}/edit`)}
                className="btn-secondary"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
              {employee.status === 'inactive' ? (
                <button
                  onClick={() => handleStatusChange('active')}
                  disabled={statusUpdating}
                  className="btn-secondary"
                >
                  <UserCheck className="w-4 h-4" />
                  Activate
                </button>
              ) : (
                <button
                  onClick={() => handleStatusChange('inactive')}
                  disabled={statusUpdating}
                  className="btn-danger"
                >
                  <UserX className="w-4 h-4" />
                  Deactivate
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoChip icon={Mail} label="Email" value={employee.email} />
        <InfoChip icon={Briefcase} label="Manager" value={employee.manager ?? '—'} />
        <InfoChip icon={Calendar} label="Start Date" value={fmtDate(employee.startDate)} />
        <InfoChip icon={ClipboardList} label="Tasks" value={`${completedCount} / ${tasks.length} done`} />
      </div>

      {/* Onboarding progress */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Onboarding Progress</h2>
            {tasks.length > 0 && (
              <p className="text-sm text-slate-500 dark:text-gray-400 mt-0.5">
                {completedCount}/{tasks.length} tasks · {completionPct}% complete
                {overdueCount > 0 && (
                  <span className="text-red-500 dark:text-red-400 ml-2">· {overdueCount} overdue</span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Add Task is always available — onboarding state does not matter.
                Works before, during and after onboarding, even when complete. */}
            <button onClick={openAddTask} className="btn-secondary">
              <Plus className="w-4 h-4" />
              Add Task
            </button>
            {tasks.length === 0 && (
              <button onClick={() => setShowOnboardingModal(true)} className="btn-primary">
                <Play className="w-4 h-4" />
                Start Onboarding
              </button>
            )}
          </div>
        </div>

        {tasks.length > 0 && <ProgressBar percent={completionPct} />}

        {tasks.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No onboarding plan"
            description="Select a template to generate tasks for this employee"
          />
        ) : (
          <div className="mt-5 space-y-2">
            {tasks.map((task) => (
              <TaskRow key={task._id} task={task} now={now} />
            ))}
          </div>
        )}
      </div>

      {/* Start onboarding modal */}
      <Modal
        isOpen={showOnboardingModal}
        onClose={() => { setShowOnboardingModal(false); setOnboardingError(null); }}
        title="Start Onboarding"
      >
        <div className="space-y-4">
          <p className="text-slate-500 dark:text-gray-400 text-sm">
            Select a template to generate onboarding tasks for{' '}
            <span className="text-slate-900 dark:text-white font-medium">{employee.fullName}</span>.
          </p>

          {templates.length === 0 ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-600 dark:bg-amber-900/20 dark:border-amber-700/50 dark:text-amber-400">
              No templates available. Create a template in the Templates section first.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <label key={t._id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedTemplate === t._id ? 'border-indigo-400 bg-indigo-50 dark:border-navy-600 dark:bg-navy-900/20' : 'border-slate-200 hover:border-slate-300 dark:border-gray-700 dark:hover:border-gray-600'}`}>
                  <input
                    type="radio"
                    name="template"
                    value={t._id}
                    checked={selectedTemplate === t._id}
                    onChange={() => setSelectedTemplate(t._id)}
                    className="mt-0.5 accent-navy-500"
                  />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{t.name}</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">{t.roleTarget} · {t.tasks?.length ?? 0} tasks</p>
                    {t.description && <p className="text-xs text-slate-500 dark:text-gray-500 mt-1">{t.description}</p>}
                  </div>
                </label>
              ))}
            </div>
          )}

          {onboardingError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:border-red-800/50 dark:text-red-400">
              {onboardingError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={() => setShowOnboardingModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleStartOnboarding}
              disabled={!selectedTemplate || startingOnboarding || templates.length === 0}
              className="btn-primary"
            >
              {startingOnboarding ? 'Generating…' : 'Generate Tasks'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Task modal — HR assigns an additional task, any lifecycle stage */}
      <Modal
        isOpen={showAddTaskModal}
        onClose={() => { setShowAddTaskModal(false); setTaskError(null); }}
        title={`Add Task — ${employee.fullName}`}
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          {taskError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:border-red-800/50 dark:text-red-400">
              {taskError}
            </div>
          )}

          <div>
            <label className="label">Task Title *</label>
            <input
              value={taskForm.title}
              onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
              className="input"
              placeholder="e.g. Shadow the customer success team"
              required
              maxLength={300}
            />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              value={taskForm.description}
              onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
              className="input"
              rows={3}
              placeholder="What should the employee do? (optional)"
              maxLength={1000}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select
                value={taskForm.category}
                onChange={(e) => setTaskForm((f) => ({ ...f, category: e.target.value }))}
                className="input"
              >
                {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Due Date</label>
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="input"
              />
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-gray-500">
            This task is assigned independently of onboarding — completing it will
            not reopen or change the employee's onboarding status.
          </p>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => { setShowAddTaskModal(false); setTaskError(null); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingTask || !taskForm.title.trim()}
              className="btn-primary"
            >
              {creatingTask ? 'Assigning…' : 'Assign Task'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function InfoChip({ icon: Icon, label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 dark:bg-gray-900 dark:border-gray-800">
      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-500 dark:text-gray-400" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function TaskRow({ task, now }) {
  const isOverdue = task.status !== 'completed' && task.dueDate && new Date(task.dueDate) < now;
  const icon =
    task.status === 'completed' ? CheckCircle2 :
    task.status === 'in_progress' ? Clock :
    isOverdue ? AlertCircle : Clock;
  const iconColor =
    task.status === 'completed' ? 'text-emerald-500 dark:text-green-400' :
    isOverdue ? 'text-red-500 dark:text-red-400' :
    task.status === 'in_progress' ? 'text-indigo-500 dark:text-blue-400' : 'text-slate-400 dark:text-gray-500';

  const Icon = icon;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${task.status === 'completed' ? 'border-emerald-200 bg-emerald-50 dark:border-green-900/30 dark:bg-green-900/5' : isOverdue ? 'border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/5' : 'border-slate-200 bg-slate-50 dark:border-gray-800 dark:bg-gray-800/20'}`}>
      <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'line-through text-slate-400 dark:text-gray-500' : 'text-slate-700 dark:text-gray-200'}`}>
          {task.title}
        </p>
        <p className="text-xs text-slate-500 dark:text-gray-500">{task.category}{task.dueDate ? ` · Due ${fmtDate(task.dueDate)}` : ''}</p>
      </div>
      <Badge variant={task.status} />
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

