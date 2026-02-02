import { useState, useEffect, useCallback } from "react";
import {
  Camera,
  MapPin,
  AlertCircle,
  ShieldCheck,
  X,
  Monitor,
  Navigation,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import { canReportIncident } from "../utils/deviceDetection";
import { useTheme } from "../App";
import { toast } from "sonner";
import { supabase } from "./supabaseClient";

interface ReportIssueProps {
  onSuccess: () => void;
}

type GeoPermState = PermissionState | "unsupported";

export function ReportIssue({ onSuccess }: ReportIssueProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // ─── Form State ─────────────────────────────────────────────
  const [issueType, setIssueType] = useState("");
  const [severity, setSeverity] = useState("");
  const [locationText, setLocationText] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string>("");

  // ─── UI State ──────────────────────────────────────────────
  const [success, setSuccess] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ─── Permission State ──────────────────────────────────────
  const [geoPermission, setGeoPermission] =
    useState<GeoPermState>("prompt");

  const canReport = canReportIncident();

  // ─── Helpers ───────────────────────────────────────────────
  const setCoords = (latitude: number, longitude: number) => {
    setLat(latitude);
    setLng(longitude);
    setLocationText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
  };

  const getPermissionState = useCallback(async (): Promise<GeoPermState> => {
    if (!("permissions" in navigator)) return "unsupported";
    try {
      const status = await navigator.permissions.query({
        name: "geolocation",
      });
      status.onchange = () => setGeoPermission(status.state);
      return status.state;
    } catch {
      return "unsupported";
    }
  }, []);

  // ─── Image Upload (Supabase Storage) ───────────────────────
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    const filePath = `reports/${Date.now()}-${file.name}`;

    const { error } = await supabase.storage
      .from("incident-images")
      .upload(filePath, file);

    if (error) {
      toast.error("Image upload failed");
      setUploading(false);
      return;
    }

    const { data } = supabase.storage
      .from("incident-images")
      .getPublicUrl(filePath);

    setPhoto(data.publicUrl);
    setUploading(false);
  };

  // ─── Location ──────────────────────────────────────────────
  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGeoPermission("unsupported");
      setLocationError("Geolocation not supported.");
      return;
    }

    setIsLoadingLocation(true);
    setLocationError("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords(pos.coords.latitude, pos.coords.longitude);
        setGeoPermission("granted");
        setIsLoadingLocation(false);
        toast.success("Location acquired");
      },
      (err) => {
        setIsLoadingLocation(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoPermission("denied");
          setLocationError("Location permission denied.");
        } else {
          setLocationError("Unable to fetch location.");
        }
      },
      { timeout: 15000, maximumAge: 30000 }
    );
  }, []);

  const ensureLocation = useCallback(async () => {
    if (lat && lng) return true;

    const state = await getPermissionState();
    setGeoPermission(state);

    if (state === "denied") {
      toast.error("Enable location permission");
      return false;
    }

    requestLocation();
    await new Promise((r) => setTimeout(r, 800));
    return lat !== null && lng !== null;
  }, [lat, lng, getPermissionState, requestLocation]);

  // ─── Auto location on mount ────────────────────────────────
  useEffect(() => {
    if (!canReport) return;
    (async () => {
      const state = await getPermissionState();
      setGeoPermission(state);
      if (state !== "denied") requestLocation();
    })();
  }, [canReport, getPermissionState, requestLocation]);

  // ─── Submit ────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccess(false);

    try {
      if (!(await ensureLocation())) return;

      if (!issueType || !description || !photo) {
        toast.error("All required fields must be filled");
        return;
      }

      // AI Verification
      const verifyRes = await fetch("/api/verify-incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueType, description }),
      });

      const aiResult = await verifyRes.json();

      if (!aiResult.verified) {
        toast.error("Rejected: " + aiResult.reason);
        return;
      }

      const user = JSON.parse(
        localStorage.getItem("currentUser") || "{}"
      );

      const { error } = await supabase
        .from("incident_reports")
        .insert({
          user_id: user.id,
          incident_type: issueType,
          incident_description: description,
          severity,
          status: "verified",
          ai_reason: aiResult.reason,
          location: `POINT(${lng} ${lat})`,
          photo_url: photo,
        });

      if (error) throw error;

      // ✅ SUCCESS CARD TRIGGER
      setSuccess(true);
      setTimeout(onSuccess, 2000);
    } catch (err: any) {
      toast.error(err.message || "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Severity UI helpers ───────────────────────────────────
  const getSeverityColors = (sev: string) => {
    switch (sev) {
      case "critical":
        return { text: "text-red-700 bg-red-50", dot: "bg-red-600" };
      case "high":
        return { text: "text-orange-700 bg-orange-50", dot: "bg-orange-500" };
      case "medium":
        return { text: "text-yellow-700 bg-yellow-50", dot: "bg-yellow-500" };
      default:
        return { text: "text-gray-700 bg-gray-50", dot: "bg-gray-400" };
    }
  };

  const issueTypes = [
    "Pothole",
    "Garbage",
    "Street Light",
    "Water Leakage",
    "Accident",
    "Other",
  ];

  const handleTypeChange = (type: string) => {
    setIssueType(type);
    if (type === "Accident") setSeverity("critical");
    else if (type === "Pothole") setSeverity("high");
    else setSeverity("medium");
  };

  // ─── SUCCESS VIEW ──────────────────────────────────────────
  if (success) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center animate-in fade-in">
        <div className="bg-green-50 p-8 rounded-2xl max-w-sm border shadow">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="text-green-600" size={32} />
          </div>
          <h3 className="text-xl font-bold text-green-900 mb-2">
            Report Submitted
          </h3>
          <p className="text-green-700">
            Your incident has been verified and logged.
          </p>
        </div>
      </div>
    );
  }

  // ─── Desktop block ─────────────────────────────────────────
  if (!canReport) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl shadow border p-8 text-center">
          <Monitor size={40} className="mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">
            Mobile Device Required
          </h3>
          <p className="text-sm text-gray-500">
            Incident reporting works only on mobile/tablets.
          </p>
        </div>
      </div>
    );
  }

  // ─── MAIN FORM (unchanged UI) ──────────────────────────────
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto rounded-2xl shadow border p-8">
        <h2 className="text-2xl font-bold mb-6">
          ⚠️ Report an Incident
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Incident Type */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {issueTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={`py-3 px-4 rounded-xl border ${
                  issueType === type
                    ? "bg-blue-600 text-white"
                    : "bg-white"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-4 border rounded-xl h-32"
            placeholder="Describe the issue"
            required
          />

          {/* Photo */}
          <input type="file" accept="image/*" onChange={handleImageUpload} />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold"
          >
            {isSubmitting ? "Submitting..." : "Submit Incident Report"}
          </button>
        </form>
      </div>
    </div>
  );
}
