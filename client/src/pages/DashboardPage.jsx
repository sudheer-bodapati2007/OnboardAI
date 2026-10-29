// src/pages/DashboardPage.jsx
import React, { useEffect, useState } from 'react';
import {
  Users, UserCheck, Loader, CheckCircle2, Clock, AlertTriangle,
  TrendingUp, Activity,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { onboardingApi } from '../services/api.js';
import { PageLoading } from '../components/ui/LoadingSpinner.jsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

function StatCard({ icon: Icon, label, value, sub, color = 'navy' }) {
  const colors = {
    navy: 'text-navy-400 bg-navy-900/50 border-navy-800/50',
    green: 'text-green-400 bg-green-900/50 border-green-800/50',
    yellow: 'text-yellow-400 bg-yellow-900/50 border-yellow-800/50',
    red: 'text-red-400 bg-red-900/50 border-red-800/50',
    blue: 'text-blue-400 bg-blue-900/50 border-blue-800/50',
    purple: 'text-purple-400 bg-purple-900/50 border-purple-800/50',
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
      </div>
    </div>
  );
}

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'];

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchOverview() {
    setLoading(true);
    setError(null);
    try {
      const res = await onboardingApi.getOverview();
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchOverview(); }, []);

  if (loading) return <PageLoading message="Loading dashboard…" />;
  if (error) return <ErrorMessage message={error} onRetry={fetchOverview} />;

  const { employees, tasks, recentActivity, departmentBreakdown } = data;

  return (
    <div className="animate-fadeIn space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Good {getGreeting()}, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-400 text-sm mt-1">Here's what's happening with your onboarding today.</p>
      </div>

      {/* Employee stats */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Workforce</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Employees" value={employees.total} color="navy" />
          <StatCard icon={UserCheck} label="Active" value={employees.active} color="green" />
          <StatCard icon={Loader} label="Onboarding" value={employees.onboarding} color="blue" />
          <StatCard icon={CheckCircle2} label="Completed" value={employees.completedOnboarding} sub="journeys" color="purple" />
        </div>
      </div>

      {/* Task stats */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Tasks</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Activity} label="Total Tasks" value={tasks.total} color="navy" />
          <StatCard icon={Clock} label="Pending" value={tasks.pending} color="yellow" />
          <StatCard icon={CheckCircle2} label="Completed" value={tasks.completed} color="green" />
          <StatCard icon={AlertTriangle} label="Overdue" value={tasks.overdue} color="red" />
        </div>
      </div>

      {/* Completion + Department charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Avg completion */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Average Completion</h3>
          <div className="flex items-center gap-6">
            <div className="relative w-28 h-28 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#1f2937" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9155" fill="none"
                  stroke="#6366f1" strokeWidth="3"
                  strokeDasharray={`${tasks.avgCompletionPercent} ${100 - tasks.avgCompletionPercent}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-white">{tasks.avgCompletionPercent}%</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-navy-500" />
                <span className="text-xs text-gray-400">{tasks.completed} completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-600" />
                <span className="text-xs text-gray-400">{tasks.total - tasks.completed} remaining</span>
              </div>
              {tasks.overdue > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-xs text-red-400">{tasks.overdue} overdue</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Department breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Employees by Department</h3>
          {departmentBreakdown.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No department data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={departmentBreakdown} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="department" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#d1d5db' }}
                  itemStyle={{ color: '#a5b4fc' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {departmentBreakdown.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No activity yet. Tasks will appear here as employees complete them.</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((item) => (
              <div key={item.taskId} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/40">
                <div className="w-8 h-8 rounded-full bg-green-900/50 border border-green-800/50 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">
                    <span className="font-medium text-white">{item.employeeName}</span>
                    {' completed '}
                    <span className="text-navy-400">{item.title}</span>
                  </p>
                  <p className="text-xs text-gray-500">{item.department} • {fmtDate(item.completedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

