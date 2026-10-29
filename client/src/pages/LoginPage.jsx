// src/pages/LoginPage.jsx
import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, Shield, Users, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const FEATURES = [
  { icon: Users, label: 'Employee Management', desc: 'Manage your entire workforce from one place' },
  { icon: ClipboardCheck, label: 'Onboarding Workflows', desc: 'Automate task assignment and progress tracking' },
  { icon: Shield, label: 'Role-based Access', desc: 'HR admin and employee views tailored to each role' },
];

export default function LoginPage() {
  const { loginWithGoogle, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const googleButtonRef = useRef(null);

  const from = location.state?.from?.pathname ?? null;

  // If already logged in, redirect
  useEffect(() => {
    if (!loading && user) {
      const dest = from ?? (user.role === 'hr_admin' ? '/dashboard' : '/my-onboarding');
      navigate(dest, { replace: true });
    }
  }, [user, loading, navigate, from]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCallback,
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    if (googleButtonRef.current) {
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 280,
      });
    }
  }, [loading]);

  async function handleGoogleCallback(response) {
    try {
      const u = await loginWithGoogle(response.credential);
      const dest = from ?? (u.role === 'hr_admin' ? '/dashboard' : '/my-onboarding');
      navigate(dest, { replace: true });
    } catch {
      // Error shown via auth context
    }
  }

  if (loading) return null;

  const isConfigured = !!GOOGLE_CLIENT_ID;

  return (
    <div className="min-h-screen bg-midnight-950 flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-navy-950 via-midnight-950 to-navy-900 border-r border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-navy-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-white">OnboardAI</span>
        </div>

        <div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Employee onboarding,{' '}
            <span className="text-navy-400">reimagined</span>
          </h2>
          <p className="text-gray-400 text-lg mb-10">
            Streamline your HR workflows with intelligent task management and real-time progress tracking.
          </p>

          <div className="space-y-6">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-navy-900/80 border border-navy-700/50 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-navy-400" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">{label}</p>
                  <p className="text-gray-400 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-gray-600 text-sm">© 2024 OnboardAI. Portfolio project.</p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm animate-fadeIn">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl bg-navy-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">OnboardAI</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">Welcome back</h1>
            <p className="text-gray-400">Sign in to your account to continue</p>
          </div>

          {!isConfigured ? (
            <div className="rounded-xl bg-amber-900/20 border border-amber-700/50 p-4 text-sm">
              <p className="font-semibold text-amber-400 mb-1">Configuration required</p>
              <p className="text-amber-300/80">
                Set <code className="bg-amber-900/40 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> in{' '}
                <code className="bg-amber-900/40 px-1 rounded">client/.env</code> to enable Google Sign-In.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                ref={googleButtonRef}
                className="flex justify-center"
                id="google-signin-button"
              />
              <p className="text-center text-xs text-gray-500">
                By signing in you agree to our terms of service.
              </p>
            </div>
          )}

          <div className="mt-8 p-4 rounded-xl bg-gray-900 border border-gray-800">
            <p className="text-xs font-medium text-gray-400 mb-2">First-time setup</p>
            <p className="text-xs text-gray-500">
              Set <code className="text-gray-300">ADMIN_SEED_EMAIL</code> on the server to bootstrap the first HR admin account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

