import { useState, useEffect } from 'react';
import { MapPin, Droplets, AlertTriangle, Flame, Car, Mountain, Navigation, Filter, Search, X, ShieldCheck } from 'lucide-react';

interface Issue {
  id: string;
  type: string;
  location: string;
  lat: number;
  lng: number;
  status: string;
  severity: string;
  description: string;
  timestamp: string;
  userName: string;
  photo?: string | null;
  aiVerified: boolean;
  departmentNotified: string;
}

export function MapView() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [userLocation] = useState({ lat: 40.7128, lng: -74.0060 });
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    const reports = JSON.parse(localStorage.getItem('reports') || '[]');
    setIssues(reports);
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
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-red-600 border-red-700';
      case 'high':
        return 'bg-orange-500 border-orange-600';
      case 'medium':
        return 'bg-yellow-500 border-yellow-600';
      case 'low':
        return 'bg-blue-500 border-blue-600';
      default:
        return 'bg-gray-500 border-gray-600';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'resolved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredIssues = issues.filter((issue) => {
    const matchesType = filterType === 'all' || issue.type.toLowerCase() === filterType.toLowerCase();
    const matchesSeverity = filterSeverity === 'all' || issue.severity.toLowerCase() === filterSeverity.toLowerCase();
    const matchesSearch = searchQuery === '' || 
      issue.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesType && matchesSeverity && matchesSearch;
  });

  const severityCounts = {
    critical: issues.filter(i => i.severity === 'critical').length,
    high: issues.filter(i => i.severity === 'high').length,
    medium: issues.filter(i => i.severity === 'medium').length,
    low: issues.filter(i => i.severity === 'low').length,
  };

  return (
    <div className="h-full flex">
      {/* Filter Panel */}
      <div className={`${showFilters ? 'w-80' : 'w-0'} transition-all duration-300 bg-white border-r border-gray-200 overflow-hidden flex-shrink-0`}>
        <div className="p-4 h-full overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm text-gray-900">Filters & Legend</h3>
            <button
              onClick={() => setShowFilters(false)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
          </div>

          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search location..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-800"
              />
            </div>
          </div>

          {/* Severity Filter */}
          <div className="mb-4">
            <label className="block text-xs text-gray-700 mb-2">Severity Level</label>
            <div className="space-y-1">
              <button
                onClick={() => setFilterSeverity('all')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  filterSeverity === 'all' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                All Severities ({issues.length})
              </button>
              <button
                onClick={() => setFilterSeverity('critical')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  filterSeverity === 'critical' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-red-600 rounded-full"></span>
                  Critical
                </span>
                <span>{severityCounts.critical}</span>
              </button>
              <button
                onClick={() => setFilterSeverity('high')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  filterSeverity === 'high' ? 'bg-orange-50 text-orange-800 border border-orange-200' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                  High
                </span>
                <span>{severityCounts.high}</span>
              </button>
              <button
                onClick={() => setFilterSeverity('medium')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  filterSeverity === 'medium' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                  Medium
                </span>
                <span>{severityCounts.medium}</span>
              </button>
              <button
                onClick={() => setFilterSeverity('low')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  filterSeverity === 'low' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                  Low
                </span>
                <span>{severityCounts.low}</span>
              </button>
            </div>
          </div>

          {/* Type Filter */}
          <div className="mb-4">
            <label className="block text-xs text-gray-700 mb-2">Incident Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-800"
            >
              <option value="all">All Types</option>
              <option value="flood">Flood</option>
              <option value="puddle">Puddle</option>
              <option value="pothole">Pothole</option>
              <option value="landslide">Landslide</option>
              <option value="fire">Fire</option>
              <option value="accident">Accident</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Status Legend */}
          <div className="mb-4">
            <label className="block text-xs text-gray-700 mb-2">Status Legend</label>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-gray-100 text-gray-800 border border-gray-200 rounded">Pending</span>
                <span className="text-gray-600">Awaiting Review</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 border border-yellow-200 rounded">In Progress</span>
                <span className="text-gray-600">Being Addressed</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-green-100 text-green-800 border border-green-200 rounded">Resolved</span>
                <span className="text-gray-600">Issue Fixed</span>
              </div>
            </div>
          </div>

          {/* Active Filters */}
          {(filterType !== 'all' || filterSeverity !== 'all' || searchQuery !== '') && (
            <button
              onClick={() => {
                setFilterType('all');
                setFilterSeverity('all');
                setSearchQuery('');
              }}
              className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative bg-gradient-to-br from-slate-100 to-blue-50">
        {/* Toggle Filter Button */}
        {!showFilters && (
          <button
            onClick={() => setShowFilters(true)}
            className="absolute top-4 left-4 z-10 bg-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 hover:bg-gray-50 transition-colors"
          >
            <Filter size={18} />
            <span className="text-sm">Filters</span>
          </button>
        )}

        {/* Map Stats */}
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3 z-10">
          <div className="text-xs text-gray-600 mb-1">Live Incidents</div>
          <div className="text-2xl text-gray-900">{filteredIssues.length}</div>
        </div>

        {/* Mock Map */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-full h-full p-8">
            {/* Grid for map effect */}
            <div className="absolute inset-0 opacity-5">
              <div className="grid grid-cols-10 grid-rows-10 h-full w-full">
                {[...Array(100)].map((_, i) => (
                  <div key={i} className="border border-gray-400"></div>
                ))}
              </div>
            </div>

            {/* User Location */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="relative">
                <div className="w-14 h-14 bg-blue-800 rounded-full flex items-center justify-center shadow-xl animate-pulse border-4 border-white">
                  <Navigation className="text-white" size={26} />
                </div>
                <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap bg-blue-800 text-white px-3 py-1 rounded shadow-lg text-xs">
                  Your Location
                </div>
              </div>
            </div>

            {/* Issue Markers */}
            {filteredIssues.map((issue, index) => {
              const Icon = getIssueIcon(issue.type);
              const colorClass = getSeverityColor(issue.severity);
              
              const positions = [
                { top: '15%', left: '25%' },
                { top: '35%', left: '70%' },
                { top: '65%', left: '20%' },
                { top: '25%', left: '65%' },
                { top: '75%', left: '55%' },
                { top: '20%', left: '85%' },
                { top: '80%', left: '30%' },
                { top: '45%', left: '40%' },
              ];
              
              const position = positions[index % positions.length];

              return (
                <div
                  key={issue.id}
                  className="absolute cursor-pointer transform hover:scale-125 transition-transform z-20"
                  style={{ top: position.top, left: position.left }}
                  onClick={() => setSelectedIssue(issue)}
                >
                  <div className={`w-12 h-12 ${colorClass} rounded-full flex items-center justify-center shadow-xl border-2 ${
                    issue.severity === 'critical' ? 'animate-pulse' : ''
                  }`}>
                    <Icon className="text-white" size={22} strokeWidth={2.5} />
                  </div>
                  {issue.severity === 'critical' && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full border-2 border-white"></div>
                  )}
                </div>
              );
            })}

            {/* Selected Issue Detail Card */}
            {selectedIssue && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl max-w-md w-full z-30 border border-gray-200">
                <button
                  onClick={() => setSelectedIssue(null)}
                  className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-1"
                >
                  <X size={18} />
                </button>
                
                {selectedIssue.photo && (
                  <img 
                    src={selectedIssue.photo} 
                    alt="Incident" 
                    className="w-full h-48 object-cover rounded-t-xl"
                  />
                )}
                
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg text-gray-900">{selectedIssue.type}</h3>
                      <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                        <MapPin size={14} />
                        {selectedIssue.location}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs ${getSeverityColor(selectedIssue.severity)} text-white border-2`}>
                      {selectedIssue.severity.toUpperCase()}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-700 mb-4">{selectedIssue.description}</p>
                  
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">Status</p>
                      <span className={`inline-block px-2 py-1 rounded text-xs border ${getStatusBadgeColor(selectedIssue.status)}`}>
                        {selectedIssue.status === 'in-progress' ? 'In Progress' : selectedIssue.status.charAt(0).toUpperCase() + selectedIssue.status.slice(1)}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">Department</p>
                      <p className="text-xs text-gray-900">{selectedIssue.departmentNotified}</p>
                    </div>
                  </div>
                  
                  {selectedIssue.aiVerified && (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
                      <ShieldCheck className="text-green-700" size={16} />
                      <span className="text-xs text-green-800">Verified by SmartConnect AI</span>
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500">
                    Reported by {selectedIssue.userName} on {new Date(selectedIssue.timestamp).toLocaleDateString()} at{' '}
                    {new Date(selectedIssue.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
