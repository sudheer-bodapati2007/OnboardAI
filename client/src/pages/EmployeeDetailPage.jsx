// src/pages/EmployeeDetailPage.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, UserX, UserCheck, Briefcase, Mail,
  Calendar, ClipboardList, Play, CheckCircle2, Clock, AlertCircle,
} from 'lucide-react';
import { employeesApi, onboardingApi } from '../services/api.js';
import { Badge } from '../components/ui/Badge.jsx';
import { ProgressBar } from '../components/ui/ProgressBar.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { PageLoading } from '../components/ui/LoadingSpinner.jsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { useSocketEvent, useRealtimeReconnect } from '../contexts/RealtimeContext.jsx';

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
              <h1 className="text-2xl font-bold text-white">{employee.fullName}</h1>
              <p className="text-gray-400 text-sm">{employee.jobTitle} · {employee.department}</p>
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-white">Onboarding Progress</h2>
            {tasks.length > 0 && (
              <p className="text-sm text-gray-400 mt-0.5">
                {completedCount}/{tasks.length} tasks · {completionPct}% complete
                {overdueCount > 0 && (
                  <span className="text-red-400 ml-2">· {overdueCount} overdue</span>
                )}
              </p>
            )}
          </div>
          {tasks.length === 0 && (
            <button onClick={() => setShowOnboardingModal(true)} className="btn-primary">
              <Play className="w-4 h-4" />
              Start Onboarding
            </button>
          )}
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
          <p className="text-gray-400 text-sm">
            Select a template to generate onboarding tasks for{' '}
            <span className="text-white font-medium">{employee.fullName}</span>.
          </p>

          {templates.length === 0 ? (
            <div className="rounded-lg bg-amber-900/20 border border-amber-700/50 p-3 text-sm text-amber-400">
              No templates available. Create a template in the Templates section first.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <label key={t._id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedTemplate === t._id ? 'border-navy-600 bg-navy-900/20' : 'border-gray-700 hover:border-gray-600'}`}>
                  <input
                    type="radio"
                    name="template"
                    value={t._id}
                    checked={selectedTemplate === t._id}
                    onChange={() => setSelectedTemplate(t._id)}
                    className="mt-0.5 accent-navy-500"
                  />
                  <div>
                    <p className="font-medium text-white text-sm">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.roleTarget} · {t.tasks?.length ?? 0} tasks</p>
                    {t.description && <p className="text-xs text-gray-500 mt-1">{t.description}</p>}
                  </div>
                </label>
              ))}
            </div>
          )}

          {onboardingError && (
            <div className="rounded-lg bg-red-900/20 border border-red-800/50 p-3 text-sm text-red-400">
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
    </div>
  );
}

function InfoChip({ icon: Icon, label, value }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-white truncate">{value}</p>
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
    task.status === 'completed' ? 'text-green-400' :
    isOverdue ? 'text-red-400' :
    task.status === 'in_progress' ? 'text-blue-400' : 'text-gray-500';

  const Icon = icon;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${task.status === 'completed' ? 'border-green-900/30 bg-green-900/5' : isOverdue ? 'border-red-900/30 bg-red-900/5' : 'border-gray-800 bg-gray-800/20'}`}>
      <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-200'}`}>
          {task.title}
        </p>
        <p className="text-xs text-gray-500">{task.category}{task.dueDate ? ` · Due ${fmtDate(task.dueDate)}` : ''}</p>
      </div>
      <Badge variant={task.status} />
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

