import { useState, useEffect } from 'react';
import { Clock, MapPin, Droplets, AlertTriangle, Flame, Car, Mountain, ShieldCheck, Building2, Loader2 } from 'lucide-react';
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
  departmentNotified: string;
}

export function ReportHistory() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return;
    const user = JSON.parse(userStr);

    const fetchReports = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from('incident_reports')
          .select('*')
          .eq('user_id', user.id)
          .order('timestamp', { ascending: false });

        if (error) throw error;

        if (data) {
          const mapped: Report[] = data.map((r: any) => ({
            id: r.report_id || r.id,
            type: r.incident_type,
            severity: r.severity,
            location: r.location,
            description: r.incident_description,
            photo: r.photo_url,
            status: r.status,
            timestamp: r.timestamp || r.created_at,
            userName: user.name,
            aiVerified: true,
            departmentNotified: r.department || 'Municipal Authority',
          }));
          setReports(mapped);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReports();

    // Real-time subscription for new reports
    const subscription = supabase
      .channel('incident_reports_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incident_reports',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchReports();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const getIssueIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'flood':
      case 'puddle':
        return Droplets;
      case 'pothole':
        return AlertTriangle;
      case 'fire':
        return Flame;
      case 'accident':
        return Car;
      case 'landslide':
        return Mountain;
      default:
        return MapPin;
    }
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
            <div className="bg-white p-8 rounded-xl border text-center">
              <p className="text-gray-500">No reports found</p>
            </div>
          ) : (
            filteredReports.map(report => {
              const Icon = getIssueIcon(report.type);

              return (
                <div key={report.id} className="bg-white rounded-xl border shadow-sm hover:shadow-md transition">
                  <div className="p-5 flex gap-4">
                    {report.photo && (
                      <img
                        src={report.photo}
                        className="w-32 h-32 object-cover rounded-lg"
                        alt="incident"
                      />
                    )}

                    <div className="flex-1">
                      <div className="flex justify-between mb-3">
                        <div className="flex gap-2 items-center">
                          <Icon size={20} />
                          <div>
                            <h3 className="text-lg">{report.type}</h3>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <MapPin size={12} />
                              {report.location}
                            </p>
                          </div>
                        </div>

                        <span className={`px-3 py-1 rounded-full text-xs border ${getSeverityColor(report.severity)}`}>
                          {report.severity.toUpperCase()}
                        </span>
                      </div>

                      <p className="text-sm mb-3">{report.description}</p>

                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="p-3 bg-gray-50 rounded-lg border">
                          <p className="text-xs mb-1">Status</p>
                          <span className={`px-3 py-1 text-xs rounded border ${getStatusBadgeColor(report.status)}`}>
                            {report.status}
                          </span>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg border">
                          <p className="text-xs mb-1">Department</p>
                          <p className="text-xs flex gap-1">
                            <Building2 size={12} />
                            {report.departmentNotified}
                          </p>
                        </div>
                      </div>

                      {report.aiVerified && (
                        <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">
                          <ShieldCheck size={14} className="text-green-700" />
                          <span className="text-xs text-green-800">
                            Verified by SmartConnect AI
                          </span>
                        </div>
                      )}

                      <p className="text-xs text-gray-500 flex gap-1 items-center">
                        <Clock size={12} />
                        {new Date(report.timestamp).toLocaleString()}
                      </p>
                    </div>
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
