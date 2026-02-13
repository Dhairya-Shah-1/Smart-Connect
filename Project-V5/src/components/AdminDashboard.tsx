import { useState } from 'react';
import { MapView } from './MapView';
import { CheckReports } from './CheckReports';
import { Notifications } from './Notifications';
import { Profile } from './Profile';
import { Map, CheckCircle, Bell, User, LogOut, Sun, Moon } from 'lucide-react';
import { ASSETS } from '../config/assets';
import { useTheme } from '../App';

interface AdminDashboardProps {
  onLogout: () => void;
}

type AdminView = 'map' | 'check-reports' | 'notifications' | 'profile';

export function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [currentView, setCurrentView] = useState<AdminView>('check-reports');

  const renderView = () => {
    switch (currentView) {
      case 'map':
        return <MapView />;
      case 'check-reports':
        return <CheckReports />;
      case 'notifications':
        return <Notifications />;
      case 'profile':
        return <Profile onLogout={onLogout} />;
      default:
        return <CheckReports />;
    }
  };

  return (
    <div className={`h-screen flex flex-col ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
      {/* Header */}
      <header className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'} shadow-sm`}>
        <div className="flex items-center gap-3">
          <img src={ASSETS.Shield} alt="Shield Icon" className="inline-flex w-10" />
          <div>
            <h1 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>Smart Connect</h1>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Admin Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-slate-700 text-yellow-400 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            onClick={onLogout}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isDark ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {renderView()}
      </main>

      {/* Bottom Navigation */}
      <nav className={`flex justify-around items-center border-t ${isDark ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'} py-3 px-4 shadow-lg`}>
        <button
          onClick={() => setCurrentView('map')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
            currentView === 'map'
              ? isDark ? 'text-indigo-400 bg-indigo-900/30' : 'text-blue-800 bg-blue-50'
              : isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Map size={24} />
          <span className="text-xs">Map</span>
        </button>

        <button
          onClick={() => setCurrentView('check-reports')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
            currentView === 'check-reports'
              ? isDark ? 'text-indigo-400 bg-indigo-900/30' : 'text-blue-800 bg-blue-50'
              : isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <CheckCircle size={24} />
          <span className="text-xs">Verify</span>
        </button>

        <button
          onClick={() => setCurrentView('notifications')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
            currentView === 'notifications'
              ? isDark ? 'text-indigo-400 bg-indigo-900/30' : 'text-blue-800 bg-blue-50'
              : isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Bell size={24} />
          <span className="text-xs">Alerts</span>
        </button>

        <button
          onClick={() => setCurrentView('profile')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
            currentView === 'profile'
              ? isDark ? 'text-indigo-400 bg-indigo-900/30' : 'text-blue-800 bg-blue-50'
              : isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <User size={24} />
          <span className="text-xs">Profile</span>
        </button>
      </nav>
    </div>
  );
}