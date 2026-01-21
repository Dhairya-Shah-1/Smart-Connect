import { useState, useEffect } from 'react';
import { MapView } from './MapView';
import { ReportIssue } from './ReportIssue';
import { ReportHistory } from './ReportHistory';
import { Notifications } from './Notifications';
import { Profile } from './Profile';
import { History, Bell, Map, Sun, Moon, Home, User, Plus } from 'lucide-react';
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
    <div className={`h-d-screen w-full flex flex-col overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      
      {/* Header - Fixed height, no shrinking */}
      <header className={`shrink-0 shadow-sm border-b z-30 glass-effect ${
        isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white/90 border-gray-200'}`}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={shieldIcon} alt="Shield Icon" className="w-10 h-10 object-contain" />
            <div>
              <span className={`text-lg font-bold leading-none ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Smart Connect</span>
              <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'} hidden sm:block`}>
                Real-Time Monitoring
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {urgentCount > 0 && currentView !== 'map' && (
              <div className={`flex items-center gap-2 px-2 py-1 rounded-full border ${
                isDark ? 'bg-red-900/40 border-red-700' : 'bg-red-50 border-red-200'
              }`}>
                <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></span>
                <span className={`text-[10px] font-bold ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                  {urgentCount} <span className="hidden xs:inline">Urgent</span>
                </span>
              </div>
            )}
            <button onClick={toggleTheme} className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-slate-700 text-yellow-400' : 'bg-gray-100 text-gray-700'}`}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={onNavigateHome} className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
              <Home size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area - This scrolls, the rest of the UI stays fixed */}
      <main className="flex-1 overflow-y-auto relative">
        {renderView()}
        
        {/* Floating Action Button */}
        {(currentView === 'map' || currentView === 'history') && canReport && (
          <button
            onClick={() => setCurrentView('report')}
            className={`fixed bottom-24 right-6 w-14 h-14 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center z-40 ${
              isDark ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-800 hover:bg-blue-700'
            } text-white`}
          >
            <Plus size={28} strokeWidth={3} />
          </button>
        )}
      </main>

      {/* Bottom Navigation - Stays at bottom, accounts for mobile safe areas */}
      <nav className={`shrink-0 border-t shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-50 pb-safe ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-center justify-around px-2 py-2">
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

function NavButton({ active, onClick, icon, label, isDark, count }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, isDark: boolean, count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all relative min-w-[64px] ${
        active 
          ? isDark ? 'text-blue-400 bg-slate-700/50' : 'text-blue-800 bg-blue-100/50'
          : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-blue-800'
      }`}
    >
      <div className={`${active ? 'scale-110' : 'scale-100'} transition-transform`}>
        {icon}
      </div>
      <span className="text-[10px] font-bold whitespace-nowrap">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="absolute top-1 right-2 bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center ring-2 ring-slate-800">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}
