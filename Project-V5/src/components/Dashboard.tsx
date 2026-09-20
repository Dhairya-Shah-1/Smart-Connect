import { useState, useEffect } from 'react';
import { MapView } from './MapView';
import { ReportIssue } from './ReportIssue';
import { ReportHistory } from './ReportHistory';
import { Notifications } from './Notifications';
import { Profile } from './Profile';
import { MapPin, Plus, History, Bell, Map, Sun, Moon, Home, User } from 'lucide-react';
import { useTheme } from '../App';
import { ASSETS } from '../config/assets';
import { canReportIncident } from '../utils/deviceDetection';
import { supabase } from './supabaseClient';
import {
  getBrowserCache,
  isBrowserCacheFresh,
  sanitizeCacheKeyPart,
  setBrowserCache,
} from '../utils/browserCache';

const DASHBOARD_STATS_CACHE_PREFIX = 'smart_connect_dashboard_stats';

interface DashboardProps {
  onLogout: () => void;
  onNavigateHome: () => void;
}

type View = 'map' | 'report' | 'history' | 'notifications' | 'profile';

interface DashboardStatsCacheData {
  userName: string;
  notificationCount: number;
  urgentCount: number;
}

export function Dashboard({ onLogout, onNavigateHome }: DashboardProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [currentView, setCurrentView] = useState<View>('map');
  const [userName, setUserName] = useState('');
  const [notificationCount, setNotificationCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const canReport = canReportIncident();

  const getDashboardStatsCacheKeys = (user: any) => {
    const suffix = sanitizeCacheKeyPart(`${user.role || 'user'}_${user.id || 'anonymous'}`);

    return {
      cookieKey: `${DASHBOARD_STATS_CACHE_PREFIX}_meta_${suffix}`,
      storageKey: `${DASHBOARD_STATS_CACHE_PREFIX}_data_${suffix}`,
    };
  };

  const applyDashboardStats = (stats: DashboardStatsCacheData) => {
    setUserName(stats.userName);
    setNotificationCount(stats.notificationCount);
    setUrgentCount(stats.urgentCount);
  };

  const buildDashboardStatsSignature = (reports: any[], urgentIncidents: number) =>
    [
      urgentIncidents,
      ...reports.map((report: any) => [
        report.report_id,
        report.user_id,
        report.status,
        report.severity,
      ].join(':')),
    ].join('|');

  const fetchDashboardStats = async (user: any) => {
    const { data: reports, error } = await supabase
      .from('incident_reports')
      .select('report_id, severity, status, user_id')
      .order('report_id', { ascending: true });

    if (error) {
      console.error('Supabase dashboard error:', error);
      return null;
    }

    const unresolvedCount = (reports || []).filter(
      (r: any) => r.user_id === user.id && r.status !== 'resolved'
    ).length;

    const { count: urgentIncidents, error: urgentError } = await supabase
      .from('incident_reports_view')
      .select('*', { count: 'exact', head: true })
      .eq('severity', 'critical')
      .in('status', ['pending', 'in-progress']);

    if (urgentError) {
      console.error('Supabase urgent count error:', urgentError);
      return null;
    }

    return {
      data: {
        userName: user.name || 'User',
        notificationCount: unresolvedCount,
        urgentCount: urgentIncidents || 0,
      },
      signature: buildDashboardStatsSignature(reports || [], urgentIncidents || 0),
    };
  };

  useEffect(() => {
  const loadDashboardStats = async () => {
    try {
      // Get logged-in user (still from localStorage)
      const userStr = localStorage.getItem('currentUser');
      const user = userStr ? JSON.parse(userStr) : {};
      setUserName(user.name || 'User');
      const { cookieKey, storageKey } = getDashboardStatsCacheKeys(user);
      const cached = getBrowserCache<DashboardStatsCacheData>(cookieKey, storageKey);

      if (cached) {
        applyDashboardStats(cached.data);

        if (isBrowserCacheFresh(cached.metadata.updatedAt)) {
          return;
        }
      }

      const freshStats = await fetchDashboardStats(user);
      if (!freshStats) return;

      if (!cached || freshStats.signature !== cached.metadata.signature) {
        applyDashboardStats(freshStats.data);
      }

      setBrowserCache<DashboardStatsCacheData>(
        cookieKey,
        storageKey,
        !cached || freshStats.signature !== cached.metadata.signature
          ? freshStats.data
          : cached.data,
        freshStats.signature,
      );
    } catch (err) {
      console.error('Dashboard load failed:', err);
    }
  };

  loadDashboardStats();
}, [currentView]);


  const renderView = () => {
    switch (currentView) {
      case 'map':
        return <MapView onNavigateHome={onNavigateHome} urgentCount={urgentCount} />;
      case 'report':
        return <ReportIssue onSuccess={() => setCurrentView('history')} />;
      case 'history':
        return <ReportHistory />;
      case 'notifications':
        return <Notifications />;
      case 'profile':
        return <Profile onLogout={onLogout} />;
      default:
        return <MapView onNavigateHome={onNavigateHome} urgentCount={urgentCount} />;
    }
  };

  return (
    <div className={`h-screen flex flex-col dashboard-container ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      {/* Header */}
      <header className={`shadow-sm border-b relative z-10 dashboard-header ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-gray-200'}`}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={ASSETS.Shield} alt="Shield Icon" className="inline-flex w-10" />
            <div>
              <span className={`text-lg ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Smart Connect</span>
              {/* Hide subtitle on mobile when there are urgent notifications */}
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} ${urgentCount > 0 ? 'hidden sm:block' : ''}`}>
                Real-Time Incident Monitoring
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Urgent indicator - hide on Live Map view, show only number on small screens */}
            {urgentCount > 0 && currentView !== 'map' && (
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
                isDark ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'
              }`}>
                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                {/* Show only number on small screens, full text on larger screens */}
                <span className={`text-xs ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                  <span className="sm:hidden">{urgentCount}</span>
                  <span className="hidden sm:inline">{urgentCount} Urgent</span>
                </span>
              </div>
            )}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg transition-colors ${
                isDark ? 'bg-slate-700 text-yellow-400 hover:bg-slate-600' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={onNavigateHome}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                isDark ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Home size={18} />
              <span className="text-sm">Home</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto relative mobile-bottom-content">
        {renderView()}
        
        {/* Floating Action Button - Only on Map and History views */}
        {(currentView === 'map' || currentView === 'history') && canReport && (
          <button
            onClick={() => setCurrentView('report')}
            className={`fixed mobile-fab-offset right-6 w-16 h-16 sm:w-16 sm:h-16 active:scale-95 rounded-full shadow-2xl transition-all hover:scale-110 flex items-center justify-center z-40 ${
              isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-800 hover:bg-blue-900'
            } text-white`}
            aria-label="Report New Incident"
          >
            <Plus size={28} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className={`mobile-bottom-panel border-t shadow-lg ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-gray-200'
      }`}>
        <div className="flex items-center justify-around px-4 py-2.5">
          <button
            onClick={() => setCurrentView('map')}
            className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg transition-colors border-2 ${
              currentView === 'map' 
                ? isDark 
                  ? 'text-blue-400 bg-slate-700 border-blue-500' 
                  : 'text-blue-800 bg-blue-50 border-blue-600'
                : isDark
                  ? 'text-gray-400 hover:text-blue-400 border-transparent'
                  : 'text-gray-600 hover:text-blue-800 border-transparent'
            }`}
          >
            <Map size={22} strokeWidth={2} />
            <span className="text-xs whitespace-nowrap">Live Map</span>
          </button>         
          
          <button
            onClick={() => setCurrentView('report')}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg transition-colors border-2 ${
              currentView === 'report' 
                ? isDark 
                  ? 'text-blue-400 bg-slate-700 border-blue-500' 
                  : 'text-blue-800 bg-blue-50 border-blue-600'
                : isDark
                  ? 'text-gray-400 hover:text-blue-400 border-transparent'
                  : 'text-gray-600 hover:text-blue-800 border-transparent'
            }`}
          >
            <Plus size={22} strokeWidth={2} />
            <span className="text-xs">Report</span>
          </button>

          <button
            onClick={() => setCurrentView('history')}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg transition-colors border-2 ${
              currentView === 'history' 
                ? isDark 
                  ? 'text-blue-400 bg-slate-700 border-blue-500' 
                  : 'text-blue-800 bg-blue-50 border-blue-600'
                : isDark
                  ? 'text-gray-400 hover:text-blue-400 border-transparent'
                  : 'text-gray-600 hover:text-blue-800 border-transparent'
            }`}
          >
            <History size={22} strokeWidth={2} />
            <span className="text-xs">History</span>
          </button>

          <button
            onClick={() => setCurrentView('notifications')}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg transition-colors relative border-2 ${
              currentView === 'notifications' 
                ? isDark 
                  ? 'text-blue-400 bg-slate-700 border-blue-500' 
                  : 'text-blue-800 bg-blue-50 border-blue-600'
                : isDark
                  ? 'text-gray-400 hover:text-blue-400 border-transparent'
                  : 'text-gray-600 hover:text-blue-800 border-transparent'
            }`}
          >
            <Bell size={22} strokeWidth={2} />
            <span className="text-xs">Alerts</span>
            {notificationCount > 0 && (
              <span className="absolute top-1 right-2 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                {notificationCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setCurrentView('profile')}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg transition-colors border-2 ${
              currentView === 'profile' 
                ? isDark 
                  ? 'text-blue-400 bg-slate-700 border-blue-500' 
                  : 'text-blue-800 bg-blue-50 border-blue-600'
                : isDark
                  ? 'text-gray-400 hover:text-blue-400 border-transparent'
                  : 'text-gray-600 hover:text-blue-800 border-transparent'
            }`}
          >
            <User size={22} strokeWidth={2} />
            <span className="text-xs">Profile</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
