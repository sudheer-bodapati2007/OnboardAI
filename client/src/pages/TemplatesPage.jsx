// src/pages/TemplatesPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ClipboardList, Edit2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { onboardingApi } from '../services/api.js';
import { PageLoading } from '../components/ui/LoadingSpinner.jsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2, GripVertical, Loader2 } from 'lucide-react';

const taskSchema = z.object({
  title: z.string().min(1, 'Task title required').max(300),
  description: z.string().max(1000).optional().default(''),
  category: z.string().max(100).optional().default('General'),
  dueDayOffset: z.coerce.number().int().min(0).optional().default(0),
});

const templateSchema = z.object({
  name: z.string().min(1, 'Template name required').max(200),
  description: z.string().max(500).optional().default(''),
  roleTarget: z.string().max(100).optional().default('General'),
  tasks: z.array(taskSchema).optional().default([]),
});

const CATEGORIES = ['Documentation', 'IT Setup', 'Training', 'Meetings', 'HR', 'Compliance', 'General'];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [serverError, setServerError] = useState(null);
  // Index of the task row awaiting delete confirmation (inside the modal).
  const [pendingTaskDelete, setPendingTaskDelete] = useState(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await onboardingApi.listTemplates();
      setTemplates(res.data.templates);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(templateSchema) });

  const { fields, append, remove } = useFieldArray({ control, name: 'tasks' });

  function openCreate() {
    setEditingTemplate(null);
    reset({ name: '', description: '', roleTarget: '', tasks: [] });
    setServerError(null);
    setPendingTaskDelete(null);
    setShowModal(true);
  }

  function openEdit(template) {
    setEditingTemplate(template);
    reset({
      name: template.name,
      description: template.description ?? '',
      roleTarget: template.roleTarget ?? '',
      tasks: (template.tasks ?? []).map((t) => ({
        title: t.title,
        description: t.description ?? '',
        category: t.category ?? 'General',
        dueDayOffset: t.dueDayOffset ?? 0,
      })),
    });
    setServerError(null);
    setPendingTaskDelete(null);
    setShowModal(true);
  }

  async function onSubmit(data) {
    setServerError(null);
    try {
      if (editingTemplate) {
        const res = await onboardingApi.updateTemplate(editingTemplate._id, data);
        setTemplates((prev) => prev.map((t) => t._id === editingTemplate._id ? res.data.template : t));
      } else {
        const res = await onboardingApi.createTemplate(data);
        setTemplates((prev) => [res.data.template, ...prev]);
      }
      setShowModal(false);
    } catch (err) {
      setServerError(err.message);
    }
  }

  const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Onboarding Templates</h1>
          <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">Reusable task sets for different roles</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {loading ? (
        <PageLoading message="Loading templates…" />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchTemplates} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No templates yet"
          description="Create your first onboarding template to get started"
          action={<button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Create Template</button>}
        />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t._id} className="bg-white border border-slate-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-center gap-4 p-5">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center flex-shrink-0 dark:bg-navy-900/60 dark:border-navy-800/50">
                  <ClipboardList className="w-5 h-5 text-indigo-600 dark:text-navy-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white">{t.name}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-500 mt-0.5">
                    {t.roleTarget} · {t.tasks?.length ?? 0} tasks
                    {t.description && ` · ${t.description}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(t)} className="btn-ghost p-2">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleExpand(t._id)}
                    className="btn-ghost p-2"
                  >
                    {expanded[t._id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {expanded[t._id] && t.tasks?.length > 0 && (
                <div className="border-t border-slate-200 divide-y divide-slate-100 dark:border-gray-800 dark:divide-gray-800/50">
                  {t.tasks.map((task, i) => (
                    <div key={task._id ?? i} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-gray-800 flex items-center justify-center text-xs text-slate-500 dark:text-gray-400 flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 dark:text-gray-200">{task.title}</p>
                        <p className="text-xs text-slate-500 dark:text-gray-500">{task.category} · Due day +{task.dueDayOffset ?? 0}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingTemplate ? 'Edit Template' : 'New Template'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {serverError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:border-red-800/50 dark:text-red-400">
              {serverError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Template Name *</label>
              <input {...register('name')} className="input" placeholder="Software Engineer Onboarding" />
              {errors.name && <p className="form-error">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Role Target</label>
              <input {...register('roleTarget')} className="input" placeholder="e.g. Software Engineer" />
            </div>
            <div>
              <label className="label">Description</label>
              <input {...register('description')} className="input" placeholder="Brief description…" />
            </div>
          </div>

          {/* Tasks */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-700 dark:text-gray-300">Tasks ({fields.length})</label>
              <button
                type="button"
                onClick={() => { setPendingTaskDelete(null); append({ title: '', description: '', category: 'General', dueDayOffset: 0 }); }}
                className="text-indigo-600 hover:text-indigo-700 dark:text-navy-400 dark:hover:text-navy-300 text-sm font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Task
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {fields.map((field, index) => (
                <div key={field.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 dark:bg-gray-800/50 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <input
                      {...register(`tasks.${index}.title`)}
                      className="input flex-1 text-sm"
                      placeholder={`Task ${index + 1} title…`}
                    />
                    <button
                      type="button"
                      onClick={() => setPendingTaskDelete((prev) => (prev === index ? null : index))}
                      aria-label="Remove task"
                      className="p-1.5 text-slate-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {errors.tasks?.[index]?.title && (
                    <p className="form-error">{errors.tasks[index].title.message}</p>
                  )}

                  {/* Delete confirmation — two-step, inline, before remove() fires */}
                  {pendingTaskDelete === index && (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 dark:bg-red-900/20 dark:border-red-800/50">
                      <span className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 min-w-0">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">
                          Delete “{fields[index]?.title || 'Untitled task'}”? This cannot be undone.
                        </span>
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          aria-label="Cancel delete"
                          onClick={() => setPendingTaskDelete(null)}
                          className="px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          aria-label="Confirm delete"
                          onClick={() => { remove(index); setPendingTaskDelete(null); }}
                          className="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-500 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <select {...register(`tasks.${index}.category`)} className="input text-xs">
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 dark:text-gray-500 whitespace-nowrap">Due day +</span>
                      <input
                        {...register(`tasks.${index}.dueDayOffset`)}
                        type="number" min="0"
                        className="input text-xs w-20"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <input
                    {...register(`tasks.${index}.description`)}
                    className="input text-xs"
                    placeholder="Description (optional)"
                  />
                </div>
              ))}
              {fields.length === 0 && (
                <p className="text-center text-sm text-slate-500 dark:text-gray-500 py-4">
                  No tasks yet. Click "Add Task" to begin building this template.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-gray-800">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isSubmitting ? 'Saving…' : editingTemplate ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

