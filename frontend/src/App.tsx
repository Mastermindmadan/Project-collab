import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import SidebarLayout from './layouts/SidebarLayout';

// Fallback loader for code-split route chunks
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh] w-full text-muted-foreground">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-semibold tracking-wide">Loading page...</span>
    </div>
  </div>
);

// Lazy-loaded Auth pages
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Profile = lazy(() => import('./pages/Profile'));

// Lazy-loaded Main workspace pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Notifications = lazy(() => import('./pages/Notifications'));

// Lazy-loaded Collaboration pages
const Teams = lazy(() => import('./pages/Teams'));
const Projects = lazy(() => import('./pages/Projects'));
const TaskBoard = lazy(() => import('./pages/TaskBoard'));
const Chat = lazy(() => import('./pages/Chat'));
const Meetings = lazy(() => import('./pages/Meetings'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Drive = lazy(() => import('./pages/Drive'));

// Lazy-loaded Intelligence pages
const AIPlanner = lazy(() => import('./pages/AIPlanner'));
const GitHub = lazy(() => import('./pages/GitHub'));

// Lazy-loaded Reports & Settings
const Reports = lazy(() => import('./pages/Reports'));
const MemberAnalytics = lazy(() => import('./pages/MemberAnalytics'));
const AppSettings = lazy(() => import('./pages/AppSettings'));

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
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
    </BrowserRouter>
  );
}
