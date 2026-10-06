import { useState, useEffect, useRef } from "react";
import { MapPin, Filter, Search, X, ShieldCheck, ZoomIn, ZoomOut, User, Calendar } from "lucide-react";
import { useTheme } from "../App";
import { OpenLayersMap } from "./OpenLayersMap";
import { isMobileOrTablet } from "../utils/deviceDetection";
import { BlurredVideoLoader } from "./ui/blurred-video-loader";

/* 🔹 ADDED */
import { supabase } from "./supabaseClient";
import { toast } from "sonner";
import { parseAiVerdict, parseAiConfidence, parseAiPredictedLabel, matchesIncidentType, AiVerdict } from "../utils/aiReview";
import { canDepartmentViewIncident, getAdminScopedDepartment, getDepartmentsForIncidentType, getTransferableDepartments, DEPARTMENT_CANONICAL_INCIDENT_TYPE } from "../config/departments";
import { readCurrentUserRaw } from "../utils/authStorage";

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
  photo?: string | null;
  aiVerified: boolean;
  aiConfidence?: number;
  aiReason?: string;
  aiVerdict?: AiVerdict;
  departmentNotified: string;
  /** Display name of the user who filed the report (users.u_name). */
  reporterName?: string | null;
}

interface MapViewProps {
  onNavigateHome: () => void;
  urgentCount?: number;
}

const MAP_CACHE_TTL_MS = 2 * 60 * 1000;
const MAP_CACHE_COOKIE_PREFIX = "smart_connect_map_cache_meta";
const MAP_CACHE_STORAGE_PREFIX = "smart_connect_map_cache_data";

interface MapCacheMetadata {
  updatedAt: number;
  signature: string;
  storageKey: string;
}

