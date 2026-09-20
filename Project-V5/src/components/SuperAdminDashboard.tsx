import { useState, useEffect } from 'react';
import { useTheme } from '../App';
import { supabase } from './supabaseClient';
import { AlertTriangle, CheckCircle, Clock, MapPin, Mail, Building2, LogOut, Sun, Moon, TrendingUp, Users, AlertCircle, UserPlus, Activity, BarChart3, ZoomIn, ZoomOut, X, ShieldCheck } from 'lucide-react';
import { AdminList } from './AdminList';
import { toast } from 'sonner';
import { ASSETS } from '../config/assets';
import { isMobileOrTablet } from '../utils/deviceDetection';
import { BlurredVideoLoader } from './ui/blurred-video-loader';
import {
  loadCachedOrFresh,
  sanitizeCacheKeyPart,
} from '../utils/browserCache';

interface SuperAdminDashboardProps {
  onLogout: () => void;
}

type TabView = 'overview' | 'incidents' | 'admins' | 'analytics';

const SUPER_ADMIN_CACHE_PREFIX = 'smart_connect_super_admin';

interface SuperAdminCacheData {
  superAdminProfile: any | null;
  incidents: IncidentReport[];
  departments: string[];
  stats: {
    totalIncidents: number;
    pendingIncidents: number;
    inProgressIncidents: number;
    resolvedIncidents: number;
    totalAdmins: number;
    totalUsers: number;
  };
  incidentDataNotice: string | null;
}

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
  user_name: string;
  photo_url?: string | null;
  lat?: number | null;
  lng?: number | null;
  ai_interpretation?: string | null;
}

const normalizeStatus = (status?: string | null) => (status || 'pending').toLowerCase().replace(/_/g, '-');

const normalizeDepartment = (department?: string | null) => {
  const value = department?.trim();
  return value && value.length > 0 ? value : 'General';
};

const inferDepartmentFromIncidentType = (incidentType?: string | null) => {
  const type = incidentType?.trim().toLowerCase() || '';

  if (type.includes('fire')) return 'Fire Department';
  if (type.includes('accident')) return 'Traffic Police';
  if (type.includes('flood') || type.includes('water') || type.includes('leak')) return 'Water Management';
  if (type.includes('landslide')) return 'Disaster Management';
  if (type.includes('garbage') || type.includes('waste')) return 'Sanitation Department';
  if (type.includes('pothole') || type.includes('road')) return 'Roads & Infrastructure';

  return 'Municipal Authority';
};

