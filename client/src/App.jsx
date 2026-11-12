// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { AIChatProvider } from './contexts/AIChatContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { RealtimeProvider } from './contexts/RealtimeContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { AppLayout } from './layouts/AppLayout.jsx';

// Pages
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import EmployeesPage from './pages/EmployeesPage.jsx';
import EmployeeFormPage from './pages/EmployeeFormPage.jsx';
import EmployeeDetailPage from './pages/EmployeeDetailPage.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import MyOnboardingPage from './pages/MyOnboardingPage.jsx';
import PolicyPage from './pages/PolicyPage.jsx';
import AIChatPage from './pages/AIChatPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      {/* Above the Routes so the in-memory chat survives route changes. */}
      <AIChatProvider>
      <RealtimeProvider>
        <ThemeProvider>
          <ErrorBoundary>
            <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Root redirect */}
            <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Protected — shared layout */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* HR admin routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requiredRole="hr_admin">
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees"
            element={
              <ProtectedRoute requiredRole="hr_admin">
                <EmployeesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/new"
            element={
              <ProtectedRoute requiredRole="hr_admin">
                <EmployeeFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id"
            element={
              <ProtectedRoute requiredRole="hr_admin">
                <EmployeeDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id/edit"
            element={
              <ProtectedRoute requiredRole="hr_admin">
                <EmployeeFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/templates"
            element={
              <ProtectedRoute requiredRole="hr_admin">
                <TemplatesPage />
              </ProtectedRoute>
            }
          />

          {/* Employee routes */}
          <Route
            path="/my-onboarding"
            element={
              <ProtectedRoute requiredRole="employee">
                <MyOnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* Phase 2 — HR admin only */}
          <Route
            path="/policies"
            element={
              <ProtectedRoute requiredRole="hr_admin">
                <PolicyPage />
              </ProtectedRoute>
            }
          />

          {/* Phase 2 — all authenticated users */}
          <Route
            path="/ai-chat"
            element={
              <ProtectedRoute>
                <AIChatPage />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ErrorBoundary>
        </ThemeProvider>
      </RealtimeProvider>
      </AIChatProvider>
    </AuthProvider>
  );
}

