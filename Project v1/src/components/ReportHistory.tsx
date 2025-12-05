import { useState, useEffect } from 'react';
import { Clock, MapPin, Droplets, AlertTriangle, Flame, Car, Mountain, ShieldCheck, Building2 } from 'lucide-react';

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
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const allReports = JSON.parse(localStorage.getItem('reports') || '[]');
    const userReports = allReports.filter((r: Report) => r.userName === user.name);
    setReports(userReports);
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
    switch (status.toLowerCase()) {
      case 'resolved':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const filteredReports = reports.filter((report) => {
    if (filter === 'all') return true;
    return report.status === filter;
  });

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-2xl mb-1 text-gray-900">My Incident Reports</h2>
          <p className="text-sm text-gray-600 mb-4">Track the status and resolution of your reports</p>
          
          {/* Filter Buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors border ${
                filter === 'all'
                  ? 'bg-blue-800 text-white border-blue-900'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
              }`}
            >
              All Reports ({reports.length})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-lg transition-colors border ${
                filter === 'pending'
                  ? 'bg-gray-700 text-white border-gray-800'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
              }`}
            >
              Pending ({reports.filter((r) => r.status === 'pending').length})
            </button>
            <button
              onClick={() => setFilter('in-progress')}
              className={`px-4 py-2 rounded-lg transition-colors border ${
                filter === 'in-progress'
                  ? 'bg-yellow-600 text-white border-yellow-700'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
              }`}
            >
              In Progress ({reports.filter((r) => r.status === 'in-progress').length})
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`px-4 py-2 rounded-lg transition-colors border ${
                filter === 'resolved'
                  ? 'bg-green-600 text-white border-green-700'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
              }`}
            >
              Resolved ({reports.filter((r) => r.status === 'resolved').length})
            </button>
          </div>
        </div>

        {/* Reports List */}
        <div className="space-y-4">
          {filteredReports.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center border border-gray-200">
              <p className="text-gray-500">No reports found</p>
              {filter !== 'all' && (
                <button
                  onClick={() => setFilter('all')}
                  className="mt-2 text-blue-800 hover:underline"
                >
                  View all reports
                </button>
              )}
            </div>
          ) : (
            filteredReports.map((report) => {
              const Icon = getIssueIcon(report.type);
              
              return (
                <div key={report.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Incident Photo */}
                      {report.photo && (
                        <img 
                          src={report.photo} 
                          alt="Incident" 
                          className="w-32 h-32 object-cover rounded-lg flex-shrink-0"
                        />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <Icon className="text-gray-700" size={20} />
                              </div>
                              <div>
                                <h3 className="text-lg text-gray-900">{report.type}</h3>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                  <MapPin size={12} />
                                  {report.location}
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <span className={`px-3 py-1 rounded-full text-xs border-2 ${getSeverityColor(report.severity)} flex-shrink-0 ml-2`}>
                            {report.severity?.toUpperCase() || 'UNKNOWN'}
                          </span>
                        </div>
                        
                        <p className="text-sm text-gray-700 mb-4">{report.description}</p>
                        
                        {/* Status and Department Grid */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <p className="text-xs text-gray-600 mb-1">Current Status</p>
                            <span className={`inline-block px-3 py-1 rounded text-xs border ${getStatusBadgeColor(report.status)}`}>
                              {report.status === 'in-progress' ? 'In Progress' : report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                            </span>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <p className="text-xs text-gray-600 mb-1">Department</p>
                            <p className="text-xs text-gray-900 flex items-center gap-1">
                              <Building2 size={12} />
                              {report.departmentNotified || 'Municipal Authority'}
                            </p>
                          </div>
                        </div>
                        
                        {/* AI Verification Badge */}
                        {report.aiVerified && (
                          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 inline-flex">
                            <ShieldCheck className="text-green-700" size={14} />
                            <span className="text-xs text-green-800">Verified by SmartConnect AI</span>
                          </div>
                        )}
                        
                        {/* Timestamp */}
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock size={12} />
                          Reported on {new Date(report.timestamp).toLocaleDateString()} at{' '}
                          {new Date(report.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress Bar for In-Progress Items */}
                  {report.status === 'in-progress' && (
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
                  {report.status === 'resolved' && (
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
