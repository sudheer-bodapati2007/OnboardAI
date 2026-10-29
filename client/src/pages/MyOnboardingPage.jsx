// src/pages/MyOnboardingPage.jsx
// Employee-facing onboarding journey page.
import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2, Circle, Clock, AlertCircle, Sparkles, ChevronDown, ChevronUp,
} from 'lucide-react';
import { onboardingApi, tasksApi } from '../services/api.js';
import { ProgressBar } from '../components/ui/ProgressBar.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { PageLoading } from '../components/ui/LoadingSpinner.jsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

const STATUS_ORDER = ['pending', 'in_progress', 'completed'];

export default function MyOnboardingPage() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingTask, setUpdatingTask] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await onboardingApi.getMyTasks();
      setEmployee(res.data.employee);
      setTasks(res.data.tasks ?? []);
      // Expand all categories by default
      const cats = [...new Set((res.data.tasks ?? []).map((t) => t.category))];
      setExpandedCategories(Object.fromEntries(cats.map((c) => [c, true])));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function cycleStatus(task) {
    const currentIndex = STATUS_ORDER.indexOf(task.status);
    const nextStatus = STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length];
    setUpdatingTask(task._id);
    try {
      const res = await tasksApi.updateStatus(task._id, nextStatus);
      setTasks((prev) => prev.map((t) => t._id === task._id ? res.data.task : t));
    } catch {
      // Could display inline error
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
    <div className="animate-fadeIn space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-navy-600/20 border border-navy-600/30 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-6 h-6 text-navy-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">My Onboarding</h1>
          <p className="text-gray-400 text-sm mt-0.5">
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
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-gray-400">
                  {employee.jobTitle} · {employee.department}
                </p>
                <p className="text-lg font-semibold text-white mt-0.5">
                  {completed}/{tasks.length} tasks completed
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">{pct}%</p>
                {overdue > 0 && (
                  <p className="text-xs text-red-400 mt-1">{overdue} overdue</p>
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
              <div key={cat} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">{cat}</span>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                      {catCompleted}/{catTasks.length}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-800 divide-y divide-gray-800/50">
                    {catTasks.map((task) => {
                      const isOverdueTask =
                        task.status !== 'completed' && task.dueDate && new Date(task.dueDate) < now;

                      return (
                        <div key={task._id} className="flex items-start gap-3 p-4">
                          {/* Status toggle button */}
                          <button
                            onClick={() => cycleStatus(task)}
                            disabled={updatingTask === task._id}
                            className="mt-0.5 flex-shrink-0 transition-transform hover:scale-110 disabled:opacity-50"
                            title={`Click to advance status (current: ${task.status})`}
                          >
                            {task.status === 'completed' ? (
                              <CheckCircle2 className="w-5 h-5 text-green-400" />
                            ) : task.status === 'in_progress' ? (
                              <Clock className="w-5 h-5 text-blue-400" />
                            ) : isOverdueTask ? (
                              <AlertCircle className="w-5 h-5 text-red-400" />
                            ) : (
                              <Circle className="w-5 h-5 text-gray-500" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-xs text-gray-500 mt-1">{task.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5">
                              {task.dueDate && (
                                <span className={`text-xs ${isOverdueTask ? 'text-red-400' : 'text-gray-500'}`}>
                                  Due {fmtDate(task.dueDate)}
                                </span>
                              )}
                              {task.completedAt && (
                                <span className="text-xs text-green-400">
                                  ✓ {fmtDate(task.completedAt)}
                                </span>
                              )}
                            </div>
                          </div>

                          <Badge variant={task.status} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {pct === 100 && (
            <div className="rounded-xl bg-green-900/20 border border-green-700/50 p-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-white mb-1">🎉 Onboarding Complete!</h3>
              <p className="text-gray-400 text-sm">
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