const getIncidentDepartment = (incident: any) =>
  normalizeDepartment(
    incident.department_name ?? incident.department ?? inferDepartmentFromIncidentType(incident.incident_type)
  );

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
  const [tabLoading, setTabLoading] = useState(false);
  const [stats, setStats] = useState({
    totalIncidents: 0,
    pendingIncidents: 0,
    inProgressIncidents: 0,
    resolvedIncidents: 0,
    totalAdmins: 0,
    totalUsers: 0,
  });
  const [departments, setDepartments] = useState<string[]>([]);
  const [incidentDataNotice, setIncidentDataNotice] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const isMobile = isMobileOrTablet();

  const formatDisplayDate = (value: string) =>
    new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  useEffect(() => {
    loadSuperAdminData();
  }, []);

  useEffect(() => {
    filterIncidents();
  }, [filterStatus, filterDepartment, incidents]);

  useEffect(() => {
    if (loading) return;

    setTabLoading(true);
    const timeoutId = window.setTimeout(() => {
      setTabLoading(false);
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [currentTab, loading]);

  const filterIncidents = () => {
    let filtered = incidents;

    if (filterStatus !== 'all') {
      const normalizedFilterStatus = normalizeStatus(filterStatus);
      filtered = filtered.filter((inc) => normalizeStatus(inc.status) === normalizedFilterStatus);
    }

    if (filterDepartment !== 'all') {
      filtered = filtered.filter(
        (inc) => normalizeDepartment(inc.department) === normalizeDepartment(filterDepartment)
      );
    }

    setFilteredIncidents(filtered);
  };

  const getSuperAdminCacheKeys = (user: any) => {
    const suffix = sanitizeCacheKeyPart(`${user.role}_${user.id}`);
    return {
      cookieKey: `${SUPER_ADMIN_CACHE_PREFIX}_meta_${suffix}`,
      storageKey: `${SUPER_ADMIN_CACHE_PREFIX}_data_${suffix}`,
    };
  };

  const applySuperAdminSnapshot = (snapshot: SuperAdminCacheData) => {
    setSuperAdminData(snapshot.superAdminProfile);
    setIncidents(snapshot.incidents);
    setFilteredIncidents(snapshot.incidents);
    setDepartments(snapshot.departments);
    setStats(snapshot.stats);
    setIncidentDataNotice(snapshot.incidentDataNotice);
  };

  // Deterministic signature of the whole super-admin dataset so the cheap
  // "did anything change?" check matches what was actually shown/cached.
  const buildSuperAdminSignature = (rows: any[], totalAdmins: number, totalUsers: number) =>
    [
      `admins:${totalAdmins}`,
      `users:${totalUsers}`,
      ...rows.map((report: any) =>
        [
          report.report_id,
          report.status,
          report.severity,
          report.timestamp,
          report.ai_interpretation || '',
        ].join(':')
      ),
    ].join('|');

  // Cheap database call: only asks whether anything changed.
  const getSuperAdminSignature = async () => {
    const { data: viewRows, error: viewError } = await supabase
      .from('incident_reports_view')
      .select('report_id,status,severity,timestamp,ai_interpretation')
      .order('timestamp', { ascending: false })
      .order('report_id', { ascending: false });

    if (viewError) throw viewError;

    // Mirror the full loader's view → table fallback so the signature matches
    // the incidents actually shown.
    let rows = viewRows || [];
    if (rows.length === 0) {
      const { data: tableRows, error: tableError } = await supabase
        .from('incident_reports')
        .select('report_id,status,severity,timestamp,ai_interpretation')
        .order('timestamp', { ascending: false })
        .order('report_id', { ascending: false });

      if (tableError) throw tableError;
      rows = tableRows || [];
    }

    const { count: adminCount, error: adminError } = await supabase
      .from('admins')
      .select('a_id', { count: 'exact', head: true });
    if (adminError) throw adminError;

    const { count: userCount, error: userError } = await supabase
      .from('users')
      .select('u_id', { count: 'exact', head: true });
    if (userError) throw userError;

    return buildSuperAdminSignature(rows, adminCount || 0, userCount || 0);
  };

  // Full database call: loads everything, applies it to the component and
  // returns the snapshot + signature so the caller can store it.
  const fetchSuperAdminSnapshot = async (user: any) => {
      // Fetch actual super admin data from the database
      const { data: superAdminData, error: superAdminError } = await supabase
        .from('super_admins')
        .select('*')
        .eq('sa_id', user.id)
        .single();

      if (superAdminError) {
        console.error('Error fetching super admin data:', superAdminError);
        toast.error('Failed to load super admin profile');
        return null;
      }

      if (!superAdminData) {
        toast.error('Super admin profile not found');
        return null;
      }

      setSuperAdminData(superAdminData);

      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('a_id, station, department_name');

      if (adminError) throw adminError;

      const adminDepartmentMap = new Map(
        (adminData || []).map((admin: any) => [
          admin.a_id,
          {
            departmentName: normalizeDepartment(admin.department_name),
            station: normalizeDepartment(admin.station),
          },
        ])
      );

      const mapIncidents = (rows: any[] | null | undefined, source: 'view' | 'table') =>
        (rows || []).map((inc: any) => {
          const adminInfo = adminDepartmentMap.get(inc.a_id);
          const department = normalizeDepartment(
            inc.department_name ??
            adminInfo?.departmentName ??
            inc.department ??
            inferDepartmentFromIncidentType(inc.incident_type)
          );

          return {
            id: inc.report_id,
            title: inc.incident_type || 'Unknown Incident',
            description: inc.incident_description || 'No description provided.',
            severity: inc.severity || 'low',
            status: normalizeStatus(inc.status),
            location:
              source === 'view'
                ? inc.location || 'Unknown Location'
                : adminInfo?.station || 'Location available in admin view only',
            department,
            created_at: inc.timestamp || new Date().toISOString(),
            user_id: inc.user_id,
            user_name: inc.user_name || 'Anonymous',
            photo_url: inc.photo_url || null,
            lat: source === 'view' && typeof inc.lat === 'number' ? inc.lat : null,
            lng: source === 'view' && typeof inc.lng === 'number' ? inc.lng : null,
            ai_interpretation: inc.ai_interpretation || null,
          };
        });

      // Fetch enriched incident rows so we can show routed department, image, and coordinates.
      const { data: incidentViewData, error: incidentError } = await supabase
        .from('incident_reports_view')
        .select('*')
        .order('timestamp', { ascending: false })
        .order('report_id', { ascending: false });

      if (incidentError) throw incidentError;

      let dataSource: 'view' | 'table' = 'view';
      let rawIncidentRows = incidentViewData || [];
      let mappedIncidents = mapIncidents(rawIncidentRows, 'view');

      if (mappedIncidents.length === 0) {
        console.warn('incident_reports_view returned no rows for super admin, trying base incident_reports fallback.');

        const { data: incidentTableData, error: incidentTableError } = await supabase
          .from('incident_reports')
          .select('report_id, incident_type, incident_description, severity, status, timestamp, user_id, photo_url, a_id, ai_interpretation')
          .order('timestamp', { ascending: false })
          .order('report_id', { ascending: false });

        if (incidentTableError) {
          console.error('Fallback incident_reports query failed:', incidentTableError);
        } else {
          dataSource = 'table';
          rawIncidentRows = incidentTableData || [];
          mappedIncidents = mapIncidents(rawIncidentRows, 'table');
        }
      }

      const userIds = [...new Set(mappedIncidents.map((incident) => incident.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('u_id, u_name')
          .in('u_id', userIds);

        if (usersError) {
          console.error('Error fetching user names for super admin incidents:', usersError);
        } else {
          const userMap = new Map((usersData || []).map((user: any) => [user.u_id, user.u_name]));
          mappedIncidents = mappedIncidents.map((incident) => ({
            ...incident,
            user_name: userMap.get(incident.user_id) || incident.user_name,
          }));
        }
      }

      setIncidents(mappedIncidents);
      setFilteredIncidents(mappedIncidents);

      const incidentDepartments = mappedIncidents.map((i: any) => normalizeDepartment(i.department));
      const adminStations = (adminData || [])
        .map((admin: any) => normalizeDepartment(admin.department_name))
        .filter(Boolean);

      const uniqueDepts = [...new Set([...incidentDepartments, ...adminStations])];
      setDepartments(uniqueDepts as string[]);

      // Fetch user count from users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('u_id');

      if (userError) throw userError;

      // Calculate stats from incident_reports table
      const totalIncidents = mappedIncidents.length;
      const pendingIncidents = mappedIncidents.filter((i: any) => normalizeStatus(i.status) === 'pending').length;
      const inProgressIncidents = mappedIncidents.filter((i: any) => normalizeStatus(i.status) === 'in-progress').length;
      const resolvedIncidents = mappedIncidents.filter((i: any) => normalizeStatus(i.status) === 'resolved').length;
      const totalAdmins = adminData?.length || 0;
      const totalUsers = userData?.length || 0;

      let incidentDataNotice: string | null = null;
      if (mappedIncidents.length === 0) {
        incidentDataNotice = 'No incidents were returned for the super admin view or the fallback table query. This usually means row-level security is blocking the super admin account, or there are genuinely no reports yet.';
        console.warn('Super admin incidents query returned no rows.', {
          superAdminId: user.id,
          dataSourceTried: dataSource,
          departmentsAvailable: uniqueDepts,
        });
      } else if (dataSource === 'table') {
        console.warn('Super admin incidents are being shown from fallback incident_reports data because incident_reports_view returned no rows.');
      }
      setIncidentDataNotice(incidentDataNotice);

      const stats = {
        totalIncidents,
        pendingIncidents,
        inProgressIncidents,
        resolvedIncidents,
        totalAdmins,
        totalUsers,
      };
      setStats(stats);

      return {
        data: {
          superAdminProfile: superAdminData,
          incidents: mappedIncidents,
          departments: uniqueDepts as string[],
          stats,
          incidentDataNotice,
        } as SuperAdminCacheData,
        signature: buildSuperAdminSignature(rawIncidentRows, totalAdmins, totalUsers),
      };
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

      const { cookieKey, storageKey } = getSuperAdminCacheKeys(user);

      // Policy implemented by loadCachedOrFresh:
      //  - first visit  → full database load which is then stored in the browser,
      //  - next visits  → show the stored data instantly and, ONLY if the cookie
      //    says more than 2 minutes have passed, ask the database whether
      //    anything changed (reload only if yes).
      await loadCachedOrFresh<SuperAdminCacheData>({
        cookieKey,
        storageKey,
        fetchSignature: () => getSuperAdminSignature(),
        fetchFull: () => fetchSuperAdminSnapshot(user),
        applyData: applySuperAdminSnapshot,
        onFinishedLoading: () => setLoading(false),
        logLabel: 'SuperAdmin',
      });
    } catch (error: any) {
      console.error('Error loading super admin data:', error);
      toast.error('Failed to load super admin dashboard');
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
    switch (normalizeStatus(status)) {
      case 'pending':
        return isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800';
      case 'in-progress':
        return isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800';
      case 'resolved':
        return isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800';
      default:
        return isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800';
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

  if (loading) {
    return (
      <BlurredVideoLoader
        label="Loading Super Admin Dashboard..."
        containerClassName={`min-h-screen flex items-center justify-center ${
          isDark ? 'bg-slate-900' : 'bg-gray-50'
        }`}
        cardClassName="flex flex-col items-center gap-3"
        textClassName={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
      />
    );
  }

  return (
  <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
    {/* Header */}
    <header className={`sticky top-0 z-50 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-lg'} border-b`}>
      <div className={`${isMobile ? "px-3 py-3 w-full" : "max-w-7xl item-center justify-center mx-auto px-4 py-4"}`}>
        <div className="flex items-center justify-between">
          <div className={`flex items-center ${isMobile ? "gap-2" : "gap-3"}`}>
            <img src={ASSETS.Shield} alt="Shield Icon" className={`inline-flex ${isMobile ? "w-9" : "w-14"}`} />
            <div>
              <h1 className={` ${isMobile ? "text-base" : "text-xl"} font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Super Admin Dashboard
              </h1>
              <p className={` ${isMobile ? "text-xs" : "block text-sm"} ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                System-wide Management
              </p>
            </div>
          </div>

          <div className={`flex items-center ${isMobile ? "gap-1" : "gap-2"} `}>
            <button
              onClick={toggleTheme}
              className={`${isMobile ? "p-1.5" : "p-2"} rounded-lg ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
            >
              {isDark ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
            </button>
            <button
              onClick={onLogout}
              className={`flex items-center ${isMobile ? "gap-1 px-2 py-1.5" : "gap-2 px-4 py-2" } rounded-lg ${
                isDark ? 'bg-red-900 text-red-200 hover:bg-red-800' : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              <LogOut size={18} className={`${isMobile ? "sm:w-[18px] sm:h-[18px]" : "" }`} />
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>

    <div className={`w-full ${isMobile ? "px-3 py-4 mobile-bottom-content" : "max-w-7xl item-center justify-center mx-auto px-4 py-6"}`}>
      {/* Super Admin Info Card */}
      <div className={`${isMobile ? "mb-4 p-4" : "mb-6 p-6"} rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
        <div className={`flex items-center ${isMobile ? "gap-3" : "gap-4"}`}>
          <div className={`${isMobile ? "w-12 h-12 text-xl" : "w-16 h-16 text-2xl"} rounded-full flex items-center justify-center font-bold ${
            isDark ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-700'
          }`}>
            {superAdminData?.sa_name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={`${isMobile ? "text-lg" : "text-xl"} font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {superAdminData?.sa_name}
            </h2>
            <div className={`flex flex-row ${isMobile ? "gap-3 mt-1 text-xs" : "items-center gap-4 mt-2 text-sm"} ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              <span className="flex items-center gap-1 sm:truncate">
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
      <div className={` ${isMobile ? "mobile-bottom-panel p-1.5" : "mb-6 p-2"} rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
        <div className={`flex rounded-xl ${isMobile ? "gap-1 overflow-x-auto items-center justify-between hide-scrollbar pb-1 md\:text-2xl" : "gap-2"}`}>
          {[
            { id: 'overview', label: 'Overview', icon: TrendingUp },
            { id: 'incidents', label: 'All Incidents', icon: AlertTriangle },
            { id: 'admins', label: 'Admin Management', icon: Users },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id as TabView)}
              className={`flex items-center ${isMobile ? "gap-1 px-2 py-1.5 whitespace-nowrap text-xs flex-shrink-0 min-w-max" : "gap-2 px-4 py-3 flex-1 justify-center"} rounded-lg font-medium transition-colors ${
                currentTab === tab.id
                  ? isDark
                    ? 'bg-purple-600 text-white'
                    : 'bg-purple-600 text-white'
                  : isDark
                  ? 'text-gray-300 hover:bg-slate-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {tabLoading ? (
        <div className={`rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
          <BlurredVideoLoader
            label={`Loading ${currentTab === 'incidents' ? 'all incidents' : currentTab}...`}
            containerClassName="flex min-h-[320px] items-center justify-center rounded-xl p-8"
            cardClassName="flex flex-col items-center gap-3"
            textClassName={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
          />
        </div>
      ) : currentTab === 'overview' && (
        <>
          {/* Stats Grid */}
          <div className={`gap-4 ${isMobile ? "grid grid-cols-1 mb-3 text-xs" : "grid sm:grid-cols-3 mb-6 text-sm"}`}>
            <div className={`${isMobile ? "w-full p-4" : "p-6"} rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
              <div className={`flex items-center justify-between rounded-xl ${isMobile ? "gap-2" : ""}`}>
                <div>
                  <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Incidents</p>
                  <p className={`text-3xl font-bold mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {stats.totalIncidents}
                  </p>
                </div>
                <Activity className={`${isDark ? 'text-blue-400' : 'text-blue-600'}`} size={32} />
              </div>
            </div>

            <div className={`${isMobile ? "w-full p-4" : "p-6"} rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
              <div className={`flex items-center justify-between ${isMobile ? "gap-2" : ""}`}>
                <div>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Admins</p>
                  <p className={`text-3xl font-bold mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {stats.totalAdmins}
                  </p>
                </div>
                <Users className={`${isDark ? 'text-purple-400' : 'text-purple-600'}`} size={32} />
              </div>
            </div>

            <div className={`${isMobile ? "w-full p-4" : "p-6"} rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
              <div className={`flex items-center justify-between ${isMobile ? "gap-2" : ""}`}>
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
          <div className={`grid ${isMobile ? "grid-cols-1" : "sm:grid-cols-3"} gap-4`}>
            <div className={`${isMobile ? "w-full p-4" : "p-6"} rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
              <div className={`flex items-center justify-between ${isMobile ? "gap-2" : ""}`}>
                <div>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Pending</p>
                  <p className={`text-3xl font-bold mt-1 ${isDark ? 'text-yellow-300' : 'text-yellow-600'}`}>
                    {stats.pendingIncidents}
                  </p>
                </div>
                <Clock className={`${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} size={32} />
              </div>
            </div>

            <div className={`${isMobile ? "w-full p-4" : "p-6"} rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
              <div className={`flex items-center justify-between ${isMobile ? "gap-2" : ""}`}>
                <div>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>In Progress</p>
                  <p className={`text-3xl font-bold mt-1 ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
                    {stats.inProgressIncidents}
                  </p>
                </div>
                <AlertCircle className={`${isDark ? 'text-blue-400' : 'text-blue-600'}`} size={32} />
              </div>
            </div>

            <div className={`${isMobile ? "w-full p-4" : "p-6"} rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
              <div className={`flex items-center justify-between ${isMobile ? "gap-2" : ""}`}>
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
          {incidentDataNotice && (
            <div className={`mb-4 rounded-xl border p-4 ${
              isDark ? 'border-yellow-700 bg-yellow-900/20 text-yellow-100' : 'border-yellow-200 bg-yellow-50 text-yellow-900'
            }`}>
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 shrink-0" size={18} />
                <div>
                  <p className="font-semibold">Incident data needs attention</p>
                  <p className="mt-1 text-sm">{incidentDataNotice}</p>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className={`${isMobile ? "mb-4 p-3" : "mb-6 p-4"} rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
            <div className="space-y-3">
              <div>
                <label className={`block ${isMobile ? "text-xs" : "text-sm"} font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Status Filter
                </label>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'pending', 'in-progress', 'resolved'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setFilterStatus(status)}
                      className={`${isMobile ? "px-3 py-1.5" : "px-4 py-2"} rounded-lg font-medium transition-colors ${
                        filterStatus === status
                          ? isDark
                            ? 'bg-purple-600 text-white'
                            : 'bg-purple-600 text-white'
                          : isDark
                          ? 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={`block ${isMobile ? "text-xs" : "text-sm"} font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Department Filter
                </label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setFilterDepartment('all')}
                    className={`${isMobile ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg font-medium transition-colors ${
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
                      className={`${isMobile ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg font-medium transition-colors ${
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
          <div className={`h-full flex flex-col ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
            <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
              <div className="mb-4 md:mb-6">
                <h2 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-900'}`}>
                  All System Incidents
                </h2>
                <p className={`text-xs md:text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {filteredIncidents.length} reports matching the selected filters
                </p>
              </div>

              <div className="flex-1 overflow-y-auto pb-20 md:pb-6 hide-scrollbar">
                {filteredIncidents.length === 0 ? (
                  <div className={`text-center py-20 md:py-32 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <CheckCircle className={`mx-auto mb-3 w-12 h-12 md:w-16 md:h-16 ${isDark ? 'text-green-400 opacity-50' : 'text-green-800'}`} />
                    <p className="text-base md:text-lg font-medium">
                      {incidents.length === 0 ? 'No incidents were returned for the dashboard' : 'No incidents found for this filter'}
                    </p>
                    <p className="text-xs md:text-sm mt-1">
                      {incidents.length === 0
                        ? 'Check the super admin access policies or the incident_reports_view contents.'
                        : 'Try another status or department'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
                    {filteredIncidents.map((incident) => (
                      <div
                        key={incident.id}
                        className={`p-4 md:p-5 rounded-xl border transition-all hover:shadow-xl ${
                          isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-blue-500 hover:border-blue-200'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-3 md:mb-4">
                          <span className={`px-2.5 md:px-3 py-1 md:py-1.5 rounded-md text-xs uppercase font-bold ${
                            incident.severity === 'critical'
                              ? 'bg-red-100 text-red-800'
                              : incident.severity === 'high'
                              ? 'bg-orange-100 text-orange-800'
                              : incident.severity === 'medium'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {incident.severity}
                          </span>
                          <span className={`text-xs flex items-center gap-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <Clock size={12} className="md:w-3.5 md:h-3.5" />
                            {formatDisplayDate(incident.created_at)}
                          </span>
                        </div>

                        {incident.photo_url && (
                          <div
                            className={`mb-3 md:mb-4 rounded-lg overflow-hidden cursor-pointer relative group ${isDark ? '' : 'border border-blue-500'}`}
                            onClick={() => openFullscreenImage(incident.photo_url!)}
                          >
                            <img
                              src={incident.photo_url}
                              alt={`${incident.title} evidence`}
                              className={`w-full h-48 md:h-52 object-contain bg-gray-100 bg-slate-200 dark:bg-slate-700 transition-transform ${isMobile ? "opacity-50" : ""}`}
                            />
                            <div className={`absolute inset-0 flex flex-col items-center justify-center ${isMobile ? "bg-slate-700/50" : "opacity-0 group-hover:opacity-100 transition-opacity bg-slate-500 duration-300"}`}>
                              <ZoomIn className="text-white mb-2" size={32} />
                              <p className="text-white text-sm font-medium">Click to view image</p>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 mb-3 md:mb-4">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className={`font-semibold text-sm md:text-base ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                              {incident.title}
                            </h3>
                            <span className={`${getStatusColor(incident.status)} px-2.5 py-1 rounded-md text-[11px] uppercase font-bold whitespace-nowrap`}>
                              {normalizeStatus(incident.status).replace('-', ' ')}
                            </span>
                          </div>

                          <p className={`text-xs md:text-sm leading-relaxed line-clamp-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {incident.description}
                          </p>

                          {/* AI Interpretation Display */}
                          {incident.ai_interpretation && (
                            <div className={`mt-2 p-2 rounded-lg text-xs ${
                              incident.ai_interpretation.includes('Potentially Real')
                                ? isDark ? 'bg-green-900/30 border border-green-700' : 'bg-green-50 border border-green-200'
                                : incident.ai_interpretation.includes('Potentially Fake')
                                ? isDark ? 'bg-red-900/30 border border-red-700' : 'bg-red-50 border border-red-200'
                                : isDark ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-yellow-50 border border-yellow-200'
                            }`}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`font-semibold ${
                                  incident.ai_interpretation.includes('Potentially Real') ? 'text-green-600'
                                  : incident.ai_interpretation.includes('Potentially Fake') ? 'text-red-600'
                                  : 'text-yellow-600'
                                }`}>
                                  {incident.ai_interpretation.includes('Potentially Real') && '✓ Potentially Real'}
                                  {incident.ai_interpretation.includes('Potentially Fake') && '✗ Potentially Fake'}
                                  {!incident.ai_interpretation.includes('Potentially Real') && !incident.ai_interpretation.includes('Potentially Fake') && '🤖 AI Interpretation'}
                                </span>
                              </div>
                              <p className={`text-xs ${
                                incident.ai_interpretation.includes('Potentially Real') ? 'text-green-600'
                                : incident.ai_interpretation.includes('Potentially Fake') ? 'text-red-600'
                                : 'text-yellow-600'
                              }`}>
                                {incident.ai_interpretation}
                              </p>
                            </div>
                          )}

                          <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <Building2 size={14} />
                            <span>{incident.department}</span>
                          </div>

                          <div
                            className={`flex items-center gap-1.5 text-xs ${incident.lat && incident.lng ? 'cursor-pointer' : ''} ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
                            onClick={() => incident.lat && incident.lng && window.open(`https://www.google.com/maps/place/${incident.lat},${incident.lng}/@${incident.lat},${incident.lng},208m/data=!3m1!1e3`, "_blank")}
                          >
                            <MapPin size={14} />
                            <span>{incident.lat && incident.lng ? `${incident.lat.toFixed(4)}, ${incident.lng.toFixed(4)}` : incident.location}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
    {fullscreenImage && (
      <div
        className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeFullscreenImage();
        }}
      >
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

          <button
            className="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2.5 shadow-lg transition-all"
            onClick={closeFullscreenImage}
          >
            <X size={20} className="text-gray-800" />
          </button>

          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-3 bg-white/90 rounded-full px-4 py-3 shadow-2xl">
            <button
              className="p-2 hover:bg-gray-200 rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setImageZoom((prev) => Math.max(prev - 0.25, 0.5))}
              disabled={imageZoom <= 0.5}
            >
              <ZoomOut size={20} className="text-gray-700" />
            </button>

            <span className="text-xs font-semibold text-gray-700 min-w-[50px] text-center">
              {Math.round(imageZoom * 100)}%
            </span>

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
