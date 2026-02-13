import { useState, useEffect } from 'react';
import { useTheme } from '../App';
import { supabase } from './supabaseClient';
import { toast } from 'sonner@2.0.3';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  MapPin,
  Mail,
  Building2,
  LogOut,
  Sun,
  Moon,
  TrendingUp,
  Users,
  AlertCircle,
  UserPlus,
  Trash2,
  Activity,
  BarChart3,
} from 'lucide-react';
import { AdminList } from './AdminList';

interface SuperAdminDashboardProps {
  onLogout: () => void;
}

type TabView = 'overview' | 'incidents' | 'admins' | 'analytics';

interface IncidentReport {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  location: string;
  department: string;
  created_at: string;
  user_id: string;
}

export function SuperAdminDashboard({ onLogout }: SuperAdminDashboardProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [superAdminData, setSuperAdminData] = useState<any>(null);
  const [currentTab, setCurrentTab] = useState<TabView>('overview');
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [filteredIncidents, setFilteredIncidents] = useState<IncidentReport[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalIncidents: 0,
    pendingIncidents: 0,
    inProgressIncidents: 0,
    resolvedIncidents: 0,
    totalAdmins: 0,
    totalUsers: 0,
  });
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    loadSuperAdminData();
  }, []);

  useEffect(() => {
    filterIncidents();
  }, [filterStatus, filterDepartment, incidents]);

  const filterIncidents = () => {
    let filtered = incidents;

    if (filterStatus !== 'all') {
      filtered = filtered.filter((inc) => inc.status === filterStatus);
    }

    if (filterDepartment !== 'all') {
      filtered = filtered.filter((inc) => inc.department === filterDepartment);
    }

    setFilteredIncidents(filtered);
  };

  const loadSuperAdminData = async () => {
    try {
      const userStr = localStorage.getItem('currentUser');
      const user = userStr ? JSON.parse(userStr) : null;

      if (!user || user.role !== 'super_admin') {
        toast.error('Unauthorized access');
        onLogout();
        return;
      }

      setSuperAdminData(user);

      // Fetch all incidents
      const { data: incidentData, error: incidentError } = await supabase
        .from('incident_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (incidentError) throw incidentError;

      setIncidents(incidentData || []);
      setFilteredIncidents(incidentData || []);

      // Extract unique departments
      const uniqueDepts = [...new Set(incidentData?.map((i: any) => i.department) || [])];
      setDepartments(uniqueDepts as string[]);

      // Fetch admin count
      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('a_id');

      if (adminError) throw adminError;

      // Fetch user count
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('u_id');

      if (userError) throw userError;

      // Calculate stats
      const totalIncidents = incidentData?.length || 0;
      const pendingIncidents = incidentData?.filter((i: any) => i.status === 'pending').length || 0;
      const inProgressIncidents = incidentData?.filter((i: any) => i.status === 'in_progress').length || 0;
      const resolvedIncidents = incidentData?.filter((i: any) => i.status === 'resolved').length || 0;
      const totalAdmins = adminData?.length || 0;
      const totalUsers = userData?.length || 0;

      setStats({
        totalIncidents,
        pendingIncidents,
        inProgressIncidents,
        resolvedIncidents,
        totalAdmins,
        totalUsers,
      });
    } catch (error: any) {
      console.error('Error loading super admin data:', error);
      toast.error('Failed to load super admin dashboard');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return isDark ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-800';
      case 'high':
        return isDark ? 'bg-orange-900 text-orange-200' : 'bg-orange-100 text-orange-800';
      case 'medium':
        return isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800';
      case 'low':
        return isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800';
      default:
        return isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800';
      case 'in_progress':
        return isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800';
      case 'resolved':
        return isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800';
      default:
        return isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className={`mt-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Loading Super Admin Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} border-b`}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className={`${isDark ? 'text-purple-400' : 'text-purple-600'}`} size={32} />
              <div>
                <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Super Admin Dashboard
                </h1>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  System-wide Management
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-lg ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
              >
                {isDark ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
              </button>
              <button
                onClick={onLogout}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  isDark ? 'bg-red-900 text-red-200 hover:bg-red-800' : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Super Admin Info Card */}
        <div className={`mb-6 p-6 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${
              isDark ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-700'
            }`}>
              {superAdminData?.sa_name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {superAdminData?.sa_name}
              </h2>
              <div className={`flex items-center gap-4 mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                <span className="flex items-center gap-1">
                  <Mail size={14} />
                  {superAdminData?.sa_email}
                </span>
                <span className="flex items-center gap-1">
                  <Building2 size={14} />
                  {superAdminData?.station}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin size={14} />
                  {superAdminData?.district}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className={`mb-6 p-2 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
          <div className="flex gap-2">
            {[
              { id: 'overview', label: 'Overview', icon: TrendingUp },
              { id: 'incidents', label: 'All Incidents', icon: AlertTriangle },
              { id: 'admins', label: 'Admin Management', icon: Users },
              { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id as TabView)}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors flex-1 justify-center ${
                  currentTab === tab.id
                    ? isDark
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-600 text-white'
                    : isDark
                    ? 'text-gray-300 hover:bg-slate-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {currentTab === 'overview' && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className={`p-6 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Incidents</p>
                    <p className={`text-3xl font-bold mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {stats.totalIncidents}
                    </p>
                  </div>
                  <Activity className={`${isDark ? 'text-blue-400' : 'text-blue-600'}`} size={32} />
                </div>
              </div>

              <div className={`p-6 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Admins</p>
                    <p className={`text-3xl font-bold mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {stats.totalAdmins}
                    </p>
                  </div>
                  <Users className={`${isDark ? 'text-purple-400' : 'text-purple-600'}`} size={32} />
                </div>
              </div>

              <div className={`p-6 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Users</p>
                    <p className={`text-3xl font-bold mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {stats.totalUsers}
                    </p>
                  </div>
                  <UserPlus className={`${isDark ? 'text-green-400' : 'text-green-600'}`} size={32} />
                </div>
              </div>
            </div>

            {/* Status Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-6 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Pending</p>
                    <p className={`text-3xl font-bold mt-1 ${isDark ? 'text-yellow-300' : 'text-yellow-600'}`}>
                      {stats.pendingIncidents}
                    </p>
                  </div>
                  <Clock className={`${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} size={32} />
                </div>
              </div>

              <div className={`p-6 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>In Progress</p>
                    <p className={`text-3xl font-bold mt-1 ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
                      {stats.inProgressIncidents}
                    </p>
                  </div>
                  <AlertCircle className={`${isDark ? 'text-blue-400' : 'text-blue-600'}`} size={32} />
                </div>
              </div>

              <div className={`p-6 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Resolved</p>
                    <p className={`text-3xl font-bold mt-1 ${isDark ? 'text-green-300' : 'text-green-600'}`}>
                      {stats.resolvedIncidents}
                    </p>
                  </div>
                  <CheckCircle className={`${isDark ? 'text-green-400' : 'text-green-600'}`} size={32} />
                </div>
              </div>
            </div>
          </>
        )}

        {currentTab === 'incidents' && (
          <>
            {/* Filters */}
            <div className={`mb-6 p-4 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
              <div className="space-y-3">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Status Filter
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {['all', 'pending', 'in_progress', 'resolved'].map((status) => (
                      <button
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          filterStatus === status
                            ? isDark
                              ? 'bg-purple-600 text-white'
                              : 'bg-purple-600 text-white'
                            : isDark
                            ? 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Department Filter
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setFilterDepartment('all')}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        filterDepartment === 'all'
                          ? isDark
                            ? 'bg-purple-600 text-white'
                            : 'bg-purple-600 text-white'
                          : isDark
                          ? 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      All Departments
                    </button>
                    {departments.map((dept) => (
                      <button
                        key={dept}
                        onClick={() => setFilterDepartment(dept)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          filterDepartment === dept
                            ? isDark
                              ? 'bg-purple-600 text-white'
                              : 'bg-purple-600 text-white'
                            : isDark
                            ? 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Incidents List */}
            <div className={`rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg overflow-hidden`}>
              <div className="p-6">
                <h2 className={`text-xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  All System Incidents ({filteredIncidents.length})
                </h2>

                {filteredIncidents.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertTriangle className={`mx-auto mb-4 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} size={48} />
                    <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      No incidents found
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto hide-scrollbar">
                    {filteredIncidents.map((incident) => (
                      <div
                        key={incident.id}
                        className={`p-4 rounded-lg border ${
                          isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className={`font-bold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {incident.title}
                            </h3>
                            <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                              {incident.description}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getSeverityColor(incident.severity)}`}>
                              {incident.severity}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(incident.status)}`}>
                              {incident.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>

                        <div className={`flex items-center gap-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                          <span className="flex items-center gap-1">
                            <MapPin size={14} />
                            {incident.location}
                          </span>
                          <span className="flex items-center gap-1">
                            <Building2 size={14} />
                            {incident.department}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={14} />
                            {new Date(incident.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {currentTab === 'admins' && <AdminList />}

        {currentTab === 'analytics' && (
          <div className={`p-12 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg text-center`}>
            <BarChart3 className={`mx-auto mb-4 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} size={64} />
            <h3 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Analytics Dashboard
            </h3>
            <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Advanced analytics and reporting features coming soon
            </p>
          </div>
        )}
      </div>
    </div>
  );
}