const getStoredCurrentUser = () => {
  if (typeof window === "undefined") return null;

  try {
    const userStr = readCurrentUserRaw();
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

const getCookieValue = (name: string) => {
  if (typeof document === "undefined") return null;

  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.split("=")[1]) : null;
};

const setCookieValue = (name: string, value: string) => {
  if (typeof document === "undefined") return;

  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=86400; SameSite=Lax`;
};

const sanitizeCacheKeyPart = (value: string) => value.replace(/[^a-z0-9_-]/gi, "_");

export function MapView({
  onNavigateHome,
  urgentCount,
}: MapViewProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveIncidentCount, setLiveIncidentCount] = useState(0);
  
  // Get current user from localStorage
  const [currentUser, setCurrentUser] = useState<any>(() => getStoredCurrentUser());
  
  // Use ref to always get current issues in event handlers
  const issuesRef = useRef<Issue[]>([]);
  issuesRef.current = issues;

  // State for filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] =  useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const isMobileTablet = isMobileOrTablet();
  
  // Check if user is admin or super_admin
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

  // A departmental officer (admin) only sees incidents that belong to their own
  // department. Super admins resolve to null -> every incident is visible.
  const scopedDepartment = getAdminScopedDepartment(currentUser);
  
  // Admin filter state
  const [adminFilter, setAdminFilter] = useState<'pending' | 'in-progress' | 'rejected'>('pending');

  // Department transfer state (only used by the gated transfer control below)
  const [transferDepartment, setTransferDepartment] = useState<string>('');
  const [transferring, setTransferring] = useState(false);

  // Get user on mount
  useEffect(() => {
    setCurrentUser(getStoredCurrentUser());
  }, []);

  // A new card always starts with a clean department selection.
  useEffect(() => {
    setTransferDepartment('');
  }, [selectedIssue?.id]);

  // Handle reject action
  const handleReject = async (reportId: string) => {
    const { error } = await supabase
      .from('incident_reports')
      .update({ status: 'rejected' })
      .eq('report_id', reportId);
    
    if (error) {
      toast.error("Failed to reject report");
    } else {
      toast.success("Report rejected");
      fetchIssues();
      setSelectedIssue(null);
    }
  };
  
  // Handle verify and dispatch action
  const handleVerify = async (reportId: string) => {
    const { error } = await supabase
      .from('incident_reports')
      .update({ status: 'resolved' })
      .eq('report_id', reportId);
    
    if (error) {
      toast.error("Failed to verify report");
    } else {
      toast.success("Report verified and resolved");
      fetchIssues();
      setSelectedIssue(null);
    }
  };

  // Handle transfer to a different department.
  //
  // Department membership in this app is derived from `incident_type` (there is
  // no stored department column), so a transfer re-categorises the incident
  // type to one that routes to the chosen department:
  //   - prefer the AI model's predicted label when it already belongs to the
  //     target department (the transfer control only appears on AI-mismatch,
  //     so this is the common case and it keeps the detection the model saw),
  //   - otherwise fall back to the department's canonical incident type.
  const handleTransfer = async (
    reportId: string,
    department: string,
    predictedLabel: string | null,
  ) => {
    if (!department || transferring) return;
    setTransferring(true);

    try {
      const predictedType = predictedLabel
        ? predictedLabel.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : '';
      const predictedRoutesToDepartment =
        predictedType &&
        getDepartmentsForIncidentType(predictedType).includes(department);

      const nextType = predictedRoutesToDepartment
        ? predictedType
        : DEPARTMENT_CANONICAL_INCIDENT_TYPE[department] || predictedType;

      if (!nextType) {
        throw new Error(`No incident type is mapped to ${department}.`);
      }

      const { error } = await supabase
        .from('incident_reports')
        .update({ incident_type: nextType })
        .eq('report_id', reportId);

      if (error) throw new Error(error.message);

      toast.success(`Report transferred to ${department}`);
      setTransferDepartment('');
      await fetchIssues();
      setSelectedIssue(null);
    } catch (err: any) {
      console.error('Transfer failed:', err);
      toast.error(`Failed to transfer report: ${err?.message || 'unknown error'}`);
    } finally {
      setTransferring(false);
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

  const getDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const groupNearbyIssues = (issues: Issue[]) => {
  const grouped: any[] = [];

  issues.forEach((issue) => {
    let found = false;

    for (let group of grouped) {
      const distance = getDistance(
        issue.lat,
        issue.lng,
        group.lat,
        group.lng
      );

      if (
        distance <= 30 &&
        issue.type.toLowerCase() === group.type.toLowerCase()
      ) {
        group.reportCount += 1;
        group.ids.push(issue.id);   // 🔹 ADD THIS
        found = true;
        break;
      }
    }

    if (!found) {
      grouped.push({
        ...issue,
        reportCount: 1,
        ids: [issue.id],   // 🔹 ADD THIS
      });
    }
  });

  return grouped;
};

  const getMapCacheKeys = () => {
    const role = currentUser?.role || "user";
    const filter = isAdmin ? adminFilter : "all";
    const suffix = sanitizeCacheKeyPart(`${role}_${filter}`);

    return {
      cookieKey: `${MAP_CACHE_COOKIE_PREFIX}_${suffix}`,
      storageKey: `${MAP_CACHE_STORAGE_PREFIX}_${suffix}`,
    };
  };

  const getCachedIssues = () => {
    if (typeof window === "undefined") return null;

    const { cookieKey, storageKey } = getMapCacheKeys();
    const metadataValue = getCookieValue(cookieKey);
    const dataValue = localStorage.getItem(storageKey);

    if (!metadataValue || !dataValue) return null;

    try {
      const metadata = JSON.parse(metadataValue) as MapCacheMetadata;
      const cachedIssues = JSON.parse(dataValue) as Issue[];

      if (!Array.isArray(cachedIssues) || metadata.storageKey !== storageKey) {
        return null;
      }

      // Entries written before reporter names existed would keep rendering
      // "Unknown User" forever (the refresh signature never changes for them),
      // so treat them as a miss and refetch once.
      const missingReporterName = cachedIssues.some(
        (issue) => !Object.prototype.hasOwnProperty.call(issue, "reporterName"),
      );
      if (missingReporterName) return null;

      return { metadata, issues: cachedIssues };
    } catch {
      return null;
    }
  };

  const cacheIssues = (nextIssues: Issue[], signature: string) => {
    if (typeof window === "undefined") return;

    const { cookieKey, storageKey } = getMapCacheKeys();
    const metadata: MapCacheMetadata = {
      updatedAt: Date.now(),
      signature,
      storageKey,
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(nextIssues));
      setCookieValue(cookieKey, JSON.stringify(metadata));
    } catch (err) {
      console.warn("Failed to cache map incidents", err);
    }
  };

  const applyIssues = (nextIssues: Issue[]) => {
    setLiveIncidentCount(nextIssues.length);
    setIssues(nextIssues);
  };

  const buildIssuesSignature = (nextIssues: Issue[]) =>
    nextIssues
      .map((issue) => [
        issue.id,
        issue.status,
        issue.timestamp,
        issue.severity,
        issue.type,
        issue.aiReason,
      ].join(":"))
      .join("|");

  const getIssuesSignature = async () => {
    let query = supabase
      .from("incident_reports_view")
      .select("report_id,status,timestamp,severity,incident_type,ai_interpretation")
      .order("timestamp", { ascending: false });

    if (isAdmin) {
      query = query.in("status", [adminFilter, "in-progress"]);
    } else {
      query = query.in("status", ["pending", "in-progress"]);
    }

    const { data, error } = await query;

    if (error) throw error;

    const visibleRows = isAdmin
      ? (data || []).filter((report: any) => report.status === adminFilter)
      : data || [];

    // Scope the signature too, so a department change refreshes the cache.
    const scopedRows = visibleRows.filter((report: any) =>
      canDepartmentViewIncident(report.incident_type, scopedDepartment),
    );

    return scopedRows
      .map((report: any) => [
        report.report_id,
        report.status,
        report.timestamp,
        report.severity,
        report.incident_type,
        report.ai_interpretation,
      ].join(":"))
      .join("|");
  };

  /* ======================================================
     🔹 SUPABASE DATA FETCH (REPLACES localStorage ONLY)
     ====================================================== */
  const fetchIssues = async (options: { showLoader?: boolean } = {}) => {
    const { showLoader = true } = options;

    try {
      if (showLoader) {
        setLoading(true);
      }
      
      // For admins, fetch both pending and in-progress
      // For users, only show in-progress
      let query = supabase.from("incident_reports_view").select("*");
      
      if (isAdmin) {
        // Admin sees both pending and in-progress based on filter
        query = query.in("status", [adminFilter, "in-progress"]).order("timestamp", { ascending: false });
      } else {
        // Regular users see both pending and in-progress (for Live Incidents count)
        query = query.in("status", ["pending", "in-progress"]).order("timestamp", { ascending: false });
      }
      
      const { data, error } = await query;

      if (error) throw error;

      // Resolve the reporter's display name for the popup with one batch
      // lookup (same users.u_id -> u_name pattern as CheckReports /
      // SuperAdminDashboard). Failures leave the name unresolved and the UI
      // falls back to "Unknown User".
      const reporterNames = new Map<string, string>();
      const userIds = [
        ...new Set((data || []).map((report: any) => report.user_id).filter(Boolean)),
      ];

      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from("users")
          .select("u_id, u_name")
          .in("u_id", userIds);

        if (usersError) {
          console.warn("Failed to resolve reporter names", usersError);
        } else {
          (usersData || []).forEach((user: any) => {
            if (user?.u_id && user?.u_name) {
              reporterNames.set(user.u_id, user.u_name);
            }
          });
        }
      }

      const mappedIssues: Issue[] = (data || []).map((report: any) => {
        const aiInterpretation = report.ai_interpretation || '';
        const aiVerdict = parseAiVerdict(aiInterpretation);

        return {
          id: report.report_id,
          type: report.incident_type,
          location: `${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}`,
          lat: report.lat,
          lng: report.lng,
          status: report.status,
          severity: report.severity,
          description: report.incident_description,
          timestamp: report.timestamp,
          photo: report.photo_url,
          aiVerified: aiVerdict === 'approved',
          aiConfidence: parseAiConfidence(aiInterpretation),
          aiReason: aiInterpretation,
          aiVerdict,
          departmentNotified: getDepartmentsForIncidentType(report.incident_type).join(" & ") || "Unassigned",
          reporterName: report.user_id
            ? reporterNames.get(report.user_id) ?? null
            : null,
        };
      });

      // For admins, filter by adminFilter after fetching
      let filteredIssues = mappedIssues;
      if (isAdmin) {
        filteredIssues = mappedIssues.filter(issue => issue.status === adminFilter);
      }

      // Departmental officers only ever see their own department's incidents.
      filteredIssues = filteredIssues.filter((issue) =>
        canDepartmentViewIncident(issue.type, scopedDepartment),
      );

      cacheIssues(filteredIssues, buildIssuesSignature(filteredIssues));
      applyIssues(filteredIssues);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load incident data");
    } finally {
      if (showLoader) {
        setLoading(false);   // STOP LOADING
      }
    }
  };

  const loadIssuesFromCacheOrDatabase = async () => {
    const cached = getCachedIssues();

    if (!cached) {
      await fetchIssues();
      return;
    }

    applyIssues(cached.issues);
    setLoading(false);

    if (Date.now() - cached.metadata.updatedAt <= MAP_CACHE_TTL_MS) return;

    try {
      const latestSignature = await getIssuesSignature();

      if (latestSignature !== cached.metadata.signature) {
        await fetchIssues({ showLoader: false });
      } else {
        cacheIssues(cached.issues, latestSignature);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to check for new incident data");
    }
  };

  /* 🔹 ONLY CHANGE INSIDE useEffect */
  useEffect(() => {
    loadIssuesFromCacheOrDatabase();

    const channel = supabase
  .channel("incident-realtime")
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "incident_reports",
      filter: "status=eq.in-progress",
    },
    () => {
      fetchIssues({ showLoader: false });
    }
  )
  .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminFilter, isAdmin]);

  /* ================= ORIGINAL CODE CONTINUES UNTOUCHED ================= */

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical":
        return "bg-red-600 border-red-700";
      case "high":
        return "bg-orange-500 border-orange-600";
      case "medium":
        return "bg-yellow-500 border-yellow-600";
      case "low":
        return "bg-blue-500 border-blue-600";
      default:
        return "bg-gray-500 border-gray-600";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "resolved":
        return "bg-green-100 text-green-800 border-green-200";
      case "in-progress":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // Independent filtering for Type and Severity
  const filteredIssues = issues.filter((issue) => {
    const matchesType =
      filterType === "all" ||
      issue.type.toLowerCase() === filterType.toLowerCase();
    const matchesSeverity =
      filterSeverity === "all" ||
      issue.severity.toLowerCase() ===
        filterSeverity.toLowerCase();
    const matchesSearch =
      searchQuery === "" ||
      issue.location
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      issue.description
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

    return matchesType && matchesSeverity && matchesSearch;
  });

  // Severity Counts for the sidebar
  const severityCounts = {
    critical: issues.filter((i) => i.severity === "critical")
      .length,
    high: issues.filter((i) => i.severity === "high").length,
    medium: issues.filter((i) => i.severity === "medium")
      .length,
    low: issues.filter((i) => i.severity === "low").length,
  };

  /* 🔹 FROM HERE ONWARD:
     EXACTLY YOUR ORIGINAL JSX
     ZERO REMOVALS
     ZERO RE-ORDERING
  */

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {/* LOADER OVERLAY - centered over the whole Live Map tab */}
      {loading && (
        <BlurredVideoLoader
          label="Loading incidents..."
          containerClassName="absolute inset-0 z-40 flex items-center justify-center bg-slate-900"
          cardClassName="flex flex-col items-center gap-3"
          textClassName="z-50 text-sm font-medium text-blue-200"
        />
      )}

      {/* FILTER PANEL */}
      <div
        className={`${showFilters ? "w-64" : "w-0"} transition-all duration-300 overflow-hidden flex-shrink-0 border-r ${
          isDark
            ? "bg-slate-800 border-slate-700"
            : "bg-slate-50 border-gray-200"
        }`}
      >
        <div className="p-4 h-full overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3
              className={`text-sm ${isDark ? "text-gray-100" : "text-gray-900"}`}
            >
              Filters & Legend
            </h3>
            <button
              onClick={() => setShowFilters(false)}
              className={`lg:hidden transition-colors ${isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700"}`}
            >
              <X size={20} />
            </button>
          </div>

          {/* Search */}
          {/* <div className="mb-4">
            <div className="relative">
              <Search
                className={`absolute left-3 top-2.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}
                size={18}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search location..."
                className={`w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                  isDark
                    ? "bg-slate-700 border-slate-600 text-gray-100 placeholder-gray-400"
                    : "bg-white border-gray-300 text-gray-900"
                }`}
              />
            </div>
          </div> */}

          {/* Severity Filter with Colors */}
          <div className="mb-4">
            <label
              className={`block text-xs mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
            >
              Severity Level
            </label>
            <div className="space-y-1">
              <button
                onClick={() => setFilterSeverity("all")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  filterSeverity === "all"
                    ? isDark
                      ? "bg-blue-900 text-blue-200 border border-blue-700"
                      : "bg-blue-50 text-blue-800 border border-blue-200"
                    : isDark
                      ? "bg-slate-700 text-gray-300 hover:bg-slate-600"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                All Severities ({issues.length})
              </button>

              <button
                onClick={() => setFilterSeverity("critical")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  filterSeverity === "critical"
                    ? isDark
                      ? "bg-red-900 text-red-200 border border-red-700"
                      : "bg-red-50 text-red-800 border border-red-200"
                    : isDark
                      ? "bg-slate-700 text-gray-300 hover:bg-slate-600"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-red-600 rounded-full"></span>
                  Critical
                </span>
                <span>{severityCounts.critical}</span>
              </button>

              <button
                onClick={() => setFilterSeverity("high")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  filterSeverity === "high"
                    ? isDark
                      ? "bg-orange-900 text-orange-200 border border-orange-700"
                      : "bg-orange-50 text-orange-800 border border-orange-200"
                    : isDark
                      ? "bg-slate-700 text-gray-300 hover:bg-slate-600"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                  High
                </span>
                <span>{severityCounts.high}</span>
              </button>

              <button
                onClick={() => setFilterSeverity("medium")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  filterSeverity === "medium"
                    ? isDark
                      ? "bg-yellow-900 text-yellow-200 border border-yellow-700"
                      : "bg-yellow-50 text-yellow-800 border border-yellow-200"
                    : isDark
                      ? "bg-slate-700 text-gray-300 hover:bg-slate-600"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                  Medium
                </span>
                <span>{severityCounts.medium}</span>
              </button>

              <button
                onClick={() => setFilterSeverity("low")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  filterSeverity === "low"
                    ? isDark
                      ? "bg-blue-900 text-blue-200 border border-blue-700"
                      : "bg-blue-50 text-blue-800 border border-blue-200"
                    : isDark
                      ? "bg-slate-700 text-gray-300 hover:bg-slate-600"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
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
            <label
              className={`block text-xs mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
            >
              Incident Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                isDark
                  ? "bg-slate-700 border-slate-600 text-gray-100"
                  : "bg-white border-gray-300 text-gray-900"
              }`}
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
            <label
              className={`block text-xs mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
            >
              Status Legend
            </label>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-gray-100 text-gray-800 border border-gray-200 rounded">
                  Pending
                </span>
                <span
                  className={
                    isDark ? "text-gray-400" : "text-gray-600"
                  }
                >
                  Awaiting Review
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 border border-yellow-200 rounded">
                  In Progress
                </span>
                <span
                  className={
                    isDark ? "text-gray-400" : "text-gray-600"
                  }
                >
                  Being Addressed
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-green-100 text-green-800 border border-green-200 rounded">
                  Resolved
                </span>
                <span
                  className={
                    isDark ? "text-gray-400" : "text-gray-600"
                  }
                >
                  Issue Fixed
                </span>
              </div>
            </div>
          </div>

          {/* Clear Filters */}
          {(filterType !== "all" ||
            filterSeverity !== "all" ||
            searchQuery !== "") && (
            <button
              onClick={() => {
                setFilterType("all");
                setFilterSeverity("all");
                setSearchQuery("");
              }}
              className={`w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                isDark
                  ? "bg-slate-700 text-gray-300 hover:bg-slate-600"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* MAP AREA */}
      <div
        className={`flex-1 relative overflow-hidden ${isDark ? "bg-gradient-to-br from-slate-700 to-slate-900" : "bg-gradient-to-br from-slate-100 to-blue-50"}`}
      >
        <div className="absolute inset-0 z-0">
          <OpenLayersMap
            issues={filteredIssues}
            onMarkerClick={(id) => {
              // Use ref to get current issues
              const currentIssues = issuesRef.current;
              const currentFiltered = currentIssues.filter((issue) => {
                const matchesType =
                  filterType === "all" ||
                  issue.type.toLowerCase() === filterType.toLowerCase();
                const matchesSeverity =
                  filterSeverity === "all" ||
                  issue.severity.toLowerCase() ===
                    filterSeverity.toLowerCase();
                const matchesSearch =
                  searchQuery === "" ||
                  issue.location
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase()) ||
                  issue.description
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase());

                return matchesType && matchesSeverity && matchesSearch;
              });
              
              // console.log("Marker clicked with id:", id, "type:", typeof id);
              // console.log("All issues count:", currentIssues.length);
              // console.log("Filtered issues count:", currentFiltered.length);
              // console.log("Filtered issues sample:", currentFiltered.slice(0, 3).map(i => ({ id: i.id, ids: i.ids })));
              const issue = currentFiltered.find(
                (i: any) => String(i.id) === id || (i.ids && i.ids.some((issueId: any) => String(issueId) === id))
              );
              // console.log("Found issue:", issue);
              
              if (!issue) return;

              setSelectedIssue(issue);
            }}
          />
        </div>

        {/* Admin Filter Buttons - Only show for admins */}
        {isAdmin ? (
          <div className="absolute top-4 left-4 right-4 z-10 flex flex-col items-start gap-2 sm:right-auto sm:flex-row">
            <button
              onClick={() => setAdminFilter('pending')}
              className={`px-3 py-2 rounded-lg border flex items-center gap-2 ${
                adminFilter === 'pending'
                  ? isDark
                    ? "bg-yellow-900 border-yellow-700 text-yellow-200"
                    : "bg-yellow-50 border-yellow-200 text-yellow-800"
                  : isDark
                    ? "bg-slate-800 border-slate-700 text-gray-300"
                    : "bg-white border-gray-300 text-gray-700"
              }`}
            >
              <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
              <span className="text-xs font-medium">Check Reports</span>
            </button>
            <button
              onClick={() => setAdminFilter('in-progress')}
              className={`px-3 py-2 rounded-lg border flex items-center gap-2 ${
                adminFilter === 'in-progress'
                  ? isDark
                    ? "bg-blue-900 border-blue-700 text-blue-200"
                    : "bg-blue-50 border-blue-200 text-blue-800"
                  : isDark
                    ? "bg-slate-800 border-slate-700 text-gray-300"
                    : "bg-white border-gray-300 text-gray-700"
              }`}
            >
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span className="text-xs font-medium">Verified Reports</span>
            </button>
            <button
              onClick={() => setAdminFilter('rejected')}
              className={`px-3 py-2 rounded-lg border flex items-center gap-2 ${
                adminFilter === 'rejected'
                  ? isDark
                    ? "bg-red-900 border-red-700 text-red-200"
                    : "bg-red-50 border-red-200 text-red-800"
                  : isDark
                    ? "bg-slate-800 border-slate-700 text-gray-300"
                    : "bg-white border-gray-300 text-gray-700"
              }`}
            >
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              <span className="text-xs font-medium">AI rejected</span>
            </button>
          </div>
        ) : (
          /* Urgent Indicator - Only show for non-admins */
          <button
            onClick={() => setFilterSeverity("critical")}
            className={`absolute top-4 left-4 z-10`}
          >
            {urgentCount == 0 && (
              <div className={`hidden`}>
                <span className={`hidden`}></span>
                <span className={`hidden`}></span>
              </div>
            )}
            {urgentCount > 0 && (
              <div
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ml-1 ${
                  isDark
                    ? "bg-red-900 border-red-700"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <span className="w-1.5 h-1.5 bg-red-600 rounded-lg animate-pulse"></span>
                <span
                  className={`text-xs ${isDark ? "text-red-300" : "text-red-700"}`}
                >
                  {urgentCount} Urgent
                </span>
              </div>
            )}
          </button>
        )}

        {/* Filter Toggle */}
        {!showFilters && (
          <button
            onClick={() => setShowFilters(true)}
            className={`absolute ${isAdmin ? "top-36 sm:top-15 left-4" : urgentCount && urgentCount > 0 ? "top-4 left-28" : "top-4 left-4"} z-10 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 transition-colors 
            ${isDark ? "bg-slate-800 hover:bg-slate-700 text-gray-200" : "bg-white hover:bg-gray-50 text-gray-700"}
          `}
          >
            <Filter size={16} />
            <span className="text-sm">Filters</span>
          </button>
        )}

        {/* Stats - Hide on mobile/tablet when filters panel is open */}
        {!(isMobileTablet && showFilters) && (
          <div
            className={`absolute top-4 right-14 rounded-lg shadow-lg p-3 z-10 ${
              isDark ? "bg-slate-800" : "bg-white"
            }`}
          >
            <div
              className={`text-xs mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}
            >
              Live Incidents
            </div>
            <div
              className={`text-2xl ${isDark ? "text-gray-100" : "text-gray-900"}`}
            >
              {liveIncidentCount}
            </div>
          </div>
        )}

        {/* Selected Issue Popup */}
        {selectedIssue && (
          <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-xl shadow-2xl max-w-md w-[calc(100%-2rem)] md:w-full z-30 border overflow-hidden ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
          }`}>
            <button
              onClick={() => setSelectedIssue(null)}
              className={`absolute top-3 right-3 rounded-full p-1 z-40 transition-colors ${
                isDark ? 'text-gray-300 hover:text-white bg-slate-700' : 'text-gray-400 hover:text-gray-600 bg-gray-100'
              }`}
            >
              <X size={18} />
            </button>
            {selectedIssue.photo && (
              <div className="relative group cursor-pointer" onClick={() => openFullscreenImage(selectedIssue.photo!)}>
                <img
                  src={selectedIssue.photo}
                  alt="Incident"
                  className="w-full h-48 md:h-52 object-contain bg-gray-100 bg-slate-200 dark:bg-slate-700 transition-transform"
                />
                <div className={`absolute inset-0 flex flex-col items-center justify-center ${isMobileTablet ? "bg-slate-700/50" : "opacity-0 group-hover:opacity-100 transition-opacity bg-slate-500 duration-300"}`}>
                  <ZoomIn className="text-white mb-2" size={32} />
                  <p className="text-white text-sm font-medium">Click to view image</p>
                </div>
              </div>
            )}
            <div className="px-5 pt-4 pb-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className={`text-lg ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    {selectedIssue.type}
                  </h3>
                  <div
                    className={`flex items-center text-sm mt-1 cursor-pointer ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}
                    onClick={() => window.open(`https://www.google.com/maps/place/${selectedIssue.lat},${selectedIssue.lng}/@${selectedIssue.lat},${selectedIssue.lng},208m/data=!3m1!1e3`, "_blank")}
                  >
                    <MapPin size={14} className="mr-1" />
                    {selectedIssue.location}
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs ${getSeverityColor(selectedIssue.severity)} text-white border-2`}
                >
                  {selectedIssue.severity.toUpperCase()}
                </span>
              </div>
              <div className="mb-2">
                <div className={`flex items-start gap-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  <User size={15} className="mt-0.5 shrink-0" />
                  <p className="flex-1">
                    {selectedIssue.reporterName || 'Unknown User'} - {selectedIssue.description}
                  </p>
                </div>
                <div className={`flex items-center gap-2 text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  <Calendar size={15} className="shrink-0" />
                  <span>
                    {new Date(selectedIssue.timestamp).toLocaleDateString('en-GB')} at{' '}
                    {new Date(selectedIssue.timestamp)
                      .toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                      .toLowerCase()}
                  </span>
                </div>
              </div>
              
              {/* Smart-Connect AI verdict (read from ai_interpretation) */}
              {(() => {
                const verdict = selectedIssue.aiVerdict ?? parseAiVerdict(selectedIssue.aiReason);
                const chip =
                  verdict === 'approved'
                    ? { text: '✓ AI approved', cls: 'bg-green-100 text-green-800 border-green-200' }
                    : verdict === 'rejected'
                    ? { text: '✗ AI rejected', cls: 'bg-red-100 text-red-800 border-red-200' }
                    : verdict === 'manual'
                    ? { text: '⚠ Manual review required', cls: 'bg-amber-100 text-amber-800 border-amber-200' }
                    : { text: 'Pending AI review', cls: 'bg-gray-100 text-gray-600 border-gray-200' };
                return (
                  <div className={`mb-3 rounded-lg border p-2 ${isDark ? 'border-slate-500 bg-slate-700/40' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className={`text-xs font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Smart-Connect AI says:</p>
                      <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${chip.cls}`}>{chip.text}</span>
                    </div>
                    <p className={`text-xs whitespace-pre-line ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {selectedIssue.aiReason && selectedIssue.aiReason.trim()
                        ? selectedIssue.aiReason
                        : 'This report has not been reviewed by the AI yet.'}
                    </p>
                  </div>
                );
              })()}
              
              {"reportCount" in selectedIssue && //added
                selectedIssue.reportCount > 1 && (
                  <div className="mb-3 text-sm text-red-600 font-semibold">
                    Reported by {selectedIssue.reportCount} people
                  </div>
              )}
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className={`rounded-lg p-2 border ${isDark ? 'bg-slate-700 border-slate-500' : 'bg-gray-50 border-gray-300'}`}>
                  <p className={`text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Status
                  </p>
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs border ${getStatusBadgeColor(selectedIssue.status)}`}
                  >
                    {selectedIssue.status === "in-progress"
                      ? "In Progress"
                      : selectedIssue.status
                          .charAt(0)
                          .toUpperCase() +
                        selectedIssue.status.slice(1)}
                  </span>
                </div>
                <div className={`rounded-lg p-3 border ${isDark ? 'bg-slate-700 border-slate-500' : 'bg-gray-50 border-gray-300'}`}>
                  <p className={`text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Department
                  </p>
                  <p className={`text-xs ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    {selectedIssue.departmentNotified}
                  </p>
                </div>
              </div>
              {selectedIssue.aiVerified && (
                <div className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 mb-3 ${
                  isDark ? 'bg-green-900/30 border border-green-700' : 'bg-green-100 border border-green-200'
                }`}>
                  <ShieldCheck
                    className={isDark ? 'text-green-300' : 'text-green-700'}
                    size={16}
                  />
                  <span className={`text-xs ${isDark ? 'text-green-200' : 'text-green-800'}`}>
                    Verified by authorized personnel
                  </span>
                </div>
              )}

              {/* Transfer to a different department - admin only, and ONLY when
                  the AI model predicts something else while the incident type
                  is something else (a real prediction/type mismatch). Reports
                  the model confirmed, reports with no AI review yet, and
                  unrecognizable images never show this control. */}
              {isAdmin && (() => {
                const predictedLabel = parseAiPredictedLabel(selectedIssue.aiReason);
                const aiPredictsSomethingElse =
                  !!predictedLabel &&
                  !matchesIncidentType(predictedLabel, selectedIssue.type);
                const transferTargets = getTransferableDepartments(selectedIssue.type);

                if (!aiPredictsSomethingElse || transferTargets.length === 0) return null;

                const prettyLabel = predictedLabel!.replace(/_/g, ' ');

                return (
                  <div className={`mb-3 rounded-lg border p-3 ${
                    isDark ? 'border-amber-700 bg-amber-900/20' : 'border-amber-300 bg-amber-50'
                  }`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className={`text-xs font-semibold ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
                        AI predicts a different incident type
                      </p>
                      <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        isDark ? 'border-amber-600 text-amber-300' : 'border-amber-400 text-amber-700'
                      }`}>
                        {prettyLabel}
                      </span>
                    </div>
                    <p className={`text-[11px] leading-relaxed mb-2 ${isDark ? 'text-amber-300/80' : 'text-amber-700'}`}>
                      The model detected <span className="font-semibold">{prettyLabel}</span>{' '}
                      but this report is filed as{' '}
                      <span className="font-semibold">{selectedIssue.type}</span>. Transfer it to
                      the correct department.
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={transferDepartment}
                        onChange={(e) => setTransferDepartment(e.target.value)}
                        disabled={transferring}
                        aria-label="Transfer to department"
                        className={`flex-1 min-w-0 px-2 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60 ${
                          isDark
                            ? 'bg-slate-800 border-slate-600 text-gray-100'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      >
                        <option value="">Select department...</option>
                        {transferTargets.map((department) => (
                          <option key={department} value={department}>
                            {department}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!transferDepartment || transferring}
                        onClick={() =>
                          handleTransfer(selectedIssue.id, transferDepartment, predictedLabel)
                        }
                        className={`whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          isDark
                            ? 'bg-amber-600 text-white hover:bg-amber-500'
                            : 'bg-amber-500 text-white hover:bg-amber-600'
                        }`}
                      >
                        {transferring ? 'Transferring...' : 'Transfer'}
                      </button>
                    </div>
                  </div>
                );
              })()}
              
              {/* Admin Action Buttons - Only show for admins */}
              {isAdmin && (
                <div className="flex gap-2 md:gap-3">
                  <button 
                    onClick={() => handleReject(selectedIssue.id)}
                    className={`flex-1 py-2 md:py-2.5 rounded-lg border text-xs md:text-sm font-semibold transition-all ${
                      isDark 
                        ? 'border-red-800 text-red-400 hover:bg-red-900/20' 
                        : 'border-red-300 text-red-600 hover:bg-red-50'
                    }`}
                  >
                    Reject
                  </button>
                  <button 
                    onClick={() => handleVerify(selectedIssue.id)}
                    className="flex-1 py-2 md:py-2.5 rounded-lg bg-indigo-600 text-white text-xs md:text-sm font-semibold hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all"
                  >
                    Verify & Dispatch
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fullscreen Image Viewer with Zoom */}
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
    </div>
  );
}
