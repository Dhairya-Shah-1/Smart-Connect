import { useState, useEffect } from 'react';
import { Camera, MapPin, AlertCircle, ShieldCheck, X, Monitor, Navigation, RefreshCw, HelpCircle } from 'lucide-react';
import { canReportIncident } from '../utils/deviceDetection';
import { useTheme } from "../App";
import { toast } from "sonner";

interface ReportIssueProps {
  onSuccess: () => void;
}

type GeoPermState = PermissionState | "unsupported";

export function ReportIssue({ onSuccess }: ReportIssueProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Form State
  const [issueType, setIssueType] = useState("");
  const [severity, setSeverity] = useState("");
  const [location, setLocation] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);

  // UI State
  const [success, setSuccess] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] =
    useState(false);

  // Permission state (so we can re-prompt on submit if denied earlier)
  const [geoPermission, setGeoPermission] =
    useState<GeoPermState>("prompt");

  const canReport = canReportIncident();

  const setCoords = (latitude: number, longitude: number) => {
    setLat(latitude);
    setLng(longitude);
    setLocation(
      `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    );
  };

  const getPermissionState =
    useCallback(async (): Promise<GeoPermState> => {
      // Permissions API not supported on all browsers (especially iOS Safari)
      const hasPermissionsApi =
        typeof navigator !== "undefined" &&
        "permissions" in navigator &&
        typeof (navigator as any).permissions?.query ===
          "function";

      if (!hasPermissionsApi) return "unsupported";

      try {
        const status = await (
          navigator as any
        ).permissions.query({ name: "geolocation" });
        // Keep it updated if user changes it in browser UI
        status.onchange = () => setGeoPermission(status.state);
        return status.state as PermissionState;
      } catch {
        return "unsupported";
      }
    }, []);

  // Ask for location permission (this triggers the browser prompt)
  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocationError(
        "Geolocation not supported by this browser.",
      );
      setGeoPermission("unsupported");
      return;
    }

    // Geolocation requires HTTPS (or localhost)
    if (
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost"
    ) {
      setLocationError(
        "Security Error: Location requires an HTTPS connection.",
      );
      return;
    }

    setIsLoadingLocation(true);
    setLocationError("");

    const geoOptions: PositionOptions = {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 30000,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCoords(latitude, longitude);
        setLocationError("");
        setIsLoadingLocation(false);
        setGeoPermission("granted");
        toast.success("Location acquired!");
      },
      (error) => {
        setIsLoadingLocation(false);
        console.error("Geolocation Detail:", error);

        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGeoPermission("denied");
            setLocationError(
              'Location permission denied. Please click the lock icon in your URL bar and set Location to "Allow", then try again.',
            );
            toast.error("Location permission denied.");
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError(
              "Signal lost. Ensure GPS/WiFi is on and try again.",
            );
            break;
          case error.TIMEOUT:
            setLocationError(
              "Request timed out. Try moving near a window or check your connection.",
            );
            break;
          default:
            setLocationError(
              "An unknown error occurred while detecting location.",
            );
        }
      },
      geoOptions,
    );
  }, []);

  // Auto-request on mount: this will show the browser permission prompt (if needed).
  useEffect(() => {
    if (!canReport) return;

    (async () => {
      const state = await getPermissionState();
      setGeoPermission(state);

      // If permissions API says denied, we can't force a prompt; user must change browser settings.
      // Still: calling geolocation on submit can help on browsers that don't expose Permissions API.
      if (state === "denied") {
        setLocationError(
          "Location permission is blocked. Please enable it from the browser address bar (lock icon) and reload.",
        );
        return;
      }

      // For 'prompt', 'granted', or 'unsupported' we attempt to get location (this triggers prompt when applicable).
      requestLocation();
    })();
  }, [canReport, getPermissionState, requestLocation]);

  const issueTypes = [
    "Flood",
    "Puddle",
    "Pothole",
    "Landslide",
    "Fire",
    "Accident",
    "Other",
  ];

  const handleTypeChange = (type: string) => {
    setIssueType(type);
    switch (type.toLowerCase()) {
      case "flood":
      case "landslide":
      case "fire":
        setSeverity("critical");
        break;
      case "accident":
        setSeverity("high");
        break;
      case "pothole":
        setSeverity("medium");
        break;
      default:
        setSeverity("low");
    }
  };

  const handlePhotoUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File too large. Max 10MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () =>
        setPhoto(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Helper: run requestLocation and wait a bit for state updates (best-effort)
  const ensureLocation = useCallback(async () => {
    // If we already have coords, we're good.
    if (lat != null && lng != null) return true;

    // Check permission if possible
    const state = await getPermissionState();
    setGeoPermission(state);

    // If explicitly denied and Permissions API is available, tell user to change settings.
    // (Some browsers may still show a prompt when calling geolocation again; so we still call requestLocation below
    // if Permissions API is unsupported.)
    if (state === "denied") {
      setLocationError(
        "Location permission is blocked. Please enable it from the browser address bar (lock icon) and try again.",
      );
      toast.error(
        "Please enable location permission to submit.",
      );
      return false;
    }

    // Trigger prompt / fetch coords (this is what you want before submit too)
    requestLocation();

    // We can’t truly await getCurrentPosition without rewriting it as a Promise,
    // so we do a quick best-effort wait to allow it to resolve.
    await new Promise((r) => setTimeout(r, 800));

    return lat != null && lng != null;
  }, [getPermissionState, lat, lng, requestLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Before submitting: re-ask for permission / location if not available (or was previously disagreed).
    const hasLocation = await ensureLocation();
    if (!hasLocation) return;

    if (!issueType) {
      toast.error("Please select an incident type.");
      return;
    }

    if (!description.trim()) {
      toast.error("Please add a description.");
      return;
    }

    if (!photo) {
      toast.error("Please upload an evidence photo.");
      return;
    }

    // At this point, lat/lng should be present
    if (lat == null || lng == null) {
      toast.error("Valid location is required to submit.");
      return;
    }

    const user = JSON.parse(
      localStorage.getItem("currentUser") || "{}",
    );
    const newReport = {
      id: Date.now().toString(),
      type: issueType,
      severity,
      location,
      lat,
      lng,
      description,
      photo,
      status: "pending",
      timestamp: new Date().toISOString(),
      userName: user.name || "Anonymous",
      userEmail: user.email,
      aiVerified: true,
      departmentNotified: "Public Works Dept",
    };

    const existingReports = JSON.parse(
      localStorage.getItem("reports") || "[]",
    );
    localStorage.setItem(
      "reports",
      JSON.stringify([newReport, ...existingReports]),
    );

    setSuccess(true);
    setTimeout(onSuccess, 2000);
  };

  const getSeverityColors = (sev: string) => {
    switch (sev) {
      case "critical":
        return {
          text: "text-red-700 bg-red-50 border-red-200",
          dot: "bg-red-600",
        };
      case "high":
        return {
          text: "text-orange-700 bg-orange-50 border-orange-200",
          dot: "bg-orange-500",
        };
      case "medium":
        return {
          text: "text-yellow-700 bg-yellow-50 border-yellow-200",
          dot: "bg-yellow-500",
        };
      case "low":
        return {
          text: "text-blue-700 bg-blue-50 border-blue-200",
          dot: "bg-blue-500",
        };
      default:
        return {
          text: "text-gray-700 bg-gray-50 border-gray-200",
          dot: "bg-gray-400",
        };
    }
  };

  if (success) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center animate-in fade-in">
        <div className="bg-green-50 p-8 rounded-2xl max-w-sm border border-green-100 shadow-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="text-green-600" size={32} />
          </div>
          <h3 className="text-xl font-bold text-green-900 mb-2">
            Report Submitted
          </h3>
          <p className="text-green-700">
            Thank you! Your report has been verified and logged.
          </p>
        </div>
      </div>
    );
  }

  if (!canReport) {
    return (
      <div
        className={`h-full flex items-center justify-center p-6 ${isDark ? "bg-slate-900" : "bg-gray-50"}`}
      >
        <div
          className={`max-w-md rounded-2xl shadow-lg border p-8 text-center ${
            isDark
              ? "bg-slate-800 border-slate-700"
              : "bg-white border-gray-200"
          }`}
        >
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
              isDark ? "bg-blue-900" : "bg-blue-100"
            }`}
          >
            <Monitor
              className={
                isDark ? "text-blue-400" : "text-blue-600"
              }
              size={40}
            />
          </div>
          <h3
            className={`text-2xl mb-4 ${isDark ? "text-gray-100" : "text-gray-900"}`}
          >
            Mobile Device Required
          </h3>
          <p
            className={`text-sm mb-6 ${isDark ? "text-gray-400" : "text-gray-600"}`}
          >
            Incident reporting is enabled for mobile/tablets to
            capture accurate GPS coordinates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`h-full overflow-y-auto p-6 ${isDark ? "bg-slate-900" : "bg-gray-50"}`}
    >
      <div
        className={`max-w-2xl mx-auto rounded-2xl shadow-sm border p-8 ${
          isDark
            ? "bg-slate-800 border-slate-700"
            : "bg-white border-gray-100"
        }`}
      >
        <h2
          className={`text-2xl font-bold mb-6 ${isDark ? "text-white" : "text-gray-900"}`}
        >
          ⚠️ Report an Incident
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Incident Type */}
          <div>
            <label
              className={`flex text-sm font-medium mb-3 ${isDark ? "text-gray-300" : "text-gray-700"}`}
            >
              Incident Type{" "}
              <span className="text-red-400 ml-1">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {issueTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                    issueType === type
                      ? "bg-blue-600 text-white border-blue-600 shadow-md"
                      : isDark
                        ? "bg-slate-700 text-gray-300 border-slate-600 hover:border-blue-500"
                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Severity Display */}
          {issueType && (
            <div
              className={`${
                isDark
                  ? "bg-slate-700/50 border-slate-600"
                  : "bg-gray-50 border-gray-200"
              } p-4 rounded-xl border flex items-center justify-between transition-all`}
            >
              <span
                className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-600"}`}
              >
                Severity:
              </span>
              <div
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full border ${getSeverityColors(severity).text}`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${getSeverityColors(severity).dot}`}
                />
                <span className="text-sm font-bold uppercase">
                  {severity}
                </span>
              </div>
            </div>
          )}

          {/* Location Section */}
          <div>
            <label
              className={`flex text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
            >
              Location{" "}
              <span className="text-red-400 ml-1">*</span>
            </label>

            <div
              className="relative group cursor-pointer"
              onClick={requestLocation}
            >
              <div className="absolute left-3 top-3.5 z-10">
                {isLoadingLocation ? (
                  <Navigation
                    className="text-blue-500 animate-pulse"
                    size={20}
                  />
                ) : locationError ? (
                  <AlertCircle
                    className="text-red-500"
                    size={20}
                  />
                ) : (
                  <MapPin
                    className={`${lat ? "text-green-500" : "text-gray-400"}`}
                    size={20}
                  />
                )}
              </div>

              <input
                type="text"
                value={
                  location ||
                  (isLoadingLocation
                    ? "Detecting coordinates..."
                    : "Tap to detect location")
                }
                readOnly
                placeholder="GPS coordinates required"
                className={`w-full pl-10 pr-12 py-3.5 border rounded-xl focus:outline-none cursor-pointer transition-all ${
                  isDark
                    ? "bg-slate-700 border-slate-600 text-white"
                    : "bg-white border-gray-300"
                } ${locationError ? "border-red-500 ring-2 ring-red-500/10" : ""}`}
                required
              />

              <div className="absolute right-3 top-3.5 flex items-center gap-2">
                {!isLoadingLocation && (
                  <RefreshCw
                    size={18}
                    className="text-gray-400 group-hover:text-blue-500 transition-colors"
                  />
                )}
              </div>
            </div>

            {/* Detailed Error/Status Messages */}
            {locationError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2">
                <HelpCircle
                  className="text-red-500 mt-0.5 flex-shrink-0"
                  size={16}
                />
                <p className="text-xs text-red-700 leading-tight">
                  {locationError}
                </p>
              </div>
            )}

            {!locationError && !lat && !isLoadingLocation && (
              <p className="text-[11px] text-gray-500 mt-2 ml-1">
                Note: GPS must be enabled. Ensure you are not in
                Incognito mode.
              </p>
            )}

            {/* Optional helper when permission is denied */}
            {geoPermission === "denied" && (
              <p className="text-[11px] text-red-500 mt-2 ml-1">
                Location permission is blocked. Open your
                browser’s lock icon settings and set Location to
                “Allow”.
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label
              className={`flex text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
            >
              Description{" "}
              <span className="text-red-400 ml-1">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 h-32 resize-none transition-all ${
                isDark
                  ? "bg-slate-700 border-slate-600 text-white"
                  : "bg-white border-gray-300"
              }`}
              placeholder="Provide specific details about the issue..."
              required
            />
          </div>

          {/* Evidence Upload */}
          <div>
            <label
              className={`flex text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
            >
              Evidence Photo{" "}
              <span className="text-red-400 ml-1">*</span>
            </label>
            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                photo
                  ? "border-blue-500 bg-blue-50/10"
                  : isDark
                    ? "border-slate-600 hover:border-blue-500"
                    : "border-gray-300 hover:bg-gray-50"
              }`}
            >
              {photo ? (
                <div className="relative h-48 w-full group">
                  <img
                    src={photo}
                    alt="Preview"
                    className="w-full h-full object-contain rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhoto(null);
                    }}
                    className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <Camera
                    className="mx-auto mb-3 text-gray-400"
                    size={40}
                  />
                  <p
                    className={`font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}
                  >
                    Upload Evidence
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Capture a photo of the incident
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoadingLocation}
            className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all ${
              isLoadingLocation
                ? "bg-gray-400 cursor-not-allowed text-gray-200"
                : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-blue-500/25 active:scale-[0.98]"
            }`}
          >
            {isLoadingLocation
              ? "Detecting Location..."
              : "Submit Incident Report"}
          </button>
        </form>
      </div>
    </div>
  );
}