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

// Response interceptor — unwrap data or normalise errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.error?.message ??
      error.message ??
      'An unexpected error occurred';

    const status = error.response?.status;

    // Redirect to login on 401 (except the /auth/me check itself)
    if (status === 401 && !error.config.url?.includes('/auth/me')) {
      window.location.href = '/login';
    }

    return Promise.reject({ message, status, raw: error.response?.data?.error });
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
  upload: (formData) =>
    api.post('/policies', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (id) => api.delete(`/policies/${id}`),
};

// ─── AI ───────────────────────────────────────────────────────────────────────
export const aiApi = {
  chat: (question, history = []) => api.post('/ai/chat', { question, history }),
};

export default api;

