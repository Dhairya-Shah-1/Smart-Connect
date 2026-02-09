import { useState, useEffect } from 'react';
import { Clock, MapPin, Droplets, AlertTriangle, Flame, Car, Mountain, ShieldCheck, Building2, Loader2, Flag, XCircle } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useTheme } from '../App';

interface Report {
  id: string;
  type: string;
  severity: string;
  location: string;
  description: string;
  photo: string | null;
  status: string;
  timestamp: string;
  userName: string;
  aiVerified: boolean;
  aiConfidence?: number;
  aiReason?: string;
  isFlagged: boolean;
  departmentNotified: string;
}

export function ReportHistory() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      console.log('No user found');
      return;
    }
    const user = JSON.parse(userStr);

    const fetchReports = async () => {
      try {
        setLoading(true);
        let allReports: Report[] = [];

        // 1. Check localStorage cache first (with user validation)
        try {
          const cachedDataStr = localStorage.getItem('reportHistory_cache');
          if (cachedDataStr) {
            const cachedData = JSON.parse(cachedDataStr);
            
            // Validate that the cached data belongs to the current user
            if (cachedData.userId === user.id) {
              console.log('Using cached reports for user:', user.id);
              allReports = cachedData.reports || [];
              setReports(allReports);
              setLoading(false);
            } else {
              console.log('Cached data belongs to different user, clearing cache');
              localStorage.removeItem('reportHistory_cache');
            }
          }
        } catch (cacheErr) {
          console.error('Error reading cache:', cacheErr);
        }

        // 2. Fetch from Supabase (always fetch to ensure data is up-to-date)
        try {
          const { data: supabaseData, error } = await supabase
            .from('incident_reports')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          if (error) {
            console.error('Error fetching from Supabase:', error);
          } else if (supabaseData) {
            console.log('Fetched reports from Supabase:', supabaseData.length);
            
            allReports = supabaseData.map((r: any) => ({
              id: r.id || r.report_id,
              type: r.incident_type || 'Unknown',
              severity: r.severity || 'low',
              location: r.location || 'Unknown Location',
              description: r.incident_description || '',
              photo: r.photo_url || null,
              status: r.status || 'pending',
              timestamp: r.created_at || r.timestamp || new Date().toISOString(),
              userName: user.name || user.email,
              aiVerified: r.ai_verified ?? true,
              aiConfidence: r.ai_confidence,
              aiReason: r.ai_reason,
              isFlagged: r.is_flagged || r.status === 'rejected',
              departmentNotified: r.department || 'Municipal Authority',
            }));

            // 3. Cache the fetched data with user ID
            const cacheData = {
              userId: user.id,
              reports: allReports,
              timestamp: Date.now(),
            };
            localStorage.setItem('reportHistory_cache', JSON.stringify(cacheData));
            console.log('Cached reports for user:', user.id);

            setReports(allReports);
          }
        } catch (supabaseErr) {
          console.error('Supabase fetch error:', supabaseErr);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReports();

    // Real-time subscription for new reports from Supabase
    const subscription = supabase
      .channel(`incident_reports_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incident_reports',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Real-time update received:', payload);
          fetchReports();
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [lastRefresh]);

  // Refetch reports whenever the page comes into focus
  useEffect(() => {
    const handleFocus = () => {
      console.log('Window focused, refreshing reports');
      setLastRefresh(Date.now());
    };

    // Listen for storage changes (when reports are added from another tab/component)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'reports') {
        console.log('Storage changed, refreshing reports:', e.newValue);
        setLastRefresh(Date.now());
      }
    };

    // Also listen for custom events
    const handleCustomRefresh = () => {
      console.log('Custom refresh event received');
      setLastRefresh(Date.now());
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('reports-updated', handleCustomRefresh);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('reports-updated', handleCustomRefresh);
    };
  }, []);

  const getIssueIcon = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('flood') || lowerType.includes('puddle') || lowerType.includes('water')) return Droplets;
    if (lowerType.includes('pothole')) return AlertTriangle;
    if (lowerType.includes('fire')) return Flame;
    if (lowerType.includes('accident') || lowerType.includes('crash')) return Car;
    if (lowerType.includes('landslide')) return Mountain;
    if (lowerType.includes('garbage') || lowerType.includes('waste')) return AlertTriangle;
    if (lowerType.includes('light') || lowerType.includes('street')) return AlertTriangle;
    if (lowerType.includes('leak') || lowerType.includes('leakage')) return Droplets;
    return MapPin;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'bg-red-600 text-white border-red-700';
      case 'high':
        return 'bg-orange-500 text-white border-orange-600';
      case 'medium':
        return 'bg-yellow-500 text-white border-yellow-600';
      case 'low':
        return 'bg-blue-500 text-white border-blue-600';
      default:
        return 'bg-gray-500 text-white border-gray-600';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const filteredReports = reports.filter(r => {
    if (filter === 'all') return true;
    // For pending, show both 'pending' status and unset status (defaults to pending)
    if (filter === 'pending') return r.status === 'pending' || !r.status;
    return r.status === filter;
  });

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${
        isDark ? 'bg-slate-900' : 'bg-slate-500'
      }`}>
        <Loader2 className="spin text-blue-600" style={{ animation: 'spin 1s linear infinite' }} size={40} />
      </div>
    );
  }

  return (
  <div className={`hide-scrollbar h-full max-w-md mx-auto items-center justify-center overflow-y-auto ${isDark ? 'bg-slate-900' : 'bg-gray-100'}`}>
    <div className="w-full mx-auto p-4">
      <div className="mx-auto items-center justify-center">
        {/* Header - Mobile Optimized */}
        <h2 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          My Reports
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Track all incident reports
        </p>

        {/* Filters - Mobile Optimized (scrollable) */}
        <div className="flex gap-2 flex-wrap mb-6 overflow-x-auto pb-2">
          {['all', 'pending', 'in-progress', 'resolved'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap flex-shrink-0 transition-all ${
                filter === f
                  ? 'bg-blue-600 text-white border-blue-700'
                  : isDark ? 'bg-slate-700 text-gray-300 border-slate-600' : 'bg-white border-gray-300 text-gray-700'
              }`}
            >
              {f.replace('-', ' ')} ({f === 'all'
                ? reports.length
                : reports.filter(r => (f === 'pending' ? (r.status === 'pending' || !r.status) : r.status === f)).length}
              )
            </button>
          ))}
        </div>
      </div>
        {/* List - Mobile Optimized */}
        <div className="space-y-3">
          {filteredReports.length === 0 ? (
            <div className={`p-6 rounded-xl border text-center ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No reports found</p>
              {filter !== 'all' && (
                <button
                  onClick={() => setFilter('all')}
                  className="mt-2 text-blue-600 hover:underline text-xs"
                >
                  View all
                </button>
              )}
            </div>
          ) : (
            filteredReports.map(report => {
              const Icon = getIssueIcon(report.type);

              return (
                <div key={report.id} className={`rounded-lg max-w-md mx-auto items-center justify-center border shadow-sm transition overflow-hidden ${
                  report.isFlagged 
                    ? 'bg-red-50 border-red-300' 
                    : isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
                }`}>
                  <div className="p-4">
                    {/* Photo - Mobile Optimized */}
                    {report.photo && (
                      <img
                        src={report.photo}
                        className="w-full h-110 object-cover rounded-lg mb-3"
                        alt="incident"
                      />
                    )}

                    {/* Header with icon and type */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        report.isFlagged 
                          ? 'bg-red-100' 
                          : isDark ? 'bg-slate-700' : 'bg-gray-100'
                      }`}>
                        <Icon className={report.isFlagged ? 'text-red-600' : isDark ? 'text-gray-300' : 'text-gray-700'} size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`text-base font-bold ${
                            report.isFlagged 
                              ? 'text-red-900' 
                              : isDark ? 'text-white' : 'text-gray-900'
                          }`}>{report.type}</h3>
                          {report.isFlagged && (
                            <span className="inline-flex items-center gap-1 bg-red-600 text-white px-1.5 py-0.5 rounded text-xs">
                              <Flag size={10} />
                              Flagged
                            </span>
                          )}
                        </div>
                        {/* <p className="text-xs text-gray-500 flex items-center gap-1">
                          <MapPin size={11} />
                          {typeof report.location === 'string'
                            ? report.location
                            : JSON.stringify(report.location)}
                        </p> */}
                      </div>

                      <span className={`px-2 py-1 rounded-full text-xs border-2 flex-shrink-0 ml-2 font-bold ${getSeverityColor(report.severity)}`}>
                        {report.severity?.toUpperCase() || 'LOW'}
                      </span>
                    </div>

                    {/* Description */}
                    <p className={`text-xs mb-3 leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{report.description}</p>

                    {/* AI Reason for flagged reports */}
                    {report.isFlagged && report.aiReason && (
                      <div className="mb-3 p-2 bg-red-100 border border-red-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <XCircle size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
                          <div className="text-xs">
                            <p className="font-medium text-red-800 mb-0.5">AI Analysis:</p>
                            <p className="text-red-700">{report.aiReason}</p>
                            {report.aiConfidence !== undefined && (
                              <p className="text-red-600 mt-1">
                                Confidence: {Math.round(report.aiConfidence * 100)}%
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Status and Department - Mobile Grid */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className={`p-2 rounded-lg border text-center ${
                        report.isFlagged 
                          ? 'bg-red-100/50 border-red-200' 
                          : isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'
                      }`}>
                        <p className={`text-xs mb-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Status</p>
                        <span className={`inline-block px-2 py-1 text-xs rounded border text-center ${
                          report.isFlagged 
                            ? 'bg-red-100 text-red-800 border-red-300' 
                            : report.status === 'pending' ? 'bg-gray-100 text-gray-800 border-gray-300'
                            : getStatusBadgeColor(report.status)
                        }`}>
                          {report.isFlagged ? 'Rejected' : (report.status || 'pending').replace('-', ' ').charAt(0).toUpperCase() + (report.status || 'pending').replace('-', ' ').slice(1)}
                        </span>
                      </div>
                      <div className={`p-2 rounded-lg border text-center ${
                        report.isFlagged 
                          ? 'bg-red-100/50 border-red-200' 
                          : isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'
                      }`}>
                        <p className={`text-xs mb-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Dept</p>
                        <p className={`text-xs flex gap-1 justify-center ${isDark ? 'text-gray-300' : 'text-gray-900'}`}>
                          <Building2 size={11} />
                          <span className="truncate">Municipal</span>
                        </p>
                      </div>
                    </div>

                    {/* AI Verified Badge */}
                    {report.aiVerified && !report.isFlagged && (
                      <div className="inline-flex items-center gap-1 bg-green-50 border border-green-200 rounded-lg px-2 py-1 mb-2">
                        <ShieldCheck size={12} className="text-green-700" />
                        <span className="text-xs text-green-800">
                          Verified
                        </span>
                      </div>
                    )}

                    {/* Timestamp */}
                    <p className="text-xs text-gray-500 flex gap-1 items-center">
                      <Clock size={11} />
                      {new Date(report.timestamp).toLocaleDateString()} {new Date(report.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                     </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
