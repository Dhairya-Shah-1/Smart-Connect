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
import { isMobileOrTablet } from '../utils/deviceDetection';

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
  const isMobile = isMobileOrTablet();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    setUserName(user.name || 'User');

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
      case 'map': return <MapView onNavigateHome={onNavigateHome} urgentCount={urgentCount} />;
      case 'report': return <ReportIssue onSuccess={() => setCurrentView('history')} />;
      case 'history': return <ReportHistory />;
      case 'notifications': return <Notifications />;
      case 'profile': return <Profile onLogout={onLogout} />;
      default: return <MapView onNavigateHome={onNavigateHome} urgentCount={urgentCount} />;
    }
  };

  return (
    /* Changed min-h-screen to h-[100dvh] and added overflow-hidden to prevent the "white block" */
    <div className={`h-d-screen w-full flex flex-col overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      
      {/* Header */}
      <header className={`shrink-0 shadow-sm border-b z-30 ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-gray-200'}`}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={shieldIcon} alt="Shield Icon" className="inline-flex w-10" />
            <div>
              <span className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Smart Connect</span>
              <p className={`sm:text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} ${urgentCount > 0 ? 'hidden sm:block' : ''}`}>
                Real-Time Monitoring
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {urgentCount > 0 && currentView !== 'map' && (
              <div className={`flex items-center gap-2 px-2 py-1 rounded-full border ${
                isDark ? 'bg-red-900/40 border-red-700' : 'bg-red-50 border-red-200'
              }`}>
                <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></span>
                <span className={`sm:text-xs font-bold ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                  {urgentCount} <span className="hidden sm:inline">Urgent</span>
                </span>
              </div>
            )}
            <button onClick={toggleTheme} className={`p-2 rounded-lg ${isDark ? 'bg-slate-700 text-yellow-400' : 'bg-white text-gray-700 shadow-sm border border-gray-100'}`}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={onNavigateHome} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-slate-700 text-gray-300' : 'bg-white text-gray-700 shadow-sm border border-gray-100'}`}>
              <Home size={18} />
              <span className="text-sm hidden sm:inline">Home</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area - This now scrolls independently */}
      <main className="flex-1 overflow-y-auto relative bg-transparent">
        {renderView()}
        
        {/* Floating Action Button - Positioned relative to main to stay above Nav */}
        {(currentView === 'map' || currentView === 'history') && canReport && (
          <button
            onClick={() => setCurrentView('report')}
            className={`fixed bottom-20 right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center z-40 ${
              isDark ? 'bg-blue-600' : 'bg-blue-800'
            } text-white`}
          >
            <Plus size={28} strokeWidth={3} />
          </button>
        )}
      </main>

      {/* Bottom Navigation - Added padding-bottom for mobile safe areas */}
      <nav className={`shrink-0 border-t shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-50 pb-safe ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-gray-200'
      }`}>
        <div className={`flex items-center justify-around px-2 ${isMobile ? "py-1" : "mb-1 sm:mb-0 py-2"} `}>
          <NavButton 
            active={currentView === 'map'} 
            onClick={() => setCurrentView('map')} 
            icon={<Map size={22} />} 
            label="Live Map" 
            isDark={isDark} 
          />
          <NavButton 
            active={currentView === 'report'} 
            onClick={() => setCurrentView('report')} 
            icon={<Plus size={22} />} 
            label="Report" 
            isDark={isDark} 
          />
          <NavButton 
            active={currentView === 'history'} 
            onClick={() => setCurrentView('history')} 
            icon={<History size={22} />} 
            label="History" 
            isDark={isDark} 
          />
          <NavButton 
            active={currentView === 'notifications'} 
            onClick={() => setCurrentView('notifications')} 
            icon={<Bell size={22} />} 
            label="Alerts" 
            isDark={isDark} 
            count={notificationCount}
          />
          <NavButton 
            active={currentView === 'profile'} 
            onClick={() => setCurrentView('profile')} 
            icon={<User size={22} />} 
            label="Profile" 
            isDark={isDark} 
          />
        </div>
      </nav>
    </div>
  );
}

/* Helper Component to keep the code clean and ensure consistent button sizing */
function NavButton({ active, onClick, icon, label, isDark, count }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, isDark: boolean, count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all relative min-w-[64px] ${
        active 
          ? isDark ? 'text-blue-400 bg-slate-700/50' : 'text-blue-800 bg-blue-100/50'
          : isDark ? 'text-gray-400' : 'text-gray-500 hover:text-blue-800'
      }`}
    >
      <div className={`${active ? 'scale-110' : 'scale-100'} transition-transform`}>
        {icon}
      </div>
      <span className="text-[10px] font-medium whitespace-nowrap">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="absolute top-1 right-2 bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center ring-2 ring-slate-800">
          {count}
        </span>
      )}
    </button>
  );
}
