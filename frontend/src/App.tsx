import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import SidebarLayout from './layouts/SidebarLayout';

// Auth pages
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Profile from './pages/Profile';

// Main pages
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import Notifications from './pages/Notifications';

// Collaboration
import Teams from './pages/Teams';
import Projects from './pages/Projects';
import TaskBoard from './pages/TaskBoard';
import Chat from './pages/Chat';
import Meetings from './pages/Meetings';

// Intelligence
import AIPlanner from './pages/AIPlanner';
import GitHub from './pages/GitHub';

// Account
import ResetPassword from './pages/ResetPassword';
import AppSettings from './pages/AppSettings';

// New features
import Calendar from './pages/Calendar';
import Drive from './pages/Drive';
import Reports from './pages/Reports';
import MemberAnalytics from './pages/MemberAnalytics';

// Protected Route Wrapper
interface ProtectedRouteProps {
  children: React.ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <SidebarLayout>{children}</SidebarLayout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected workspace routes */}
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/analytics/members" element={<ProtectedRoute><MemberAnalytics /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />

        {/* Collaboration */}
        <Route path="/teams" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
        <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
        <Route path="/projects/:id" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><TaskBoard /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="/meetings" element={<ProtectedRoute><Meetings /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
        <Route path="/drive" element={<ProtectedRoute><Drive /></ProtectedRoute>} />

        {/* Intelligence */}
        <Route path="/ai" element={<ProtectedRoute><AIPlanner /></ProtectedRoute>} />
        <Route path="/github" element={<ProtectedRoute><GitHub /></ProtectedRoute>} />

        {/* Reports */}
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />

        {/* Account */}
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><AppSettings /></ProtectedRoute>} />

        {/* Fallback redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
