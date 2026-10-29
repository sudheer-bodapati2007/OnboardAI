// src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { FullPageLoading } from './ui/LoadingSpinner.jsx';

export function ProtectedRoute({ children, requiredRole }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoading />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    // Redirect employees to their page, HR to dashboard
    const fallback = user.role === 'hr_admin' ? '/dashboard' : '/my-onboarding';
    return <Navigate to={fallback} replace />;
  }

  return children;
}

