// src/services/api.js
// Centralised Axios instance with cookie-based auth and error normalisation.
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  withCredentials: true,          // send HttpOnly cookie
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ─── Long-running requests ───────────────────────────────────────────────────
// AI chat can legitimately take 30–90s: the backend embeds the question,
// retrieves policy chunks, then calls a reasoning model (gemini-3.8-flash)
// with bounded retries. The global 15s timeout aborted those requests
// ("timeout of 15000ms exceeded") while Gemini was still generating.
// 90s covers the backend's worst case (GEMINI_TOTAL_TIMEOUT_MS=55s budget +
// one 30s in-flight attempt) and stays under the Render proxy limit (~100s).
export const AI_TIMEOUT_MS = 90000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Statuses worth retrying at the transport level. Authentication (401/403),
// validation (400/404/422) and other permanent errors are never retried.
const TRANSIENT_STATUS = new Set([429, 502, 503, 504]);

/**
 * Retry a request once with backoff for transient failures:
 * network errors, timeouts (no response) and 429/502/503/504.
 *
 * A slow first attempt is NOT auto-retried (it would double the user's wait);
 * those get the visible Retry button instead. Duplicate submissions while a
 * request is in flight are prevented in AIChatPage via its `loading` guard.
 */
export async function withTransientRetry(requestFn, {
  retries = 1,
  delayMs = 2000,
  fastRetryWindowMs = 30000,
} = {}) {
  const startedAt = Date.now();
  try {
    return await requestFn();
  } catch (err) {
    const status = err?.status;
    const transient = !status || TRANSIENT_STATUS.has(status);
    const wasFast = Date.now() - startedAt < fastRetryWindowMs;
    if (!transient || retries <= 0 || !wasFast) throw err;
    console.warn(`[api] Transient failure (status ${status ?? 'none'}); retrying in ${delayMs}ms`);
    await sleep(delayMs);
    return withTransientRetry(requestFn, { retries: retries - 1, delayMs, fastRetryWindowMs });
  }
}

// Response interceptor — unwrap data or normalise errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.error?.message ??
      error.message ??
      'An unexpected error occurred';

    const status = error.response?.status;
    const code = error.code ?? null; // ECONNABORTED (timeout), ERR_NETWORK, …

    // Redirect to login on 401 (except the /auth/me check itself)
    if (status === 401 && !error.config.url?.includes('/auth/me')) {
      window.location.href = '/login';
    }

    return Promise.reject({ message, status, code, raw: error.response?.data?.error });
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  googleLogin: (idToken) => api.post('/auth/google', { idToken }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

// ─── Employees ────────────────────────────────────────────────────────────────
export const employeesApi = {
  list: (params) => api.get('/employees', { params }),
  get: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.patch(`/employees/${id}`, data),
  updateStatus: (id, status) => api.patch(`/employees/${id}/status`, { status }),
  getTasks: (id) => api.get(`/employees/${id}/tasks`),
  startOnboarding: (id, templateId) =>
    api.post(`/employees/${id}/onboarding`, { templateId }),
  uploadProfileImage: (formData) =>
    api.post('/employees/me/profile-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ─── Onboarding ───────────────────────────────────────────────────────────────
export const onboardingApi = {
  getMyTasks: () => api.get('/onboarding/me'),
  listTemplates: () => api.get('/onboarding/templates'),
  createTemplate: (data) => api.post('/onboarding/templates', data),
  updateTemplate: (id, data) => api.patch(`/onboarding/templates/${id}`, data),
  getOverview: () => api.get('/onboarding/overview'),
};

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasksApi = {
  updateStatus: (id, status) => api.patch(`/tasks/${id}/status`, { status }),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

// ─── Policies ─────────────────────────────────────────────────────────────────
export const policiesApi = {
  list: () => api.get('/policies'),
  // Upload responds fast (processing is async server-side), but large PDFs on
  // slow connections can exceed the global 15s during transfer alone.
  upload: (formData) =>
    api.post('/policies', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    }),
  delete: (id) => api.delete(`/policies/${id}`),
};

// ─── AI ───────────────────────────────────────────────────────────────────────
export const aiApi = {
  chat: (question, history = []) =>
    withTransientRetry(
      () => api.post('/ai/chat', { question, history }, { timeout: AI_TIMEOUT_MS }),
      { retries: 1, delayMs: 2000 }
    ),
};

export default api;

