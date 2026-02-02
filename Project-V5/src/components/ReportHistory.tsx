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
    if (!userStr) return;
    const user = JSON.parse(userStr);

    const fetchReports = async () => {
      try {
        setLoading(true);

        // 1. Fetch from Supabase
        const { data: supabaseData, error } = await supabase
          .from('incident_reports')
          .select('*')
          .eq('user_id', user.id)
          .order('timestamp', { ascending: false });

        if (error) {
          console.error('Error fetching reports:', error);
        }

        // 2. Get from localStorage
        const localStorageReports = JSON.parse(localStorage.getItem('reports') || '[]');

        // 3. Combine and deduplicate (Supabase takes precedence for newer data)
        const allReports: Report[] = [];
        const seenIds = new Set<string>();

        // First add Supabase reports
        if (supabaseData && supabaseData.length > 0) {
          supabaseData.forEach((r: any) => {
            const id = r.id || r.report_id;
            seenIds.add(id);
            allReports.push({
              id,
              type: r.incident_type || 'Unknown',
              severity: r.severity || 'low',
              location: r.location || 'Unknown Location',
              description: r.incident_description || '',
              photo: r.photo_url || null,
              status: r.status || 'pending',
              timestamp: r.timestamp || new Date().toISOString(),
              userName: user.name || user.email,
              aiVerified: r.ai_verified ?? true,
              aiConfidence: r.ai_confidence,
              aiReason: r.ai_reason,
              isFlagged: r.is_flagged || r.status === 'rejected',
              departmentNotified: r.department || 'Municipal Authority',
            });
          });
        }

        // Then add localStorage reports that aren't in Supabase yet
        localStorageReports.forEach((r: any) => {
          if (!seenIds.has(r.id)) {
            allReports.push({
              id: r.id,
              type: r.issueType || 'Unknown',
              severity: r.severity || 'low',
              location: `${r.lat?.toFixed(6) || '0'}, ${r.lng?.toFixed(6) || '0'}`,
              description: r.description || '',
              photo: r.photo || null,
              status: 'pending',
              timestamp: r.timestamp || new Date().toISOString(),
              userName: r.user || user.email,
              aiVerified: r.aiVerified ?? true,
              aiConfidence: undefined,
              aiReason: undefined,
              isFlagged: r.isFlagged || false,
              departmentNotified: 'Municipal Authority',
            });
          }
        });

        // Sort by timestamp descending
        allReports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setReports(allReports);
      } catch (err) {
        console.error('Failed to fetch reports:', err);
        // Fallback to localStorage only
        const localStorageReports = JSON.parse(localStorage.getItem('reports') || '[]');
        const mapped: Report[] = localStorageReports.map((r: any) => ({
          id: r.id,
          type: r.issueType || 'Unknown',
          severity: r.severity || 'low',
          location: `${r.lat?.toFixed(6) || '0'}, ${r.lng?.toFixed(6) || '0'}`,
          description: r.description || '',
          photo: r.photo || null,
          status: 'pending',
          timestamp: r.timestamp || new Date().toISOString(),
          userName: r.user || user.email,
          aiVerified: r.aiVerified ?? true,
          isFlagged: r.isFlagged || false,
          departmentNotified: 'Municipal Authority',
        }));
        setReports(mapped);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();

    // Real-time subscription for new reports
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
          fetchReports(); // Refetch all reports when any change occurs
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
      setLastRefresh(Date.now());
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
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

  const filteredReports = reports.filter(r =>
    filter === 'all' ? true : r.status === filter
  );

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${
        isDark ? 'bg-slate-900' : 'bg-slate-500'
      }`}>
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto ${isDark ? 'bg-slate-900' : 'bg-gray-100'}`}>
      <div className="max-w-5xl mx-auto p-6">

        {/* Header */}
        <h2 className={`text-2xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          My Incident Reports
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Track the status and resolution of your reports
        </p>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap mb-6">
          {['all', 'pending', 'in-progress', 'resolved'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg border text-sm ${
                filter === f
                  ? 'bg-blue-800 text-white border-blue-900'
                  : 'bg-white border-gray-300 text-gray-700'
              }`}
            >
              {f.replace('-', ' ')} (
              {f === 'all'
                ? reports.length
                : reports.filter(r => r.status === f).length}
              )
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-4">
          {filteredReports.length === 0 ? (
            <div className={`p-8 rounded-xl border text-center ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
              <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>No reports found</p>
              {filter !== 'all' && (
                <button
                  onClick={() => setFilter('all')}
                  className="mt-2 text-blue-600 hover:underline"
                >
                  View all reports
                </button>
              )}
            </div>
          ) : (
            filteredReports.map(report => {
              const Icon = getIssueIcon(report.type);

              return (
                <div key={report.id} className={`rounded-xl border shadow-sm hover:shadow-md transition overflow-hidden ${
                  report.isFlagged 
                    ? 'bg-red-50 border-red-300 border-l-4 border-l-red-500' 
                    : isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
                }`}>
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      {report.photo && (
                        <img
                          src={report.photo}
                          className="w-32 h-32 object-cover rounded-lg flex-shrink-0"
                          alt="incident"
                        />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                report.isFlagged 
                                  ? 'bg-red-100' 
                                  : isDark ? 'bg-slate-700' : 'bg-gray-100'
                              }`}>
                                <Icon className={report.isFlagged ? 'text-red-600' : isDark ? 'text-gray-300' : 'text-gray-700'} size={20} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className={`text-lg ${
                                    report.isFlagged 
                                      ? 'text-red-900' 
                                      : isDark ? 'text-white' : 'text-gray-900'
                                  }`}>{report.type}</h3>
                                  {report.isFlagged && (
                                    <span className="inline-flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded text-xs">
                                      <Flag size={10} />
                                      Flagged
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                  <MapPin size={12} />
                                  {report.location}
                                </p>
                              </div>
                            </div>
                          </div>

                          <span className={`px-3 py-1 rounded-full text-xs border-2 flex-shrink-0 ml-2 ${getSeverityColor(report.severity)}`}>
                            {report.severity?.toUpperCase() || 'UNKNOWN'}
                          </span>
                        </div>

                        <p className={`text-sm mb-4 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{report.description}</p>

                        {/* AI Reason for flagged reports */}
                        {report.isFlagged && report.aiReason && (
                          <div className="mb-3 p-3 bg-red-100 border border-red-200 rounded-lg">
                            <div className="flex items-start gap-2">
                              <XCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-red-800 mb-1">AI Analysis:</p>
                                <p className="text-xs text-red-700">{report.aiReason}</p>
                                {report.aiConfidence !== undefined && (
                                  <p className="text-xs text-red-600 mt-1">
                                    Confidence: {Math.round(report.aiConfidence * 100)}%
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className={`p-3 rounded-lg border ${
                            report.isFlagged 
                              ? 'bg-red-100/50 border-red-200' 
                              : isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'
                          }`}>
                            <p className={`text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Current Status</p>
                            <span className={`inline-block px-3 py-1 text-xs rounded border ${
                              report.isFlagged 
                                ? 'bg-red-100 text-red-800 border-red-300' 
                                : getStatusBadgeColor(report.status)
                            }`}>
                              {report.isFlagged ? 'Rejected' : report.status === 'in-progress' ? 'In Progress' : report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                            </span>
                          </div>
                          <div className={`p-3 rounded-lg border ${
                            report.isFlagged 
                              ? 'bg-red-100/50 border-red-200' 
                              : isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'
                          }`}>
                            <p className={`text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Department</p>
                            <p className={`text-xs flex gap-1 ${isDark ? 'text-gray-300' : 'text-gray-900'}`}>
                              <Building2 size={12} />
                              {report.departmentNotified}
                            </p>
                          </div>
                        </div>

                        {report.aiVerified && !report.isFlagged && (
                          <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
                            <ShieldCheck size={14} className="text-green-700" />
                            <span className="text-xs text-green-800">
                              Verified by SmartConnect AI
                            </span>
                          </div>
                        )}

                        <p className="text-xs text-gray-500 flex gap-1 items-center">
                          <Clock size={12} />
                          Reported on {new Date(report.timestamp).toLocaleDateString()} at {new Date(report.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar for In-Progress Items */}
                  {report.status === 'in-progress' && !report.isFlagged && (
                    <div className="bg-yellow-50 px-5 py-3 border-t border-yellow-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-yellow-800">Resolution Progress</span>
                        <span className="text-xs text-yellow-800">65%</span>
                      </div>
                      <div className="w-full bg-yellow-200 rounded-full h-2">
                        <div className="bg-yellow-600 h-2 rounded-full" style={{ width: '65%' }}></div>
                      </div>
                    </div>
                  )}

                  {/* Resolved Badge */}
                  {report.status === 'resolved' && !report.isFlagged && (
                    <div className="bg-green-50 px-5 py-3 border-t border-green-200 flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                        <path d="M5 13l4 4L19 7"></path>
                      </svg>
                      <span className="text-xs text-green-800">Issue resolved and verified</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
