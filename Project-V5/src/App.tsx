import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './components/supabaseClient';
import { ASSETS } from './config/assets';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import { Dashboard } from './components/Dashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { Profile } from './components/Profile';
import { ReportIssue } from './components/ReportIssue';
import { ReportHistory } from './components/ReportHistory';
import { MapView } from './components/MapView';
import { CheckReports } from './components/CheckReports';
import { processAllUnprocessedReports, processPendingUnreviewedReports, getUnprocessedReportsCount } from './utils/aiVerification';
import { toast } from 'sonner';
import { enforceLoginLifetime, isLoginExpired, signOutAndClearAuth, getLoginTime, CURRENT_USER_EVENT } from './utils/authLifetime';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function notifyCurrentUserChanged() {
  window.dispatchEvent(new Event(CURRENT_USER_EVENT));
}

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = localStorage.getItem('currentUser');
  
  if (!user || isLoginExpired()) {
    if (user) void signOutAndClearAuth();
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

// Admin Route Component
function AdminRoute({ children }: { children: React.ReactNode }) {
  const userStr = localStorage.getItem('currentUser');
  
  if (!userStr || isLoginExpired()) {
    if (userStr) void signOutAndClearAuth();
    return <Navigate to="/login" replace />;
  }
  
  const user = JSON.parse(userStr);
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

// Super Admin Route Component
function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const userStr = localStorage.getItem('currentUser');
  
  if (!userStr || isLoginExpired()) {
    if (userStr) void signOutAndClearAuth();
    return <Navigate to="/login" replace />;
  }
  
  const user = JSON.parse(userStr);
  if (user.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

// Component to handle initial routing based on auth state
function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<Theme>('light');
  const [authRefreshKey, setAuthRefreshKey] = useState(0);

  useEffect(() => {
    void enforceLoginLifetime();
    const lifetimeCheck = window.setInterval(() => {
      void enforceLoginLifetime();
    }, 60 * 1000);

    return () => window.clearInterval(lifetimeCheck);
  }, []);

  useEffect(() => {
    const isLandingRoute = location.pathname === '/';
    document.documentElement.classList.toggle('landing-route', isLandingRoute);
    document.body.classList.toggle('landing-route', isLandingRoute);

    return () => {
      document.documentElement.classList.remove('landing-route');
      document.body.classList.remove('landing-route');
    };
  }, [location.pathname]);

  const getRedirectPath = (userStr: string | null) => {
    if (!userStr) return null;

    try {
      const user = JSON.parse(userStr);
      if (user.role === 'super_admin') return '/super-admin';
      if (user.role === 'admin') return '/admin';
      return '/dashboard';
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    
    if (savedTheme) {
      setTheme(savedTheme);
    }
    
  }, []);

  useEffect(() => {
    const redirectPath = getRedirectPath(localStorage.getItem('currentUser'));
    const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup';

    if (redirectPath && isAuthRoute) {
      navigate(redirectPath, { replace: true });
    }
  }, [authRefreshKey, location.pathname, navigate]);

  useEffect(() => {
    const refreshAuthState = () => setAuthRefreshKey((value) => value + 1);

    window.addEventListener('storage', refreshAuthState);
    window.addEventListener(CURRENT_USER_EVENT, refreshAuthState);

    return () => {
      window.removeEventListener('storage', refreshAuthState);
      window.removeEventListener(CURRENT_USER_EVENT, refreshAuthState);
    };
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''}`}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          
          {/* Protected Routes - User Dashboard */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <DashboardWrapper />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/report" 
            element={
              <ProtectedRoute>
                <ReportIssueWrapper />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/history" 
            element={
              <ProtectedRoute>
                <ReportHistoryWrapper />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/map" 
            element={
              <ProtectedRoute>
                <MapViewWrapper />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/profile" 
            element={
              <ProtectedRoute>
                <ProfileWrapper />
              </ProtectedRoute>
            } 
          />
          
          {/* Admin Routes */}
          <Route 
            path="/admin" 
            element={
              <AdminRoute>
                <AdminDashboardWrapper />
              </AdminRoute>
            } 
          />
          <Route 
            path="/admin/check-reports" 
            element={
              <AdminRoute>
                <CheckReportsWrapper />
              </AdminRoute>
            } 
          />
          
          {/* Super Admin Routes */}
          <Route 
            path="/super-admin" 
            element={
              <SuperAdminRoute>
                <SuperAdminDashboardWrapper />
              </SuperAdminRoute>
            } 
          />
          
          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </ThemeContext.Provider>
  );
}

// ---- Smart-Connect ONNX login review -------------------------------------
// Requirements:
//   * any user login -> every report whose `ai_interpretation` column is still
//     NULL / empty is reviewed by the ONNX model;
//   * admin / super admin login -> same, restricted to reports that are still
//     'pending' (never reviewed and not yet acted on).
//
// The work is claimed per LOGIN, not per page. `recordLoginTime()` stamps a
// fresh timestamp on every login, so the key below changes on each login and
// the review runs again, while repeated mounts inside one login (user
// dashboard, admin dashboard, check-reports) share the claim and therefore
// cannot double-process the same reports.

function currentLoginReviewKey(): string | null {
  try {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!user) return null;
    return `${user.id ?? user.email ?? 'user'}:${getLoginTime() ?? 0}`;
  } catch {
    return null;
  }
}

let aiBackfillLoginKey: string | null = null;

/** True when this login has not started the review yet. */
function claimLoginReview(): boolean {
  const key = currentLoginReviewKey();
  if (!key) return false;
  if (aiBackfillLoginKey === key) return false;
  aiBackfillLoginKey = key;
  return true;
}

/** Let a failed run retry on the next mount of the same login. */
function releaseLoginReview() {
  aiBackfillLoginKey = null;
}

async function runAiReviewBackfill({
  run,
  countStatuses,
  label,
}: {
  /** Performs the reviews (writes `ai_interpretation`). */
  run: () => Promise<{
    success: boolean;
    processed?: number;
    failed?: number;
    error?: string;
  }>;
  /** Optional status filter used for the "N report(s) to review" count. */
  countStatuses?: string[];
  label: string;
}) {
  if (!claimLoginReview()) return;

  try {
    const count = await getUnprocessedReportsCount(
      supabase,
      countStatuses ? { statuses: countStatuses } : {}
    );
    if (count <= 0) return;

    toast.info(`Smart-Connect AI is reviewing ${count} ${label} report(s)...`, {
      duration: 3000,
    });

    const result = await run();

    if (result.success) {
      toast.success(
        `AI review complete! Processed: ${result.processed}, Failed: ${result.failed}`,
        { duration: 5000 }
      );
    } else {
      releaseLoginReview();
      toast.error(result.error || 'Failed to process reports', {
        duration: 5000,
      });
    }
  } catch (error) {
    releaseLoginReview();
    console.error('Auto AI processing error:', error);
  }
}

/** Any user login: never-reviewed reports in every open status. */
async function runAiBackfillOnce() {
  return runAiReviewBackfill({
    label: 'unprocessed',
    run: () => processAllUnprocessedReports(),
  });
}

/**
 * Admin / super admin login: only reports whose `ai_interpretation` is still
 * NULL / empty AND whose status is still 'pending' are sent for AI review, and
 * the answer is written back into that report's `ai_interpretation` column by
 * `reviewReportWithAI`.
 */
async function runAdminPendingAiBackfillOnce() {
  return runAiReviewBackfill({
    label: 'pending',
    countStatuses: ['pending'],
    run: () => processPendingUnreviewedReports(),
  });
}

// Wrapper components to pass required props
function DashboardWrapper() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOutAndClearAuth();
    navigate('/login', { replace: true });
  };
  
  const handleNavigateHome = () => {
    navigate('/', { replace: true });
  };
  
  // Requirement: on login the model reviews any report whose
  // ai_interpretation column is still empty.
  useEffect(() => {
    runAiBackfillOnce();
  }, []);

  return <Dashboard onLogout={handleLogout} onNavigateHome={handleNavigateHome} />;
}

function ReportIssueWrapper() {
  const navigate = useNavigate();
  
  const handleSuccess = () => {
    navigate('/history');
  };
  
  return <ReportIssue onSuccess={handleSuccess} />;
}

function ReportHistoryWrapper() {
  return <ReportHistory />;
}

function MapViewWrapper() {
  const navigate = useNavigate();
  
  const handleNavigateHome = () => {
    navigate('/');
  };
  
  return <MapView onNavigateHome={handleNavigateHome} />;
}

function ProfileWrapper() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOutAndClearAuth();
    navigate('/login', { replace: true });
  };
  
  return <Profile onLogout={handleLogout} />;
}

function CheckReportsWrapper() {
  useEffect(() => {
    // Admin-only page: same rule as the admin dashboard - review reports whose
    // ai_interpretation is still empty and whose status is still 'pending'.
    runAdminPendingAiBackfillOnce();
  }, []);

  return <CheckReports />;
}

function AdminDashboardWrapper() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOutAndClearAuth();
    navigate('/login', { replace: true });
  };

  // Requirement: on admin login, review every never-reviewed ('pending',
  // ai_interpretation NULL) report and store the answer in that column.
  useEffect(() => {
    runAdminPendingAiBackfillOnce();
  }, []);

  return <AdminDashboard onLogout={handleLogout} />;
}

function SuperAdminDashboardWrapper() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOutAndClearAuth();
    navigate('/login', { replace: true });
  };

  // Requirement: on super admin login, review every never-reviewed ('pending',
  // ai_interpretation NULL) report and store the answer in that column.
  useEffect(() => {
    runAdminPendingAiBackfillOnce();
  }, []);

  return <SuperAdminDashboard onLogout={handleLogout} />;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
    }
    
    // Set page title
    document.title = 'Smart Connect - Real-Time Incident Monitoring';
    
    // Set favicon
    const setFavicon = () => {
      // Remove existing favicons
      const existingFavicons = document.querySelectorAll("link[rel*='icon']");
      existingFavicons.forEach(favicon => favicon.remove());
      
      // Create new favicon link
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = ASSETS.Shield_img_without_bg;
      document.head.appendChild(link);
      
      // Also set apple-touch-icon for iOS devices
      const appleTouchIcon = document.createElement('link');
      appleTouchIcon.rel = 'apple-touch-icon';
      appleTouchIcon.href = ASSETS.Shield_img_without_bg;
      document.head.appendChild(appleTouchIcon);
    };
    
    setFavicon();
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ThemeContext.Provider>
  );
}
