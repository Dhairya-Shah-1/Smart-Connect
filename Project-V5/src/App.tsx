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

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = localStorage.getItem('currentUser');
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

// Admin Route Component
function AdminRoute({ children }: { children: React.ReactNode }) {
  const userStr = localStorage.getItem('currentUser');
  
  if (!userStr) {
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
  
  if (!userStr) {
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
    const isPublicRoute = location.pathname === '/' || location.pathname === '/login' || location.pathname === '/signup';

    if (redirectPath && isPublicRoute) {
      navigate(redirectPath, { replace: true });
    }
  }, [location.pathname, navigate]);

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

// Wrapper components to pass required props
function DashboardWrapper() {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.log('SignOut error (can be ignored):', error);
    }
    localStorage.removeItem('currentUser');
    localStorage.removeItem('reportHistory_cache');
    window.location.href = '/login';
  };
  
  const handleNavigateHome = () => {
    window.location.href = '/';
  };
  
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
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.log('SignOut error (can be ignored):', error);
    }
    localStorage.removeItem('currentUser');
    localStorage.removeItem('reportHistory_cache');
    window.location.href = '/login';
  };
  
  return <Profile onLogout={handleLogout} />;
}

function CheckReportsWrapper() {
  return <CheckReports />;
}

function AdminDashboardWrapper() {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.log('SignOut error (can be ignored):', error);
    }
    localStorage.removeItem('currentUser');
    localStorage.removeItem('reportHistory_cache');
    window.location.href = '/login';
  };
  
  return <AdminDashboard onLogout={handleLogout} />;
}

function SuperAdminDashboardWrapper() {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.log('SignOut error (can be ignored):', error);
    }
    localStorage.removeItem('currentUser');
    localStorage.removeItem('reportHistory_cache');
    window.location.href = '/login';
  };
  
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
