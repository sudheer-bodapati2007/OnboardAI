// src/pages/NotFoundPage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const home = user?.role === 'hr_admin' ? '/dashboard' : '/my-onboarding';

  return (
    <div className="min-h-screen bg-midnight-950 flex items-center justify-center p-8">
      <div className="text-center animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-navy-600/20 border border-navy-600/30 flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-8 h-8 text-navy-400" />
        </div>
        <h1 className="text-7xl font-black text-gray-800 mb-4">404</h1>
        <h2 className="text-xl font-bold text-white mb-2">Page not found</h2>
        <p className="text-gray-400 text-sm mb-8 max-w-sm">
          The page you're looking for doesn't exist or you don't have permission to view it.
        </p>
        <button onClick={() => navigate(user ? home : '/login')} className="btn-primary">
          <ArrowLeft className="w-4 h-4" />
          {user ? 'Back to home' : 'Go to login'}
        </button>
      </div>
    </div>
  );
}

