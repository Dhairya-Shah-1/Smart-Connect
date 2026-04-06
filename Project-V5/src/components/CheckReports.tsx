import { useState, useEffect } from 'react';
import { MapPin, CheckCircle, Clock, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useTheme } from '../App';
import { toast } from 'sonner';
import { isMobileOrTablet } from "../utils/deviceDetection";
import { supabase } from './supabaseClient';

const PAGE_SIZE = 7;
const categories = ['all', 'critical', 'high', 'medium', 'low'] as const;
type Category = (typeof categories)[number];

export function CheckReports() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [filter, setFilter] = useState<Category>('critical');
  const [reports, setReports] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<Category, number>>({
    all: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastTimestampCursor, setLastTimestampCursor] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const isMobile = isMobileOrTablet();
  const formatDisplayDate = (value: string) =>
    new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const fetchCounts = async () => {
    const [allRes, criticalRes, highRes, mediumRes, lowRes] = await Promise.all([
      supabase.from('incident_reports').select('*', { count: 'exact', head: true }).eq('status', 'in-progress'),
      supabase.from('incident_reports').select('*', { count: 'exact', head: true }).eq('status', 'in-progress').eq('severity', 'critical'),
      supabase.from('incident_reports').select('*', { count: 'exact', head: true }).eq('status', 'in-progress').eq('severity', 'high'),
      supabase.from('incident_reports').select('*', { count: 'exact', head: true }).eq('status', 'in-progress').eq('severity', 'medium'),
      supabase.from('incident_reports').select('*', { count: 'exact', head: true }).eq('status', 'in-progress').eq('severity', 'low'),
    ]);

    const nextCounts: Record<Category, number> = {
      all: allRes.count ?? 0,
      critical: criticalRes.count ?? 0,
      high: highRes.count ?? 0,
      medium: mediumRes.count ?? 0,
      low: lowRes.count ?? 0,
    };
    setCounts(nextCounts);
    return nextCounts;
  };

  const enrichWithUsers = async (rawReports: any[]) => {
    const userIds = [...new Set(rawReports.map(r => r.user_id).filter(Boolean))];
    if (userIds.length === 0) return rawReports;

    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('u_id, u_name, u_email')
      .in('u_id', userIds);

    if (usersError) {
      console.error('Error fetching user data:', usersError);
    }

    const userMap = new Map();
    usersData?.forEach(user => {
      userMap.set(user.u_id, { u_name: user.u_name, u_email: user.u_email });
    });

    return rawReports.map(report => ({
      ...report,
      reporter_name: userMap.get(report.user_id)?.u_name || 'Unknown User',
      reporter_email: userMap.get(report.user_id)?.u_email || 'Unknown Email',
      ai_verified: report.ai_interpretation ? !report.ai_interpretation.toLowerCase().includes('fake') : true,
      ai_reason: report.ai_interpretation || '',
      ai_confidence: report.ai_interpretation ? 0.8 : undefined,
    }));
  };

  const fetchBatch = async (activeFilter: Category, afterTimestamp: string | null, withLoader = true) => {
    if (withLoader) setLoading(true);

    let query = supabase
      .from('incident_reports_view')
      .select('*')
      .eq('status', 'in-progress')
      .order('timestamp', { ascending: true })
      .limit(PAGE_SIZE + 1);

    if (activeFilter !== 'all') {
      query = query.eq('severity', activeFilter);
    }

    if (afterTimestamp) {
      query = query.gt('timestamp', afterTimestamp);
    }

    const { data: reportsData, error: reportsError } = await query;

    if (reportsError) {
      console.error('Error fetching reports:', reportsError);
      toast.error('Error loading reports');
      if (withLoader) setLoading(false);
      return;
    }

    const rows = reportsData || [];
    const canLoadMore = rows.length > PAGE_SIZE;
    const pageRows = canLoadMore ? rows.slice(0, PAGE_SIZE) : rows;
    const reportsWithUsers = await enrichWithUsers(pageRows);

    setReports(reportsWithUsers);
    setHasMore(canLoadMore);
    setLastTimestampCursor(pageRows.length > 0 ? pageRows[pageRows.length - 1].timestamp : null);
    if (withLoader) setLoading(false);
  };

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      const nextCounts = await fetchCounts();

      let defaultFilter: Category = 'all';
      if (nextCounts.critical > 0) defaultFilter = 'critical';
      else if (nextCounts.high > 0) defaultFilter = 'high';
      else if (nextCounts.medium > 0) defaultFilter = 'medium';
      else if (nextCounts.low > 0) defaultFilter = 'low';

      setFilter(defaultFilter);
      await fetchBatch(defaultFilter, null, false);
      setLoading(false);
      setIsInitialized(true);
    };
    initialize();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    fetchBatch(filter, null);
  }, [filter, isInitialized]);

  const handleMarkResolved = async (id: string) => {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      
      const { error } = await supabase
        .from('incident_reports')
        .update({ 
          status: 'resolved',
          a_id: currentUser.id  // Set admin id who resolved the report
        })
        .eq('report_id', id);

      if (error) {
          toast.error('Failed to resolve report');
      } else {
          toast.success('Report marked as resolved');
          const remaining = reports.filter(r => r.report_id !== id);
          setReports(remaining);
          const nextCounts = await fetchCounts();

          if (remaining.length === 0) {
            if (hasMore && lastTimestampCursor) {
              await fetchBatch(filter, lastTimestampCursor);
            } else {
              await fetchBatch(filter, null);
            }
          } else if (filter !== 'all' && nextCounts[filter] === 0) {
            if (nextCounts.critical > 0) setFilter('critical');
            else if (nextCounts.high > 0) setFilter('high');
            else if (nextCounts.medium > 0) setFilter('medium');
            else if (nextCounts.low > 0) setFilter('low');
            else setFilter('all');
          }
      }
  };

  const handleLoadMore = async () => {
    if (!hasMore || !lastTimestampCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchBatch(filter, lastTimestampCursor, false);
    setLoadingMore(false);
  };

  const openFullscreenImage = (imageUrl: string) => {
    setFullscreenImage(imageUrl);
    setImageZoom(1);
  };

  const closeFullscreenImage = () => {
    setFullscreenImage(null);
    setImageZoom(1);
  };

  const filteredReports = [...reports].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <div className={`h-full flex flex-col ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      {/* Responsive Layout - Mobile & Desktop Optimized */}
      <div className="max-w-7xl mx-auto w-full h-full flex flex-col p-3 md:p-6">
        {/* Header Section */}
        <div className="mb-4 md:mb-6">
          <h2 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-900'}`}>Verified Reports</h2>
          <p className={`text-xs md:text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Resolve the pending incident reports
          </p>
        </div>
        
        {/* Filter Buttons */}
        <div className="flex gap-2 md:gap-3 pb-4 md:pb-6 shrink-0 overflow-x-auto no-scrollbar">
          {categories.map(cat => {
            const count = counts[cat];
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
              <p className="text-xs md:text-sm mt-1">All reports have been resolved</p>
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
                      {formatDisplayDate(report.timestamp)}
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
                        className={`w-full h-48 md:h-52 object-contain bg-gray-100 bg-slate-200 dark:bg-slate-700 transition-transform ${isMobile ? "opacity-50" : ""} `}
                      />

                      {/* Overlay */}
                      <div className={`absolute inset-0 flex flex-col items-center justify-center ${isMobile ? "bg-slate-700\/50" : "opacity-0 group-hover:opacity-100 transition-opacity bg-slate-500 duration-300"} `}>
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
                    
                    {/* AI Interpretation Display */}
                    {report.ai_reason && (
                      <div className={`mt-2 p-2 rounded-lg text-xs ${
                        report.ai_verified 
                          ? isDark ? 'bg-green-900/30 border border-green-700' : 'bg-green-50 border border-green-200'
                          : isDark ? 'bg-red-900/30 border border-red-700' : 'bg-red-50 border border-red-200'
                      }`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`font-semibold ${
                            report.ai_verified ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {report.ai_verified ? '✓ AI Verified' : '✗ AI Flagged'}
                          </span>
                          {report.ai_confidence && (
                            <span className={`text-xs ${
                              report.ai_verified ? 'text-green-500' : 'text-red-500'
                            }`}>
                              ({Math.round(report.ai_confidence * 100)}% confidence)
                            </span>
                          )}
                        </div>
                        <p className={`text-xs ${
                          report.ai_verified ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {report.ai_reason}
                        </p>
                      </div>
                    )}
                    {/* Location Coordinates - use lat/lng from view */}
                    <div 
                      className={`flex items-center gap-1.5 text-xs cursor-pointer ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => report.lat && report.lng && window.open(`https://www.google.com/maps/place/${report.lat},${report.lng}/@${report.lat},${report.lng},208m/data=!3m1!1e3`, "_blank")}
                    >
                      {/* onClick={() => window.open(`https://www.google.com/maps/place/${selectedIssue.location}/@${selectedIssue.location},208m/data=!3m1!1e3`, "_blank")}> */}
                      <MapPin size={14} />
                      <span>{report.lat && report.lng ? `${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}` : 'View on map'}</span>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isDark ? 'bg-slate-700 text-indigo-400' : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        {(report.reporter_name || 'A')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          {report.reporter_name || 'Anonymous'}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          {report.reporter_email || 'Unknown Email'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Mark as Resolved Button */}
                  <div className={`pt-3 md:pt-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                    <button 
                      onClick={() => handleMarkResolved(report.report_id)}
                      className="w-full py-2 md:py-2.5 rounded-lg bg-green-600 text-white text-xs md:text-sm font-semibold hover:bg-green-700 shadow-md hover:shadow-lg transition-all"
                    >
                      Mark as Resolved
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && filteredReports.length > 0 && hasMore && (
            <div className="flex justify-center mt-6">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  isDark
                    ? 'bg-slate-700 text-gray-100 hover:bg-slate-600 disabled:opacity-60'
                    : 'bg-white border border-blue-500 text-blue-700 hover:bg-blue-50 disabled:opacity-60'
                }`}
              >
                {loadingMore ? 'Loading...' : 'More reports'}
              </button>
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