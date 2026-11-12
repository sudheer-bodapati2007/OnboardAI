// src/pages/PolicyPage.jsx
// HR admin only — upload, view, and delete company policy PDFs.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Upload, Trash2, RefreshCw, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { policiesApi } from '../services/api.js';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { useSocketEvent, useRealtimeReconnect } from '../contexts/RealtimeContext.jsx';

// Map policy status to Badge variant (existing variants: active, onboarding, inactive, pending, in_progress, completed)
const STATUS_MAP = {
  pending:    { label: 'Pending',    variant: 'pending',     Icon: Clock,        iconClass: 'text-yellow-400' },
  processing: { label: 'Processing', variant: 'in_progress', Icon: RefreshCw,    iconClass: 'text-indigo-400 animate-spin' },
  ready:      { label: 'Ready',      variant: 'completed',   Icon: CheckCircle,  iconClass: 'text-green-400' },
  failed:     { label: 'Failed',     variant: 'inactive',    Icon: XCircle,      iconClass: 'text-red-400' },
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function PolicyPage() {
  const [policies, setPolicies]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const fileInputRef                    = useRef(null);
  const pollingRef                      = useRef(null);

  const fetchPolicies = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await policiesApi.list();
      setPolicies(res.data?.documents ?? []);
      setError(null);
    } catch (err) {
      setError(err.message ?? 'Failed to load policies');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  // Real-time: the backend emits `policy:updated` (HR room) when background
  // processing reaches a terminal state. This resolves the wait instantly;
  // the short poll below remains only as a fallback for missed events while
  // a document is still pending/processing.
  useSocketEvent('policy:updated', () => fetchPolicies(true));
  useRealtimeReconnect(() => fetchPolicies(true));

  // Poll every 5s while any doc is pending/processing
  useEffect(() => {
    const hasPending = policies.some((p) => p.status === 'pending' || p.status === 'processing');
    if (hasPending && !pollingRef.current) {
      pollingRef.current = setInterval(() => fetchPolicies(true), 5000);
    } else if (!hasPending && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [policies, fetchPolicies]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadError(null);

    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are accepted.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('File too large. Maximum size is 20 MB.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    try {
      await policiesApi.upload(formData);
      await fetchPolicies();
    } catch (err) {
      setUploadError(err.message ?? 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await policiesApi.delete(deleteTarget._id);
      setPolicies((prev) => prev.filter((p) => p._id !== deleteTarget._id));
      setDeleteTarget(null);
    } catch (err) {
      setUploadError(err.message ?? 'Delete failed');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Policy Documents</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Upload company PDFs — they are processed into the AI knowledge base.
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn-primary flex items-center gap-2"
        >
          {uploading ? <LoadingSpinner size="sm" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Uploading…' : 'Upload PDF'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Upload error banner */}
      {uploadError && (
        <div className="mb-4 flex items-start gap-3 p-3 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-sm flex-1">{uploadError}</p>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-200">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner /></div>
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchPolicies} />
      ) : policies.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No policy documents yet"
          description="Upload your first PDF to populate the AI knowledge base."
          action={
            <button onClick={() => fileInputRef.current?.click()} className="btn-primary flex items-center gap-2">
              <Upload className="w-4 h-4" /> Upload PDF
            </button>
          }
        />
      ) : (
        <div className="card divide-y divide-gray-800">
          {policies.map((doc) => {
            const info = STATUS_MAP[doc.status] ?? STATUS_MAP.pending;
            return (
              <div
                key={doc._id}
                className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{doc.originalName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDate(doc.createdAt)} · {formatBytes(doc.sizeBytes)}
                    {doc.pageCount ? ` · ${doc.pageCount} page${doc.pageCount !== 1 ? 's' : ''}` : ''}
                    {doc.chunkCount ? ` · ${doc.chunkCount} chunks` : ''}
                  </p>
                  {doc.errorMessage && (
                    <p className="text-xs text-red-400 mt-0.5 truncate">{doc.errorMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <info.Icon className={`w-3.5 h-3.5 ${info.iconClass}`} />
                  <Badge variant={info.variant} label={info.label} />
                </div>
                <button
                  onClick={() => setDeleteTarget(doc)}
                  className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/10 transition-all flex-shrink-0"
                  title="Delete document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-600 text-center">
        Documents are stored locally in development. Configure{' '}
        <code className="font-mono">STORAGE_PROVIDER=gcs</code> for persistent production storage.
      </p>

      {/* Delete confirm modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Policy Document"
      >
        <p className="text-sm text-gray-300 mb-6">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-white">{deleteTarget?.originalName}</span>?{' '}
          All associated AI knowledge chunks will be permanently removed.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setDeleteTarget(null)}
            className="btn-secondary"
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="btn-primary flex items-center gap-2"
            style={{ background: '#b91c1c', borderColor: '#b91c1c' }}
            disabled={deleting}
          >
            {deleting && <LoadingSpinner size="sm" />}
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
