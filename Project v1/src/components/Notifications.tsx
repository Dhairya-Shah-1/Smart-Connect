import { useState, useEffect } from 'react';
import { Bell, CheckCircle, Clock, AlertCircle, AlertTriangle } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'urgent';
  severity?: string;
  timestamp: string;
  read: boolean;
}

export function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const allReports = JSON.parse(localStorage.getItem('reports') || '[]');
    const userReports = allReports.filter((r: any) => r.userName === user.name);

    // Generate notifications based on reports
    const notifs: Notification[] = userReports.map((report: any) => {
      let title = '';
      let message = '';
      let type: 'success' | 'info' | 'warning' | 'urgent' = 'info';

      if (report.status === 'resolved') {
        title = 'Incident Resolved ✓';
        message = `Your ${report.severity} severity ${report.type} report at ${report.location} has been successfully resolved by ${report.departmentNotified}.`;
        type = 'success';
      } else if (report.status === 'in-progress') {
        title = 'Incident Under Review';
        message = `${report.departmentNotified} is actively working on your ${report.type} report at ${report.location}. Expected resolution: 2-3 days.`;
        type = 'info';
      } else {
        if (report.severity === 'critical' || report.severity === 'high') {
          title = 'Urgent Report Received';
          message = `Your ${report.severity} severity ${report.type} report at ${report.location} has been flagged for immediate attention.`;
          type = 'urgent';
        } else {
          title = 'Report Received & Verified';
          message = `Your ${report.type} report at ${report.location} has been received and is pending review by ${report.departmentNotified}.`;
          type = 'warning';
        }
      }

      return {
        id: report.id,
        title,
        message,
        type,
        severity: report.severity,
        timestamp: report.timestamp,
        read: false,
      };
    });

    // Add nearby critical incidents
    const criticalNearby = allReports.filter(
      (r: any) => (r.severity === 'critical' || r.severity === 'high') && r.userName !== user.name
    ).slice(0, 3);

    criticalNearby.forEach((report: any) => {
      notifs.push({
        id: `nearby-${report.id}`,
        title: '⚠️ Critical Incident Nearby',
        message: `${report.type} reported at ${report.location}. Stay alert and avoid the area if possible.`,
        type: 'urgent',
        severity: report.severity,
        timestamp: report.timestamp,
        read: false,
      });
    });

    setNotifications(notifs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
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
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'urgent':
        return 'text-red-600';
      default:
        return 'text-blue-600';
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'urgent':
        return 'bg-red-50 border-red-300';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const urgentCount = notifications.filter((n) => n.type === 'urgent' && !n.read).length;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl text-gray-900 mb-1">Alert Center</h2>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <span className="bg-blue-800 text-white px-3 py-1 rounded-full text-xs">
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
              className="text-blue-800 hover:underline text-sm"
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Urgent Alerts Section */}
        {urgentCount > 0 && (
          <div className="mb-6">
            <h3 className="text-sm text-gray-700 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600" />
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
                            <h3 className="text-sm text-gray-900">{notification.title}</h3>
                            <span className="w-2 h-2 bg-red-600 rounded-full flex-shrink-0 animate-pulse"></span>
                          </div>
                          <p className="text-sm text-gray-700 mb-2">{notification.message}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(notification.timestamp).toLocaleDateString()} at{' '}
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
        <h3 className="text-sm text-gray-700 mb-3">All Notifications</h3>
        
        {notifications.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center border border-gray-200">
            <Bell className="mx-auto mb-4 text-gray-300" size={48} />
            <p className="text-gray-500">No notifications yet</p>
            <p className="text-sm text-gray-400 mt-2">
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
                  className={`bg-white rounded-lg shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow border ${
                    !notification.read ? `border-l-4 ${notification.type === 'urgent' ? 'border-l-red-600' : 'border-l-blue-800'}` : 'border-gray-200'
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex gap-4">
                    <div className={`flex-shrink-0 ${iconColor}`}>
                      <Icon size={22} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className={`text-sm ${!notification.read ? 'text-gray-900' : 'text-gray-600'}`}>
                          {notification.title}
                        </h3>
                        {!notification.read && (
                          <span className={`w-2 h-2 ${notification.type === 'urgent' ? 'bg-red-600' : 'bg-blue-800'} rounded-full flex-shrink-0`}></span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                      <p className="text-xs text-gray-400">
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
