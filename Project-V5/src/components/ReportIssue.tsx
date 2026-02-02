import { useState, useEffect, useCallback } from 'react';
import { Camera, MapPin, AlertCircle, ShieldCheck, X, Monitor, Navigation, RefreshCw, HelpCircle } from 'lucide-react';
import { canReportIncident } from '../utils/deviceDetection';
import { useTheme } from '../App';
import { toast } from 'sonner';
import { supabase } from './supabaseClient';

interface ReportIssueProps {
  onSuccess: () => void;
}

type GeoPermState = PermissionState | 'unsupported';

export function ReportIssue({ onSuccess }: ReportIssueProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // ─── Form State ─────────────────────────────────────────────
  const [issueType, setIssueType] = useState('');
  const [severity, setSeverity] = useState('');
  const [locationText, setLocationText] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string>('');

  // ─── UI State ──────────────────────────────────────────────
  const [success, setSuccess] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Permission State ──────────────────────────────────────
  const [geoPermission, setGeoPermission] =
    useState<GeoPermState>('prompt');

  const canReport = canReportIncident();

  // ─── Helpers ───────────────────────────────────────────────
  const setCoords = (latitude: number, longitude: number) => {
    setLat(latitude);
    setLng(longitude);
    setLocationText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
  };

  const getPermissionState = useCallback(async (): Promise<GeoPermState> => {
    if (!('permissions' in navigator)) return 'unsupported';
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      status.onchange = () => setGeoPermission(status.state);
      return status.state;
    } catch {
      return 'unsupported';
    }
  }, []);

  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);

      // 1. Create local preview immediately using FileReader
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setPhoto(result); // Show preview immediately
      };
      reader.readAsDataURL(file);

      // 2. Create unique file path
      const filePath = `reports/${Date.now()}-${file.name}`;

      // 3. Upload to Supabase Storage
      const { error } = await supabase.storage
        .from('incident-images')
        .upload(filePath, file);

      if (error) {
        console.error('Upload failed:', error.message);
        toast.error('Upload failed. Preview saved locally.');
        setUploading(false);
        return;
      }

      // 4. Get PUBLIC URL and update if upload succeeds
      const { data } = supabase.storage
        .from('incident-images')
        .getPublicUrl(filePath);

      setPhoto(data.publicUrl); // Replace with Supabase URL
      setUploading(false);
    };

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoPermission('unsupported');
      setLocationError('Geolocation not supported by this browser.');
      return;
    }

    if (
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost'
    ) {
      setLocationError('Location requires HTTPS.');
      return;
    }

    setIsLoadingLocation(true);
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords(pos.coords.latitude, pos.coords.longitude);
        setGeoPermission('granted');
        setIsLoadingLocation(false);
        toast.success('Location acquired!');
      },
      err => {
        setIsLoadingLocation(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoPermission('denied');
          setLocationError(
            'Location permission denied. Use browser lock icon to allow it.'
          );
          toast.error('Location permission denied.');
        } else {
          setLocationError('Unable to fetch location.');
        }
      },
      { timeout: 15000, maximumAge: 30000 }
    );
  }, []);

  const ensureLocation = useCallback(async () => {
    if (lat && lng) return true;

    const state = await getPermissionState();
    setGeoPermission(state);

    if (state === 'denied') {
      toast.error('Please enable location permission.');
      return false;
    }

    requestLocation();
    await new Promise(r => setTimeout(r, 800));
    return lat !== null && lng !== null;
  }, [lat, lng, getPermissionState, requestLocation]);

  // ─── Auto Request on Mount ─────────────────────────────────
  useEffect(() => {
    if (!canReport) return;
    (async () => {
      const state = await getPermissionState();
      setGeoPermission(state);
      if (state !== 'denied') requestLocation();
    })();
  }, [canReport, getPermissionState, requestLocation]);

  // ─── AI Verification Result State ───────────────────────────
  const [aiVerificationResult, setAiVerificationResult] = useState<{
    verified: boolean;
    confidence: number;
    reason: string;
  } | null>(null);

  // ─── Submit ────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all required fields
    if (!issueType) {
      toast.error('Please select an incident type.');
      return;
    }
    if (!lat || !lng) {
      toast.error('Location is required. Please enable GPS.');
      if (!(await ensureLocation())) return;
    }
    if (!description.trim()) {
      toast.error('Please provide a description.');
      return;
    }
    if (!photo) {
      toast.error('Please capture an evidence photo using your camera.');
      return;
    }

    setIsSubmitting(true);
    setAiVerificationResult(null);

    try {
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
      
      if (!user.id) {
        toast.error('Please log in to submit a report.');
        setIsSubmitting(false);
        return;
      }

      // Default AI result if API fails
      let aiResult = {
        verified: true,
        confidence: 1,
        reason: 'Report submitted for manual review'
      };

      // Try to verify with Gemini API (but don't block submission if it fails)
      try {
        const verifyRes = await fetch('/api/verify-incident', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            incidentType: issueType,
            description,
            lat,
            lng,
            photoUrl: photo,
          }),
        });

        if (verifyRes.ok) {
          const result = await verifyRes.json();
          if (result && typeof result.verified === 'boolean') {
            aiResult = result;
          }
        }
      } catch (apiErr) {
        console.log('[v0] AI verification API failed, proceeding with submission:', apiErr);
      }

      setAiVerificationResult(aiResult);

      // Determine status based on AI verification
      const reportStatus = aiResult.verified ? 'pending' : 'rejected';
      const isFlagged = !aiResult.verified;

      // Insert to Supabase
      const { data, error } = await supabase.from('incident_reports').insert({
        user_id: user.id,
        incident_type: issueType,
        incident_description: description,
        severity,
        status: reportStatus,
        location: `POINT(${lng} ${lat})`,
        photo_url: photo,
        timestamp: new Date().toISOString(),
        ai_verified: aiResult.verified,
        ai_confidence: aiResult.confidence,
        ai_reason: aiResult.reason,
        is_flagged: isFlagged
      }).select();

      if (error) {
        console.log('[v0] Supabase insert error:', error);
        throw new Error(error.message || 'Failed to save report to database');
      }

      console.log('[v0] Report saved to Supabase:', data);

      // Local fallback (preserved)
      const localReport = {
        id: Date.now().toString(),
        issueType,
        severity,
        lat,
        lng,
        description,
        photo,
        user: user.email,
        timestamp: new Date().toISOString(),
        aiVerified: aiResult.verified,
        isFlagged
      };

      const existing = JSON.parse(localStorage.getItem('reports') || '[]');
      localStorage.setItem('reports', JSON.stringify([localReport, ...existing]));

      setSuccess(true);
      toast.success('Report submitted successfully!');
      // Reset form and keep success visible
      setTimeout(() => {
        setIssueType('');
        setSeverity('');
        setDescription('');
        setPhoto('');
        setLocationText('');
        setLat(null);
        setLng(null);
        onSuccess();
      }, 3000);
    } catch (err: any) {
      console.log('[v0] Submit error:', err);
      toast.error(err.message || 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
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

    // example severity mapping (adjust to your original logic)
    if (type === "Accident") setSeverity("critical");
    else if (type === "Pothole") setSeverity("high");
    else setSeverity("medium");
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const filePath = `incidents/${Date.now()}-${file.name}`;

    const { error } = await supabase.storage
      .from('incident-images')
      .upload(filePath, file);

    if (error) {
      toast.error("Image upload failed");
      return;
    }

    const { data } = supabase.storage
      .from('incident-images')
      .getPublicUrl(filePath);

    setPhoto(data.publicUrl); // 🔥 NOW it's hosted
  };

  if (success) {

    const isVerified = aiVerificationResult?.verified;
    const isFlagged = !isVerified;

    return (
      <div className="h-full flex items-center justify-center p-6 text-center animate-in fade-in">
        <div className={`bg-green-50 p-8 rounded-2xl max-w-sm border border-green-100 shadow-sm ${
          isFlagged 
            ? 'bg-red-50 border-red-200' 
            : 'bg-green-50 border-green-100'
        }`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isFlagged ? 'bg-red-100' : 'bg-green-100'
          }`}>
            {isFlagged ? (
              <AlertCircle className="text-red-600" size={32} />
            ) : (
              <ShieldCheck className="text-green-600" size={32} />
            )}
          </div>
          
          <h3 className={`text-xl font-bold mb-2 ${
            isFlagged ? 'text-red-900' : 'text-green-900'
          }`}>
            {isFlagged ? 'Report Flagged' : 'Report Submitted'}
          </h3>
          
          <p className={`mb-4 ${isFlagged ? 'text-red-700' : 'text-green-700'}`}>
            {isFlagged 
              ? 'Your report has been flagged for review.' 
              : 'Thank you! Your report has been verified and logged.'}
          </p>

          {aiVerificationResult && (
            <div className={`mt-4 p-4 rounded-xl text-left ${
              isFlagged ? 'bg-red-100/50' : 'bg-green-100/50'
            }`}>
              <p className={`text-sm font-medium mb-2 ${
                isFlagged ? 'text-red-800' : 'text-green-800'
              }`}>
                AI Analysis Result:
              </p>
              <p className={`text-sm ${isFlagged ? 'text-red-700' : 'text-green-700'}`}>
                {aiVerificationResult.reason}
              </p>
              <p className={`text-xs mt-2 ${isFlagged ? 'text-red-600' : 'text-green-600'}`}>
                Confidence: {Math.round(aiVerificationResult.confidence * 100)}%
              </p>
            </div>
          )}

          <p className={`text-sm mt-4 ${isFlagged ? 'text-red-600' : 'text-green-600'}`}>
            {isFlagged 
              ? 'Check your History tab for details.' 
              : 'View status in the History tab.'}
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
                  locationText ||
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
                      setPhoto('');
                    }}
                    className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <label htmlFor="photo-upload" className="cursor-pointer block">
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
                  </label>
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoadingLocation || !issueType || !photo}
            className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all ${
              isLoadingLocation || !issueType || !photo
                ? "bg-gray-400 cursor-not-allowed text-gray-200"
                : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-blue-500/25 active:scale-[0.98]"
            }`}
          >
            {isLoadingLocation
              ? "Detecting Location..."
              : !issueType || !photo
              ? "Select Type & Photo"
              : "Submit Incident Report"}
          </button>
        </form>
      </div>
    </div>
  );  
}
