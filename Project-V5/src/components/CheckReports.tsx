import { useState, useEffect } from 'react';
import { MapPin, CheckCircle, Clock, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useTheme } from '../App';
import { toast } from 'sonner@2.0.3';
import { isMobileOrTablet } from "../utils/deviceDetection";
import { supabase } from './supabaseClient';

export function CheckReports() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [filter, setFilter] = useState('critical');
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const isMobile = isMobileOrTablet();

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

  const openFullscreenImage = (imageUrl: string) => {
    setFullscreenImage(imageUrl);
    setImageZoom(1);
  };

  const closeFullscreenImage = () => {
    setFullscreenImage(null);
    setImageZoom(1);
  };

  const filteredReports = reports.filter(r => filter === 'all' ? true : r.severity === filter);
  const categories = ['all', 'critical', 'high', 'medium', 'low'];

  return (
    <div className={`h-full flex flex-col ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      {/* Responsive Layout - Mobile & Desktop Optimized */}
      <div className="max-w-7xl mx-auto w-full h-full flex flex-col p-3 md:p-6">
        {/* Header Section */}
        <div className="mb-4 md:mb-6">
          <h2 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-900'}`}>Incoming Reports</h2>
          <p className={`text-xs md:text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Review and verify pending incident reports from citizens
          </p>
        </div>
        
        {/* Filter Buttons */}
        <div className="flex gap-2 md:gap-3 pb-4 md:pb-6 shrink-0 overflow-x-auto no-scrollbar">
          {categories.map(cat => {
            const count = reports.filter(r => cat === 'all' || r.severity === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-4 md:px-6 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-semibold capitalize transition-all flex items-center gap-2 whitespace-nowrap ${
                  filter === cat
                    ? isDark ? 'bg-indigo-600 text-white shadow-lg' : 'bg-indigo-600 text-white shadow-lg' /* hover:bg-blue-200 */
                    : isDark ? 'bg-slate-800 text-gray-400 hover:bg-slate-700' : 'bg-white text-gray-600 border border-blue-500 hover:bg-blue-100'
                }`}
              >
                {cat}
                {count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    filter === cat
                      ? 'bg-white/20 text-white'
                      : isDark ? 'bg-slate-700 text-gray-300' : 'bg-blue-200 text-gray-700'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Reports Grid - Responsive */}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-6 hide-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2
                size={48}
                className={isDark ? 'text-indigo-400' : 'text-indigo-600'}
                style={{
                  animation: 'spin 1s linear infinite',
                }}
              />
              <p className={`mt-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading reports...</p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className={`text-center py-20 md:py-32 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <CheckCircle className={`mx-auto mb-3 w-12 h-12 md:w-16 md:h-16 ${isDark ? 'text-green-400 opacity-50' : 'text-green-800'}`} />
              <p className="text-base md:text-lg font-medium">No pending reports in this category</p>
              <p className="text-xs md:text-sm mt-1">All reports have been processed</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
              {filteredReports.map((report) => (
                <div 
                  key={report.report_id} 
                  className={`p-4 md:p-5 rounded-xl border transition-all hover:shadow-xl ${
                    isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-blue-500 hover:border-blue-200'
                  }`}
                >
                  {/* Header with Severity and Time */}
                  <div className="flex justify-between items-start mb-3 md:mb-4">
                    <span className={`px-2.5 md:px-3 py-1 md:py-1.5 rounded-md text-xs uppercase font-bold ${
                      report.severity === 'critical' 
                        ? 'bg-red-100 text-red-800' 
                        : report.severity === 'high' 
                        ? 'bg-orange-100 text-orange-800' 
                        : report.severity === 'medium'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-blue-100 text-blue-800'
                      } 
                    `}>
                      {report.severity}
                    </span>
                    <span className={`text-xs flex items-center gap-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      <Clock size={12} className="md:w-3.5 md:h-3.5" /> 
                      {new Date(report.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  
                  {/* Image Preview - Clickable for fullscreen */}
                  {report.photo_url && (
                    <div
                      className={`mb-3 md:mb-4 rounded-lg overflow-hidden cursor-pointer relative group ${isDark ? '' : 'border border-blue-500'} `}
                      onClick={() => openFullscreenImage(report.photo_url)}
                    >
                      <img 
                        src={report.photo_url} 
                        alt="Evidence" 
                        className="w-full h-48 md:h-52 object-contain bg-gray-100 bg-slate-200 dark:bg-slate-700 transition-transform"
                      />

                      {/* Overlay */}
                      <div className={`absolute inset-0 flex flex-col items-center justify-center ${isMobile ? "" : "opacity-0 group-hover:opacity-100 transition-opacity bg-slate-500 duration-300"} `}>
                        <ZoomIn className="text-white mb-2" size={32} />
                        <p className="text-white text-sm font-medium">Click to view image</p>
                      </div>
                    </div>
                  )}

                  {/* Report Details */}
                  <div className="space-y-2 mb-3 md:mb-4">
                    <h3 className={`font-semibold text-sm md:text-base ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                      {report.incident_type}
                    </h3>
                    <p className={`text-xs md:text-sm leading-relaxed line-clamp-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      {report.incident_description}
                    </p>
                    <div className="flex items-center gap-2 pt-2">
                      <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isDark ? 'bg-slate-700 text-indigo-400' : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        {(report.users?.u_name || 'A')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          {report.users?.u_name || 'Anonymous'}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          Reporter
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className={`flex gap-2 md:gap-3 pt-3 md:pt-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                    <button 
                      onClick={() => handleAction(report.report_id, 'reject')}
                      className={`flex-1 py-2 md:py-2.5 rounded-lg border text-xs md:text-sm font-semibold transition-all ${
                        isDark 
                          ? 'border-red-800 text-red-400 hover:bg-red-900/20' 
                          : 'border-red-300 text-red-600 hover:bg-red-50'
                      }`}
                    >
                      Reject
                    </button>
                    <button 
                      onClick={() => handleAction(report.report_id, 'confirm')}
                      className="flex-1 py-2 md:py-2.5 rounded-lg bg-indigo-600 text-white text-xs md:text-sm font-semibold hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all"
                    >
                      Verify & Dispatch
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Image Viewer with Zoom & Rotate */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFullscreenImage();
          }}
        >
          {/* Image Container */}
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            <img
              src={fullscreenImage}
              alt="Fullscreen Evidence"
              className="max-w-full max-h-full object-contain select-none"
              style={{
                transform: `scale(${imageZoom})`,
                transition: 'transform 0.3s ease',
              }}
              draggable={false}
            />
            
            {/* Close Button */}
            <button
              className="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2.5 md:p-3 shadow-lg transition-all"
              onClick={closeFullscreenImage}
            >
              <X size={20} className="text-gray-800" />
            </button>

            {/* Control Panel */}
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-3 bg-white/90 rounded-full px-4 py-3 shadow-2xl">
              {/* Zoom Out */}
              <button
                className="p-2 hover:bg-gray-200 rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => setImageZoom((prev) => Math.max(prev - 0.25, 0.5))}
                disabled={imageZoom <= 0.5}
              >
                <ZoomOut size={20} className="text-gray-700" />
              </button>

              {/* Zoom Indicator */}
              <span className="text-xs font-semibold text-gray-700 min-w-[50px] text-center">
                {Math.round(imageZoom * 100)}%
              </span>

              {/* Zoom In */}
              <button
                className="p-2 hover:bg-gray-200 rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => setImageZoom((prev) => Math.min(prev + 0.25, 5))}
                disabled={imageZoom >= 5}
              >
                <ZoomIn size={20} className="text-gray-700" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
