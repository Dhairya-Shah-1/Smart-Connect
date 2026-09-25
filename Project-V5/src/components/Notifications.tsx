import { useState, useEffect } from 'react';
import { Bell, CheckCircle, Clock, AlertCircle, AlertTriangle, MapPin } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useTheme } from '../App';
import { BlurredVideoLoader } from './ui/blurred-video-loader';
import {
  getBrowserCache,
  isBrowserCacheFresh,
  sanitizeCacheKeyPart,
  setBrowserCache,
} from '../utils/browserCache';

const NOTIFICATIONS_CACHE_PREFIX = 'smart_connect_notifications';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'urgent';
  severity?: string;
  timestamp: string;
  read: boolean;
  lat?: number;
  lng?: number;
}

export function Notifications() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const getCurrentUser = () => {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return null;

    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  };

  const getNotificationsCacheKeys = (user: any) => {
    const suffix = sanitizeCacheKeyPart(`${user.role || 'user'}_${user.id}`);

    return {
      cookieKey: `${NOTIFICATIONS_CACHE_PREFIX}_meta_${suffix}`,
      storageKey: `${NOTIFICATIONS_CACHE_PREFIX}_data_${suffix}`,
    };
  };

  const buildNotificationsSignature = (reports: any[]) =>
    reports
      .map((report: any) => [
        report.report_id,
        report.user_id,
        report.status,
        report.timestamp,
        report.severity,
        report.incident_type,
      ].join(':'))
      .join('|');

  const buildNotifications = (allReports: any[], user: any) => {
    const userReports = allReports.filter(
      (r: any) => r.user_id === user.id
    );

    const notifs: Notification[] = userReports.map((report: any) => {
      let title = '';
      let message = '';
      let type: 'success' | 'info' | 'warning' | 'urgent' = 'info';

      if (report.status === 'resolved') {
        title = 'Incident Resolved ✓';
        message = `Your ${report.severity} severity ${report.incident_type} report has been resolved.`;  //${report.location}
        type = 'success';
      } else if (report.status === 'in-progress') {
        title = 'Incident Under Review';
        message = `Authorities are working on your ${report.incident_type} report.`; //${report.location}
        type = 'info';
      } else {
        if (report.severity === 'critical' || report.severity === 'high') {
          title = 'Urgent Report Received';
          message = `Your ${report.severity} severity ${report.incident_type} report was flagged for immediate attention.`;  //${report.location}
          type = 'urgent';
        } else {
          title = 'Report Received & Pending';
          message = `Your ${report.incident_type} report is pending review.`;  //${report.location}
          type = 'warning';
        }
      }

      return {
        id: report.report_id,
        title,
        message,
        type,
        severity: report.severity,
        timestamp: report.timestamp,
        read: false,
        lat: report.lat,
        lng: report.lng,
      };
    });

    // 3. Nearby critical incidents (other users)
    const criticalNearby = allReports
      .filter(
        (r: any) =>
          (r.severity === 'critical' || r.severity === 'high') &&
          r.user_id !== user.id
      )
      .slice(0, 3);

    criticalNearby.forEach((report: any) => {
      notifs.push({
        id: `nearby-${report.report_id}`,
        title: '⚠️ Critical Incident Nearby',
        message: `${report.incident_type} reported. Stay alert.`,
        type: 'urgent',
        severity: report.severity,
        timestamp: report.timestamp,
        read: false,
        lat: report.lat,
        lng: report.lng,
      });
    });

    // 4. Sort newest first
    return notifs.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() -
          new Date(a.timestamp).getTime()
      );
  };

  const fetchReportsForNotifications = async (columns = '*') => {
    const { data, error } = await supabase
      .from('incident_reports_view')
      .select(columns)
      .order('timestamp', { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const fetchNotifications = async (options: { showLoader?: boolean } = {}) => {
    const { showLoader = true } = options;
    const user = getCurrentUser();

    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      if (showLoader) setLoading(true);

      const allReports = await fetchReportsForNotifications();
      const nextNotifications = buildNotifications(allReports, user);
      const { cookieKey, storageKey } = getNotificationsCacheKeys(user);

      setNotifications(nextNotifications);
      setBrowserCache<Notification[]>(
        cookieKey,
        storageKey,
        nextNotifications,
        buildNotificationsSignature(allReports),
      );
    } catch (err) {
      console.error(err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const getNotificationsSignature = async () => {
    const reports = await fetchReportsForNotifications(
      'report_id,user_id,status,timestamp,severity,incident_type',
    );

    return buildNotificationsSignature(reports);
  };

  const loadNotificationsFromCacheOrDatabase = async () => {
    const user = getCurrentUser();

    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const { cookieKey, storageKey } = getNotificationsCacheKeys(user);
    const cached = getBrowserCache<Notification[]>(cookieKey, storageKey);

    if (!cached) {
      await fetchNotifications();
      return;
    }

    setNotifications(cached.data);
    setLoading(false);

    if (isBrowserCacheFresh(cached.metadata.updatedAt)) return;

    try {
      const latestSignature = await getNotificationsSignature();
      if (latestSignature !== cached.metadata.signature) {
        await fetchNotifications({ showLoader: false });
      } else {
        setBrowserCache(cookieKey, storageKey, cached.data, latestSignature);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadNotificationsFromCacheOrDatabase();
  }, []);

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return CheckCircle;
      case 'warning':
        return AlertCircle;
      case 'urgent':
        return AlertTriangle;
      default:
        return Clock;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'success':
        return isDark ? 'text-green-400' : 'text-green-600';
      case 'warning':
        return isDark ? 'text-yellow-400' : 'text-yellow-600';
      case 'urgent':
        return isDark ? 'text-red-400' : 'text-red-600';
      default:
        return isDark ? 'text-blue-400' : 'text-blue-600';
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case 'success':
        return isDark
          ? 'bg-green-900/30 border-green-700'
          : 'bg-green-50 border-green-200';
      case 'warning':
        return isDark
          ? 'bg-yellow-900/30 border-yellow-700'
          : 'bg-yellow-50 border-yellow-200';
      case 'urgent':
        return isDark
          ? 'bg-red-900/30 border-red-700'
          : 'bg-red-50 border-red-300';
      default:
        return isDark
          ? 'bg-blue-900/30 border-blue-700'
          : 'bg-blue-50 border-blue-200';
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const urgentCount = notifications.filter((n) => n.type === 'urgent' && !n.read).length;

  // Show loading spinner while fetching data
  if (loading) {
    return (
      <BlurredVideoLoader
        label="Loading alerts..."
        containerClassName="absolute inset-0 z-30 flex items-center justify-center bg-slate-900"
        cardClassName="flex flex-col items-center gap-3"
        textClassName="text-sm font-medium text-gray-300"
      />
    );
  }

  return (
    <div className={`mobile-scroll-content hide-scrollbar absolute inset-0 ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className={`text-2xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Alert Center</h2>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <span className={`text-white px-3 py-1 rounded-full text-xs ${isDark ? 'bg-blue-600' : 'bg-blue-800'}`}>
                  {unreadCount} new
                </span>
              )}
              {urgentCount > 0 && (
                <span className="bg-red-600 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1 animate-pulse">
                  <AlertTriangle size={12} />
                  {urgentCount} urgent
                </span>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className={`hover:underline text-sm ${isDark ? 'text-blue-400' : 'text-blue-800'}`}
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Urgent Alerts Section */}
        {urgentCount > 0 && (
          <div className="mb-6">
            <h3 className={`text-sm mb-3 flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              <AlertTriangle size={16} className={isDark ? 'text-red-400' : 'text-red-600'} />
              Urgent Alerts
            </h3>
            <div className="space-y-3">
              {notifications
                .filter((n) => n.type === 'urgent' && !n.read)
                .map((notification) => {
                  const Icon = getIcon(notification.type);
                  const iconColor = getIconColor(notification.type);
                  const bgColor = getBgColor(notification.type);

                  return (
                    <div
                      key={notification.id}
                      className={`rounded-lg shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow border-2 ${bgColor}`}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <div className="flex gap-4">
                        <div className={`flex-shrink-0 ${iconColor}`}>
                          <Icon size={24} strokeWidth={2.5} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{notification.title}</h3>
                            <span className="w-2 h-2 bg-red-600 rounded-full flex-shrink-0 animate-pulse"></span>
                          </div>
                          <p className={`text-sm mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{notification.message}</p>
                          {notification.lat && notification.lng && (
                            <p 
                              className={`text-sm flex items-center gap-1 cursor-pointer hover:underline ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                              onClick={() => notification.lat && notification.lng && window.open(`https://www.google.com/maps/place/${notification.lat},${notification.lng}/@${notification.lat},${notification.lng},208m/data=!3m1!1e3`, "_blank")}
                            >
                              <MapPin size={13} />
                              {notification.lat}, {notification.lng}
                            </p>
                          )}
                          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {new Date(notification.timestamp).toLocaleDateString('en-GB')} at{" "}
                            {new Date(notification.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* All Notifications */}
        <h3 className={`text-sm mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>All Notifications</h3>
        
        {notifications.length === 0 ? (
          <div className={`rounded-xl shadow-sm p-8 text-center border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
            <Bell className={`mx-auto mb-4 ${isDark ? 'text-slate-600' : 'text-gray-300'}`} size={48} />
            <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>No notifications yet</p>
            <p className={`text-sm mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              You'll receive real-time updates about your incident reports here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const Icon = getIcon(notification.type);
              const iconColor = getIconColor(notification.type);
              const bgColor = getBgColor(notification.type);

              return (
                <div
                  key={notification.id}
                  className={`rounded-lg shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow border ${
                    isDark ? 'bg-slate-800' : 'bg-white'
                  } ${
                    !notification.read
                      ? `border-l-4 ${
                          notification.type === 'urgent'
                            ? 'border-l-red-600'
                            : isDark ? 'border-l-blue-500' : 'border-l-blue-800'
                        }`
                      : isDark ? 'border-slate-700' : 'border-gray-200'
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex gap-4">
                    <div className={`flex-shrink-0 ${iconColor}`}>
                      <Icon size={22} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className={`text-sm ${
                          !notification.read
                            ? isDark ? 'text-white' : 'text-gray-900'
                            : isDark ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {notification.title}
                        </h3>
                        {!notification.read && (
                          <span className={`w-2 h-2 ${notification.type === 'urgent' ? 'bg-red-600' : isDark ? 'bg-blue-500' : 'bg-blue-800'} rounded-full flex-shrink-0`}></span>
                        )}
                      </div>
                      <p className={`text-sm mb-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{notification.message}</p>
                      {notification.lat && notification.lng && (
                        <p 
                          className={`text-sm mb-1 flex items-center gap-1 cursor-pointer hover:underline ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                          onClick={() => notification.lat && notification.lng && window.open(`https://www.google.com/maps/place/${notification.lat},${notification.lng}/@${notification.lat},${notification.lng},208m/data=!3m1!1e3`, "_blank")}
                        >
                          <MapPin size={13} />
                          {notification.lat}, {notification.lng}
                        </p>
                      )}
                      <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {new Date(notification.timestamp).toLocaleDateString()} at{' '}
                        {new Date(notification.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
