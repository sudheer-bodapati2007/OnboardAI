// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if we already have a valid session
  const checkSession = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authApi.me();
      setUser(res.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const loginWithGoogle = useCallback(async (idToken) => {
    setError(null);
    try {
      const res = await authApi.googleLogin(idToken);
      setUser(res.data.user);
      return res.data.user;
    } catch (err) {
      setError(err.message ?? 'Login failed');
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore – clear local state regardless
    }
    setUser(null);
  }, []);

  // Silently re-fetch the session user (no loading screen). Used after
  // in-place profile changes (e.g. a new profile picture) so the UI updates
  // without a full browser reload.
  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.me();
      setUser(res.data.user);
    } catch {
      // keep the current state — a failed refresh must not log the user out
    }
  }, []);

  const isHrAdmin = user?.role === 'hr_admin';
  const isEmployee = user?.role === 'employee';

  return (
    <AuthContext.Provider
      value={{ user, loading, error, loginWithGoogle, logout, refreshUser, isHrAdmin, isEmployee, checkSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

