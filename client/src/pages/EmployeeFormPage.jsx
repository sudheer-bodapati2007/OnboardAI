// src/pages/EmployeeFormPage.jsx
// Create or edit an employee.
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { employeesApi } from '../services/api.js';
import { PageLoading } from '../components/ui/LoadingSpinner.jsx';

const schema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  email: z.string().email('Valid email required'),
  jobTitle: z.string().min(1, 'Job title is required').max(150),
  department: z.string().min(1, 'Department is required').max(150),
  manager: z.string().max(200).optional().or(z.literal('')),
  startDate: z.string().min(1, 'Start date is required'),
  status: z.enum(['active', 'inactive', 'onboarding']),
});

const DEPARTMENTS = ['Engineering', 'HR', 'Sales', 'Marketing', 'Finance', 'Operations', 'Product', 'Design', 'Legal'];

export default function EmployeeFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [loadingEmployee, setLoadingEmployee] = useState(isEdit);
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { status: 'onboarding' },
  });

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const res = await employeesApi.get(id);
        const emp = res.data.employee;
        reset({
          fullName: emp.fullName,
          email: emp.email,
          jobTitle: emp.jobTitle,
          department: emp.department,
          manager: emp.manager ?? '',
          startDate: emp.startDate ? emp.startDate.split('T')[0] : '',
          status: emp.status,
        });
      } catch (err) {
        setServerError(err.message);
      } finally {
        setLoadingEmployee(false);
      }
    })();
  }, [id, isEdit, reset]);

  async function onSubmit(data) {
    setServerError(null);
    try {
      if (isEdit) {
        await employeesApi.update(id, data);
      } else {
        const res = await employeesApi.create(data);
        // Navigate to newly created employee detail
        navigate(`/employees/${res.data.employee._id}`, { replace: true });
        return;
      }
      navigate(`/employees/${id}`);
    } catch (err) {
      setServerError(err.message ?? 'Failed to save employee');
    }
  }

  if (loadingEmployee) return <PageLoading />;

  return (
    <div className="animate-fadeIn max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? 'Edit Employee' : 'Add Employee'}</h1>
          <p className="text-gray-400 text-sm">{isEdit ? 'Update employee information' : 'Create a new employee record'}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
        {serverError && (
          <div className="rounded-lg bg-red-900/20 border border-red-800/50 p-3 text-sm text-red-400">
            {serverError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="label">Full Name *</label>
            <input {...register('fullName')} className="input" placeholder="Jane Smith" />
            {errors.fullName && <p className="form-error">{errors.fullName.message}</p>}
          </div>

          <div>
            <label className="label">Email *</label>
            <input {...register('email')} type="email" className="input" placeholder="jane@company.com" />
            {errors.email && <p className="form-error">{errors.email.message}</p>}
          </div>

          <div>
            <label className="label">Job Title *</label>
            <input {...register('jobTitle')} className="input" placeholder="Software Engineer" />
            {errors.jobTitle && <p className="form-error">{errors.jobTitle.message}</p>}
          </div>

          <div>
            <label className="label">Department *</label>
            <select {...register('department')} className="input">
              <option value="">Select department…</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {errors.department && <p className="form-error">{errors.department.message}</p>}
          </div>

          <div>
            <label className="label">Manager (optional)</label>
            <input {...register('manager')} className="input" placeholder="Manager name" />
            {errors.manager && <p className="form-error">{errors.manager.message}</p>}
          </div>

          <div>
            <label className="label">Start Date *</label>
            <input {...register('startDate')} type="date" className="input" />
            {errors.startDate && <p className="form-error">{errors.startDate.message}</p>}
          </div>

          <div>
            <label className="label">Status</label>
            <select {...register('status')} className="input">
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSubmitting ? 'Saving…' : 'Save Employee'}
          </button>
        </div>
      </form>
    </div>
  );
}

