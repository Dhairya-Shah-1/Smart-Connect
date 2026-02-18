import { useState, useEffect } from "react";
import { MapPin, Filter, Search, X, ShieldCheck, Loader2} from "lucide-react";
import { useTheme } from "../App";
import { OpenLayersMap } from "./OpenLayersMap";
import { isMobileOrTablet } from "../utils/deviceDetection";

/* 🔹 ADDED */
import { supabase } from "./supabaseClient";
import { toast } from "sonner";

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

interface MapViewProps {
  onNavigateHome: () => void;
  urgentCount?: number;
}

export function MapView({
  onNavigateHome,
  urgentCount,
}: MapViewProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);

  // State for filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] =  useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const isMobileTablet = isMobileOrTablet();

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
        found = true;
        break;
      }
    }

    if (!found) {
      grouped.push({
        ...issue,
        reportCount: 1,
      });
    }
  });

  return grouped;
};

  /* ======================================================
     🔹 SUPABASE DATA FETCH (REPLACES localStorage ONLY)
     ====================================================== */
  const fetchIssues = async () => {
    try {
      if (issues.length === 0) {
        setLoading(true);   // START LOADING only for FIRST fetch when there are no issues yet
      }
      const { data, error } = await supabase
        .from("incident_reports_view")
        .select("*")
        .neq("status", "rejected")
        .order("timestamp", { ascending: false });

      if (error) throw error;

      const mappedIssues: Issue[] = (data || []).map((report: any) => {
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
          userName: "Anonymous",
          photo: report.photo_url,
          aiVerified: true,
          departmentNotified: "Central Control",
        };
      });

      const grouped = groupNearbyIssues(mappedIssues);
      setIssues(grouped);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load incident data");
    } finally {
    setLoading(false);   // STOP LOADING
    }
  };

  /* 🔹 ONLY CHANGE INSIDE useEffect */
  useEffect(() => {
    fetchIssues();

    const channel = supabase
      .channel("incident-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "incident_reports",
        },
        () => {
          fetchIssues();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    <div className="h-full flex">
      {/* FILTER PANEL */}
      <div
        className={`${showFilters ? "w-80" : "w-0"} transition-all duration-300 overflow-hidden flex-shrink-0 border-r ${
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
          <div className="mb-4">
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
          </div>

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
        className={`flex-1 relative ${isDark ? "bg-gradient-to-br from-slate-700 to-slate-900" : "bg-gradient-to-br from-slate-100 to-blue-50"}`}
      >
        {loading && (
            <div className="z-0 absolute inset-0 flex bg-slate-50-opacity-70 items-center justify-center backdrop-blur-sm z-40">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="z-10 w-10 h-10 animate-spin text-blue-800" />
                <span className="z-50 text-sm text-blue-800 font-medium">
                  Loading incidents...
                </span>
              </div>
            </div>
          )}
        <div className="absolute inset-0 z-0">
          <OpenLayersMap
            issues={filteredIssues} className={`${loading ? "opacity-0" : ""}`}
            onMarkerClick={(id) => {
              const issue = issues.find((i) => i.id === id);
              setSelectedIssue(issue || null);
            }}
          />
        </div>

        {/* Urgent Indicator */}
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

        {/* Filter Toggle */}
        {!showFilters && urgentCount > 0 && (
          <button
            onClick={() => setShowFilters(true)}
            className={`absolute top-4 left-28 z-10 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 transition-colors 
            ${isDark ? "bg-slate-800 hover:bg-slate-700 text-gray-200" : "bg-white hover:bg-gray-50 text-gray-700"}
          `}
          >
            <Filter size={18} />
            <span className="text-sm">Filters</span>
          </button>
        )}
        {!showFilters && urgentCount == 0 && (
          <button
            onClick={() => setShowFilters(true)}
            className={`absolute top-4 left-4 z-10 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 transition-colors 
            ${isDark ? "bg-slate-800 hover:bg-slate-700 text-gray-200" : "bg-white hover:bg-gray-50 text-gray-700"}
          `}
          >
            <Filter size={18} />
            <span className="text-sm">Filters</span>
          </button>
        )}

        {/* Stats - Hide on mobile/tablet when filters panel is open */}
        {!(isMobileTablet && showFilters) && (
          <div
            className={`absolute top-4 right-4 rounded-lg shadow-lg p-3 z-10 ${
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
              {filteredIssues.length}
            </div>
          </div>
        )}

        {/* Selected Issue Popup */}
        {selectedIssue && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl max-w-md w-full z-30 border border-gray-200">
            <button
              onClick={() => setSelectedIssue(null)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-1 z-40"
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
                  <h3 className="text-lg text-gray-900">
                    {selectedIssue.type}
                  </h3>
                  <div className="flex items-center text-gray-600 text-sm mt-1">
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
              <p className="text-sm text-gray-700 mb-4">
                {selectedIssue.description}
              </p>
              {"reportCount" in selectedIssue && //added
                selectedIssue.reportCount > 1 && (
                  <div className="mb-3 text-sm text-red-600 font-semibold">
                    Reported by {selectedIssue.reportCount} people
                  </div>
              )}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">
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
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">
                    Department
                  </p>
                  <p className="text-xs text-gray-900">
                    {selectedIssue.departmentNotified}
                  </p>
                </div>
              </div>
              {selectedIssue.aiVerified && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
                  <ShieldCheck
                    className="text-green-700"
                    size={16}
                  />
                  <span className="text-xs text-green-800">
                    Verified by SmartConnect AI
                  </span>
                </div>
              )}
              <p className="text-xs text-gray-500">
                Reported by {selectedIssue.userName} on{" "}
                {new Date(
                  selectedIssue.timestamp,
                ).toLocaleDateString()}{" "}
                at{" "}
                {new Date(
                  selectedIssue.timestamp,
                ).toLocaleTimeString()}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
