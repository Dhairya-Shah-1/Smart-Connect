import { useState, useEffect } from 'react';
import { MapView } from './MapView';
import { ReportIssue } from './ReportIssue';
import { ReportHistory } from './ReportHistory';
import { Notifications } from './Notifications';
import { Profile } from './Profile';
import { MapPin, LogOut, Plus, History, Bell, Map, Sun, Moon, Home, User } from 'lucide-react';
import { useTheme } from '../App';
import shieldIcon from '../assets/Logos_and_icons/Shield(Gemini)(without-bg).png';
import { canReportIncident } from '../utils/deviceDetection';

interface DashboardProps {
  onLogout: () => void;
  onNavigateHome: () => void;
}

type View = 'map' | 'report' | 'history' | 'notifications' | 'profile';

export function Dashboard({ onLogout, onNavigateHome }: DashboardProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [currentView, setCurrentView] = useState<View>('map');
  const [userName, setUserName] = useState('');
  const [notificationCount, setNotificationCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const canReport = canReportIncident();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    setUserName(user.name || 'User');

    // Check for notifications
    const reports = JSON.parse(localStorage.getItem('reports') || '[]');
    const userEmail = user.email;
    const userReports = reports.filter((r: any) => r.userEmail === userEmail);
    const unresolvedCount = userReports.filter((r: any) => r.status !== 'resolved').length;
    const urgentIncidents = reports.filter((r: any) => r.severity === 'critical' || r.severity === 'high').length;
    setNotificationCount(unresolvedCount);
    setUrgentCount(urgentIncidents);
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
    <div className={`min-h-screen w-full flex sticky ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      {/* Header */}
      <header className={`shadow-sm border-b relative z-10 sticky top-0 ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-gray-200'}`}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={shieldIcon} alt="Shield Icon" className="inline-flex w-10" />
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
      <div className="flex-1 overflow-hidden relative">
        {renderView()}
        
        {/* Floating Action Button - Only on Map and History views */}
        {(currentView === 'map' || currentView === 'history') && canReport && (
          <button
            onClick={() => setCurrentView('report')}
            className={`fixed bottom-24 right-6 w-16 h-16 rounded-full shadow-2xl transition-all hover:scale-110 flex items-center justify-center z-20 ${
              isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-800 hover:bg-blue-900'
            } text-white`}
            aria-label="Report New Incident"
          >
            <Plus size={28} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className={`border-t shadow-lg sticky bottom-0 ${
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
