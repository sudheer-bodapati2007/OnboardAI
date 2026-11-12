// src/pages/EmployeesPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, UserPlus } from 'lucide-react';
import { employeesApi } from '../services/api.js';
import { Badge } from '../components/ui/Badge.jsx';
import { PageLoading } from '../components/ui/LoadingSpinner.jsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Pagination } from '../components/ui/Pagination.jsx';
import { useSocketEvent, useRealtimeReconnect } from '../contexts/RealtimeContext.jsx';

const DEPARTMENTS = ['Engineering', 'HR', 'Sales', 'Marketing', 'Finance', 'Operations'];
const STATUSES = ['active', 'onboarding', 'inactive'];

export default function EmployeesPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchEmployees = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await employeesApi.list({
        page,
        limit: 15,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(department && { department }),
        ...(status && { status }),
      });
      setEmployees(res.data.employees);
      setMeta(res.meta);
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, debouncedSearch, department, status]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  // Real-time: profile edits are patched into the visible rows in place —
  // no fetch, no flicker. New employees trigger one silent refetch so
  // pagination counts stay accurate.
  useSocketEvent('employee:updated', (payload) => {
    const updated = payload?.employee;
    if (!updated?._id) return;
    setEmployees((prev) =>
      prev.map((e) => (e._id === updated._id ? { ...e, ...updated } : e))
    );
  });
  useSocketEvent('employee:created', () => fetchEmployees(true));
  useRealtimeReconnect(() => fetchEmployees(true));

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [debouncedSearch, department, status]);

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Employees</h1>
          <p className="text-gray-400 text-sm mt-1">
            {meta.total > 0 ? `${meta.total} total employee${meta.total !== 1 ? 's' : ''}` : 'Manage your workforce'}
          </p>
        </div>
        <button
          onClick={() => navigate('/employees/new')}
          className="btn-primary flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Employee
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select value={department} onChange={(e) => setDepartment(e.target.value)} className="input sm:w-44">
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input sm:w-40">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <PageLoading message="Loading employees…" />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchEmployees} />
      ) : employees.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No employees found"
          description={debouncedSearch || department || status ? 'Try adjusting your filters' : 'Add your first employee to get started'}
          action={
            !debouncedSearch && !department && !status && (
              <button onClick={() => navigate('/employees/new')} className="btn-primary">
                <Plus className="w-4 h-4" /> Add Employee
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Job Title</th>
                  <th>Start Date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="bg-gray-900">
                {employees.map((emp) => (
                  <tr key={emp._id}>
                    <td>
                      <div>
                        <p className="font-medium text-white">{emp.fullName}</p>
                        <p className="text-xs text-gray-500">{emp.email}</p>
                      </div>
                    </td>
                    <td className="text-gray-300">{emp.department}</td>
                    <td className="text-gray-300">{emp.jobTitle}</td>
                    <td className="text-gray-400 text-sm">{fmtDate(emp.startDate)}</td>
                    <td><Badge variant={emp.status} /></td>
                    <td>
                      <button
                        onClick={() => navigate(`/employees/${emp._id}`)}
                        className="text-navy-400 hover:text-navy-300 text-sm font-medium transition-colors"
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

