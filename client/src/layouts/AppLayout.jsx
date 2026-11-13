// src/layouts/AppLayout.jsx
import React, { useState } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  LogOut,
  Menu,
  X,
  Sparkles,
  CheckSquare,
  FileText,
  Bot,
  Upload,
  Image,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { NotificationDrawer } from '../components/NotificationDrawer.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { employeesApi } from '../services/api.js';

const HR_NAV = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/employees',  icon: Users,            label: 'Employees' },
  { to: '/templates',  icon: ClipboardList,    label: 'Templates' },
  { to: '/policies',   icon: FileText,         label: 'Policies' },
  { to: '/ai-chat',    icon: Bot,              label: 'AI Assistant' },
];

const EMPLOYEE_NAV = [
  { to: '/my-onboarding', icon: CheckSquare, label: 'My Onboarding' },
  { to: '/ai-chat',       icon: Bot,         label: 'AI Assistant' },
];

export function AppLayout() {
  const { user, logout, refreshUser, isHrAdmin } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState(null);
  const fileInputRef = React.useRef(null);

  const navItems = isHrAdmin ? HR_NAV : EMPLOYEE_NAV;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleProfileImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);
    setUploadingImage(true);

    const formData = new FormData();
    formData.append('profileImage', file);

    try {
      await employeesApi.uploadProfileImage(formData);
      // Update the avatar in place — no full browser reload.
      await refreshUser();
    } catch (err) {
      setImageError(err.message ?? 'Failed to upload profile image');
    } finally {
      setUploadingImage(false);
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-6 border-b border-slate-200 dark:border-gray-700">
        <div className="w-8 h-8 rounded-lg bg-navy-600 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-gray-900 dark:text-white">OnboardAI</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Employee Onboarding</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-navy-600/20 dark:text-navy-400 dark:border-navy-600/30'
                : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-white/5 transition-all'
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User profile */}
      <div className="px-3 pb-4 border-t border-slate-200 dark:border-gray-600 pt-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-100 dark:bg-gray-800/30 mb-2">
          <div className="relative">
            {user?.picture ? (
              <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-navy-600 flex items-center justify-center text-sm font-semibold text-navy-100">
                {user?.name?.[0] ?? '?'}
              </div>
            )}
            <label
              className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-navy-600 text-white cursor-pointer hover:bg-navy-500 transition-colors"
              title="Change profile picture"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleProfileImageChange}
                className="sr-only"
              />
              <Upload className="w-2.5 h-2.5" />
            </label>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
        {imageError && (
          <p className="text-xs text-red-500 dark:text-red-400 px-3 mb-2">{imageError}</p>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-900 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={uploadingImage}
        >
          {uploadingImage ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Updating…
            </span>
          ) : (
            <>
              <LogOut className="w-4 h-4" />
              Sign out
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-midnight-950">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col bg-white dark:bg-gray-900 border-r border-slate-200 dark:border-gray-700">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-gray-900 border-r border-slate-200 dark:border-gray-700 z-10">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-gray-900">
        {/* Top bar — visible on all sizes; mobile gets hamburger, desktop gets notification bell */}
        <header className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600 dark:hover:bg-gray-800 dark:text-gray-400"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-navy-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900 dark:text-white text-sm">OnboardAI</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Notification bell — always visible */}
          <NotificationDrawer />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
