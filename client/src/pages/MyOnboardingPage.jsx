// src/pages/MyOnboardingPage.jsx
// Employee-facing onboarding journey page.
import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2, Circle, Clock, AlertCircle, Sparkles, ChevronDown, ChevronUp,
  RotateCcw, Loader2,
} from 'lucide-react';
import { onboardingApi, tasksApi } from '../services/api.js';
import { ProgressBar } from '../components/ui/ProgressBar.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { PageLoading } from '../components/ui/LoadingSpinner.jsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSocketEvent, useRealtimeReconnect } from '../contexts/RealtimeContext.jsx';

export default function MyOnboardingPage() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingTask, setUpdatingTask] = useState(null); // task._id being updated
  const [taskErrors, setTaskErrors] = useState({}); // { [taskId]: errorMessage }
  const [expandedCategories, setExpandedCategories] = useState({});

  const fetchTasks = useCallback(async (silent = false, { resetExpansion = false } = {}) => {
    // Silent refetches (real-time events, reconnect) never flip the page into
    // a loading spinner and never reset the expanded/collapsed sections —
    // except on a first-plan arrival, where defaults are applied explicitly.
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await onboardingApi.getMyTasks();
      setEmployee(res.data.employee);
      setTasks(res.data.tasks ?? []);
      if (!silent || resetExpansion) {
        // Expand all categories by default
        const cats = [...new Set((res.data.tasks ?? []).map((t) => t.category))];
        setExpandedCategories(Object.fromEntries(cats.map((c) => [c, true])));
      }
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Real-time: events arrive on this employee's private `user:<id>` room.
  // New tasks appear instantly — including the "no plan yet" → "plan ready"
  // transition, which also applies the default section expansion.
  useSocketEvent('task:created', () => fetchTasks(true, { resetExpansion: !employee }));
  // Status changes merge locally — no fetch, no spinner, no layout shift.
  useSocketEvent('task:updated', (payload) => {
    const updated = payload?.task;
    if (!updated) return;
    setTasks((prev) => {
      const exists = prev.some((t) => t._id === updated._id);
      if (!exists) {
        // Missed the created event (e.g. while offline) — pull persisted state.
        fetchTasks(true);
        return prev;
      }
      return prev.map((t) => (t._id === updated._id ? { ...t, ...updated } : t));
    });
  });
  // Reconnect: pull latest persisted state once (tasks may have changed offline).
  useRealtimeReconnect(() => fetchTasks(true));

  async function setTaskStatus(task, newStatus) {
    if (updatingTask === task._id) return; // prevent duplicate clicks
    setUpdatingTask(task._id);
    setTaskErrors((prev) => ({ ...prev, [task._id]: null }));
    try {
      const res = await tasksApi.updateStatus(task._id, newStatus);
      setTasks((prev) => prev.map((t) => t._id === task._id ? res.data.task : t));
    } catch (err) {
      setTaskErrors((prev) => ({
        ...prev,
        [task._id]: err?.response?.data?.message ?? err.message ?? 'Failed to update task',
      }));
    } finally {
      setUpdatingTask(null);
    }
  }

  if (loading) return <PageLoading message="Loading your onboarding…" />;
  if (error) return <ErrorMessage message={error} onRetry={fetchTasks} />;

  const now = new Date();
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const pct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
  const overdue = tasks.filter((t) => t.status !== 'completed' && t.dueDate && new Date(t.dueDate) < now).length;

  // Group by category
  const byCategory = {};
  tasks.forEach((t) => {
    const cat = t.category ?? 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(t);
  });

  const toggleCategory = (cat) =>
    setExpandedCategories((p) => ({ ...p, [cat]: !p[cat] }));

  return (
    <div className="animate-fadeIn space-y-6 max-w-3xl mx-auto bg-white dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-navy-600/20 border border-navy-600/30 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-6 h-6 text-navy-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Onboarding</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Welcome, {user?.name?.split(' ')[0]}! Track your onboarding progress below.
          </p>
        </div>
      </div>

      {!employee ? (
        <EmptyState
          title="No onboarding plan yet"
          description="Your HR team hasn't started your onboarding plan. Check back soon or contact your HR administrator."
        />
      ) : (
        <>
          {/* Progress summary */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {employee.jobTitle} · {employee.department}
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white mt-0.5">
                  {completed}/{tasks.length} tasks completed
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{pct}%</p>
                {overdue > 0 && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1">{overdue} overdue</p>
                )}
              </div>
            </div>
            <ProgressBar percent={pct} />
          </div>

          {/* Tasks by category */}
          {Object.entries(byCategory).map(([cat, catTasks]) => {
            const catCompleted = catTasks.filter((t) => t.status === 'completed').length;
            const isExpanded = expandedCategories[cat] !== false;

            return (
              <div key={cat} className="bg-white border border-slate-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-slate-900 dark:text-white">{cat}</span>
                    <span className="text-xs text-slate-500 dark:text-gray-500 bg-slate-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                      {catCompleted}/{catTasks.length}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 dark:text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 dark:text-gray-500" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-200 divide-y divide-slate-100 dark:border-gray-800 dark:divide-gray-800/50">
                    {catTasks.map((task) => {
                      const isCompleted = task.status === 'completed';
                      const isUpdating = updatingTask === task._id;
                      const isOverdueTask =
                        !isCompleted && task.dueDate && new Date(task.dueDate) < now;
                      const taskError = taskErrors[task._id];

                      return (
                        <div
                          key={task._id}
                          className={`p-4 transition-colors border rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 ${
                            isCompleted
                              ? 'bg-green-50 border-l-2 border-green-500 dark:bg-green-900/20 dark:border-green-500/50'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Status icon */}
                            <div className="mt-0.5 flex-shrink-0">
                              {isCompleted ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-green-400" />
                              ) : task.status === 'in_progress' ? (
                                <Clock className="w-5 h-5 text-indigo-500 dark:text-blue-400" />
                              ) : isOverdueTask ? (
                                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400" />
                              ) : (
                                <Circle className="w-5 h-5 text-slate-400 dark:text-gray-500" />
                              )}
                            </div>

                            {/* Task content */}
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-medium ${
                                  isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'
                                }`}
                              >
                                {task.title}
                              </p>
                              {task.description && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{task.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                {task.dueDate && (
                                  <span className={`text-xs ${isOverdueTask ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                    Due {fmtDate(task.dueDate)}
                                  </span>
                                )}
                                {task.completedAt && (
                                  <span className="text-xs text-emerald-500 dark:text-green-400">
                                    ✓ Completed {fmtDate(task.completedAt)}
                                  </span>
                                )}
                              </div>
                              {/* Per-task error */}
                              {taskError && (
                                <p className="text-xs text-red-500 dark:text-red-400 mt-1.5 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                  {taskError}
                                </p>
                              )}
                            </div>

                            {/* Right-side: badge + action */}
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              <Badge variant={task.status} />

                              {/* Action button */}
                              {isCompleted ? (
                                <button
                                  onClick={() => setTaskStatus(task, 'pending')}
                                  disabled={isUpdating}
                                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Undo completion"
                                >
                                  {isUpdating ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-3 h-3" />
                                  )}
                                  Undo
                                </button>
                              ) : (
                                <button
                                  onClick={() => setTaskStatus(task, 'completed')}
                                  disabled={isUpdating}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                    bg-emerald-50 border border-emerald-200 text-emerald-700
                                    hover:bg-emerald-100 hover:border-emerald-300 hover:text-emerald-800
                                    dark:bg-green-900/20 dark:border-green-600/50 dark:text-green-300
                                    dark:hover:bg-green-900/50 dark:hover:border-green-600/60 dark:hover:text-green-300
                                    transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Mark this task as complete"
                                >
                                  {isUpdating ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                  {isUpdating ? 'Saving…' : 'Mark Complete'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {pct === 100 && (
            <div className="rounded-xl bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-700/50 p-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">🎉 Onboarding Complete!</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                You've completed all your onboarding tasks. Welcome to the team!
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
