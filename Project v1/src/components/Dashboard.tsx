import { useState, useEffect } from 'react';
import { MapView } from './MapView';
import { ReportIssue } from './ReportIssue';
import { ReportHistory } from './ReportHistory';
import { Notifications } from './Notifications';
import { MapPin, LogOut, Plus, History, Bell, Map, Shield } from 'lucide-react';

interface DashboardProps {
  onLogout: () => void;
}

type View = 'map' | 'report' | 'history' | 'notifications';

export function Dashboard({ onLogout }: DashboardProps) {
  const [currentView, setCurrentView] = useState<View>('map');
  const [userName, setUserName] = useState('');
  const [notificationCount, setNotificationCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);

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
        return <MapView />;
      case 'report':
        return <ReportIssue onSuccess={() => setCurrentView('history')} />;
      case 'history':
        return <ReportHistory />;
      case 'notifications':
        return <Notifications />;
      default:
        return <MapView />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 relative z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="text-blue-800" size={28} />
            <div>
              <span className="text-lg text-gray-900">CivicAlert</span>
              <p className="text-xs text-gray-600">Real-Time Incident Monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {urgentCount > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                <span className="text-xs text-red-700">{urgentCount} Urgent</span>
              </div>
            )}
            <span className="text-sm text-gray-700">{userName}</span>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:text-red-600 transition-colors"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative">
        {renderView()}
        
        {/* Floating Action Button - Only on Map and History views */}
        {(currentView === 'map' || currentView === 'history') && (
          <button
            onClick={() => setCurrentView('report')}
            className="fixed bottom-24 right-6 w-16 h-16 bg-blue-800 text-white rounded-full shadow-2xl hover:bg-blue-900 transition-all hover:scale-110 flex items-center justify-center z-20"
            aria-label="Report New Incident"
          >
            <Plus size={28} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="bg-white border-t border-gray-200 shadow-lg">
        <div className="flex items-center justify-around px-4 py-2.5">
          <button
            onClick={() => setCurrentView('map')}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'map' ? 'text-blue-800 bg-blue-50' : 'text-gray-600 hover:text-blue-800'
            }`}
          >
            <Map size={22} strokeWidth={2} />
            <span className="text-xs">Live Map</span>
          </button>

          <button
            onClick={() => setCurrentView('report')}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'report' ? 'text-blue-800 bg-blue-50' : 'text-gray-600 hover:text-blue-800'
            }`}
          >
            <Plus size={22} strokeWidth={2} />
            <span className="text-xs">Report</span>
          </button>

          <button
            onClick={() => setCurrentView('history')}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'history' ? 'text-blue-800 bg-blue-50' : 'text-gray-600 hover:text-blue-800'
            }`}
          >
            <History size={22} strokeWidth={2} />
            <span className="text-xs">History</span>
          </button>

          <button
            onClick={() => setCurrentView('notifications')}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg transition-colors relative ${
              currentView === 'notifications' ? 'text-blue-800 bg-blue-50' : 'text-gray-600 hover:text-blue-800'
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
        </div>
      </nav>
    </div>
  );
}