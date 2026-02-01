import { useState, useEffect } from 'react';
import { MapPin, CheckCircle, Clock } from 'lucide-react';
import { useTheme } from '../App';
import { toast } from 'sonner';
import { supabase } from './supabaseClient';

export function CheckReports() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [filter, setFilter] = useState('critical');
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
        .from('incident_reports')
        .select('*, users(u_name)')
        .eq('status', 'pending')
        .order('timestamp', { ascending: false });

    if (error) {
        console.error(error);
        toast.error("Error loading reports");
    } else {
        setReports(data || []);
        const counts = {
            critical: data?.filter(r => r.severity === 'critical').length || 0,
            high: data?.filter(r => r.severity === 'high').length || 0,
            medium: data?.filter(r => r.severity === 'medium').length || 0,
            low: data?.filter(r => r.severity === 'low').length || 0,
        };
        if (counts.critical > 0) setFilter('critical');
        else if (counts.high > 0) setFilter('high');
        else if (counts.medium > 0) setFilter('medium');
        else if (counts.low > 0) setFilter('low');
    }
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, []);

  const handleAction = async (id: string, action: 'confirm' | 'reject') => {
      const newStatus = action === 'confirm' ? 'in-progress' : 'rejected';
      const { error } = await supabase.from('incident_reports').update({ status: newStatus }).eq('report_id', id);
      
      if (error) {
          toast.error("Failed to update status");
      } else {
          toast.success(`Report ${action === 'confirm' ? 'verified' : 'rejected'}`);
          fetchReports(); // Refresh list
      }
  };

  const filteredReports = reports.filter(r => filter === 'all' ? true : r.severity === filter);
  const categories = ['all', 'critical', 'high', 'medium', 'low'];

  return (
    <div className={`h-full flex flex-col p-4 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <h2 className={`text-xl font-bold mb-4 ${isDark ? 'text-indigo-300' : 'text-indigo-900'}`}>Incoming Reports</h2>
      
      {/* Filter Buttons */}
      <div className="flex gap-2 overflow-x-auto pb-4 shrink-0 no-scrollbar">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-4 py-2 rounded-full text-xs font-bold capitalize whitespace-nowrap transition-all ${
              filter === cat
                ? isDark ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white shadow-md'
                : isDark ? 'bg-slate-800 text-gray-400' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Reports List */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-20">
        {loading ? <p className="text-center mt-10">Loading...</p> : filteredReports.length === 0 ? (
          <div className="text-center py-20 opacity-50">
            <CheckCircle className="mx-auto mb-2 w-12 h-12" />
            <p>No pending reports in this category.</p>
          </div>
        ) : (
          filteredReports.map((report) => (
            <div key={report.report_id} className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} shadow-sm`}>
              <div className="flex justify-between items-start mb-3">
                <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold ${
                  report.severity === 'critical' ? 'bg-red-100 text-red-800' : 
                  report.severity === 'high' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {report.severity}
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock size={12} /> {new Date(report.timestamp).toLocaleTimeString()}
                </span>
              </div>
              
              <div className="flex gap-4">
                {report.photo_url && <img src={report.photo_url} alt="Evidence" className="w-20 h-20 rounded-lg object-cover bg-gray-200" />}
                <div className="flex-1">
                  <h3 className={`font-semibold text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{report.incident_type}</h3>
                  <p className={`text-xs mt-1 line-clamp-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{report.incident_description}</p>
                  <p className="text-xs text-gray-500 mt-1">By: {report.users?.u_name || 'Anonymous'}</p>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button 
                  onClick={() => handleAction(report.report_id, 'reject')}
                  className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50"
                >
                  Reject
                </button>
                <button 
                  onClick={() => handleAction(report.report_id, 'confirm')}
                  className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm"
                >
                  Verify & Dispatch
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}