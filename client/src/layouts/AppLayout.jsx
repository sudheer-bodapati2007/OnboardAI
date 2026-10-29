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
  ChevronRight,
  CheckSquare,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

const HR_NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/employees', icon: Users, label: 'Employees' },
  { to: '/templates', icon: ClipboardList, label: 'Templates' },
];

const EMPLOYEE_NAV = [
  { to: '/my-onboarding', icon: CheckSquare, label: 'My Onboarding' },
];

export function AppLayout() {
  const { user, logout, isHrAdmin } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = isHrAdmin ? HR_NAV : EMPLOYEE_NAV;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-6 border-b border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-navy-600 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white">OnboardAI</h1>
          <p className="text-xs text-gray-500">Employee Onboarding</p>
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
                ? 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-navy-600/20 text-navy-400 border border-navy-600/30'
                : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-100 hover:bg-white/5 transition-all'
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User profile */}
      <div className="px-3 pb-4 border-t border-gray-800 pt-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-800/50 mb-2">
          {user?.picture ? (
            <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center text-sm font-semibold text-navy-300">
              {user?.name?.[0] ?? '?'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-900/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-midnight-950">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col bg-gray-900 border-r border-gray-800">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-gray-900 border-r border-gray-800 z-10">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-navy-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white text-sm">OnboardAI</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

