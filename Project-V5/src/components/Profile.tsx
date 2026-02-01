import { useState, useEffect } from 'react';
import { User, LogOut, Mail, MapPin as MapPinIcon, Loader2 } from 'lucide-react';
import { useTheme } from '../App';
import { supabase } from './supabaseClient';
import { toast } from 'sonner';

interface ProfileProps {
  onLogout: () => void;
}

export function Profile({ onLogout }: ProfileProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [user, setUser] = useState<any>(null);
  const [totalReports, setTotalReports] = useState(0);
  const [resolvedReports, setResolvedReports] = useState(0);

  // 🔹 ADDED
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        setUser(currentUser);

        const { data, error } = await supabase
          .from('incident_reports')
          .select('status')
          .eq('user_id', currentUser.id);

        if (error) throw error;

        if (data) {
          setTotalReports(data.length);
          setResolvedReports(
            data.filter((r: any) => r.status === 'resolved').length
          );
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to load profile data');
      } finally {
        // 🔹 ADDED
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('currentUser');
    onLogout();
    toast.success('Logged out');
  };

  // 🔹 LOADER UI (no layout removal)
  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${
        isDark ? 'bg-slate-900' : 'bg-slate-50'
      }`}>
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  if (!user) return null;

  // Original initials logic restored
  const initials =
    user.name
      ?.split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';

  return (
    <div className={`h-full overflow-y-auto ${isDark ? 'bg-slate-900' : 'bg-slate-50'} p-4 md:p-6`}>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* PROFILE CARD — ORIGINAL STRUCTURE PRESERVED */}
        <div className={`rounded-xl shadow-lg border overflow-hidden ${
          isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <div className={`h-24 md:h-32 ${
            isDark
              ? 'bg-gradient-to-br from-slate-700 to-slate-800'
              : 'bg-gradient-to-br from-blue-800 to-blue-900'
          }`} />

          <div className="px-4 md:px-6 pb-6">

            {/* MOBILE */}
            <div className="md:hidden">
              <div className="flex flex-col items-center -mt-12">
                <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center shadow-xl ${
                  isDark
                    ? 'bg-blue-600 border-slate-800 text-white'
                    : 'bg-blue-600 border-white text-white'
                }`}>
                  <span className="text-3xl">{initials}</span>
                </div>

                <div className="mt-4 text-center">
                  <h2 className={`text-xl mb-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    {user.name || 'User'}
                  </h2>
                  <div className={`flex items-center justify-center gap-2 text-sm ${
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    <Mail size={14} />
                    <span className="break-all">{user.email}</span>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className={`mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    isDark
                      ? 'bg-transparent border-red-800 text-red-400 hover:bg-red-900 hover:text-red-300'
                      : 'bg-white border-red-300 text-red-600 hover:bg-red-50'
                  }`}
                >
                  <LogOut size={18} />
                  Log Out
                </button>
              </div>
            </div>

            {/* DESKTOP */}
            <div className="hidden md:flex items-start justify-between">
              <div className="flex items-start gap-4 -mt-16">
                <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center shadow-xl ${
                  isDark
                    ? 'bg-blue-600 border-slate-800 text-white'
                    : 'bg-blue-600 border-white text-white'
                }`}>
                  <span className="text-4xl">{initials}</span>
                </div>

                <div className="mt-20">
                  <h2 className={`text-2xl mb-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    {user.name || 'User'}
                  </h2>
                  <div className={`flex items-center gap-2 text-sm ${
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    <Mail size={14} />
                    {user.email}
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className={`mt-4 flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  isDark
                    ? 'bg-transparent border-red-800 text-red-400 hover:bg-red-900 hover:text-red-300'
                    : 'bg-white border-red-300 text-red-600 hover:bg-red-50'
                }`}
              >
                <LogOut size={18} />
                Log Out
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl shadow-md border p-6 ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
          }`}>
            <div className={`text-3xl mb-2 ${isDark ? 'text-blue-400' : 'text-blue-800'}`}>
              {totalReports}
            </div>
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Total Reports
            </div>
          </div>

          <div className={`rounded-xl shadow-md border p-6 ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
          }`}>
            <div className={`text-3xl mb-2 ${isDark ? 'text-green-400' : 'text-green-600'}`}>
              {resolvedReports}
            </div>
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Resolved
            </div>
          </div>
        </div>

        {/* Account Information */}
        <div className={`rounded-xl shadow-md border p-6 ${
          isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <h3 className={`text-lg mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Account Information
          </h3>
          <div className="space-y-4">
            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              isDark ? 'bg-slate-700' : 'bg-gray-50'
            }`}>
              <User className={isDark ? 'text-blue-400' : 'text-blue-600'} size={20} />
              <div>
                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Full Name</div>
                <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{user.name || 'N/A'}</div>
              </div>
            </div>

            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              isDark ? 'bg-slate-700' : 'bg-gray-50'
            }`}>
              <Mail className={isDark ? 'text-blue-400' : 'text-blue-600'} size={20} />
              <div>
                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Email Address</div>
                <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{user.email}</div>
              </div>
            </div>

            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              isDark ? 'bg-slate-700' : 'bg-gray-50'
            }`}>
              <MapPinIcon className={isDark ? 'text-blue-400' : 'text-blue-600'} size={20} />
              <div>
                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Role</div>
                <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Citizen Reporter</div>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Summary */}
        <div className={`rounded-xl shadow-md border p-6 ${
          isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <h3 className={`text-lg mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Contribution Summary
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Reports Submitted
              </span>
              <span className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                {totalReports}
              </span>
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`}>
              <div 
                className={`h-full ${isDark ? 'bg-blue-500' : 'bg-blue-600'}`}
                style={{ width: `${Math.min((totalReports / 10) * 100, 100)}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Resolution Rate
              </span>
              <span className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                {totalReports > 0 ? Math.round((resolvedReports / totalReports) * 100) : 0}%
              </span>
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`}>
              <div 
                className={`h-full ${isDark ? 'bg-green-500' : 'bg-green-600'}`}
                style={{ width: `${totalReports > 0 ? (resolvedReports / totalReports) * 100 : 0}%` }}
              ></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}