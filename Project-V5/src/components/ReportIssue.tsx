import { useState, useEffect, useCallback } from 'react';
import { Camera, MapPin, AlertCircle, ShieldCheck, X, Monitor, Navigation, RefreshCw, HelpCircle, Loader2 } from 'lucide-react';
import { canReportIncident } from '../utils/deviceDetection';
import { useTheme } from '../App';
// import { toast } from 'sonner';
import { supabase } from './supabaseClient';

interface ReportIssueProps {
  onSuccess: () => void;
}

type GeoPermState = PermissionState | 'unsupported';

export function ReportIssue({ onSuccess }: ReportIssueProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const issueTypes = [
    "Pothole",
    "Garbage",
    "Flood",
    "Water Leakage",
    "Accident",
    "Landslide",
    "Fire",
  ];


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
        // toast.error('Upload failed. Preview saved locally.');
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
        // toast.success('Location acquired!');
      },
      err => {
        setIsLoadingLocation(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoPermission('denied');
          setLocationError(
            'Location permission denied. Use browser lock icon to allow it.'
          );
          // toast.error('Location permission denied.');
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
      // toast.error('Please enable location permission.');
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

  const handleTypeChange = (type: string) => {
        setIssueType(type);

        if (type === "Accident") { setSeverity("critical"); return 'Accident'; }
        else if (type === "flood") { setSeverity("critical"); return 'Flood'; }
        else if (type === "Pothole") { setSeverity("high"); return 'Pothole'; }                       
        else if (type === "fire") { setSeverity("critical"); return 'Fire'; }
        else if (type === "landslide") { setSeverity("critical"); return 'Disaster Management'; }
        else if (type === "Garbage") { setSeverity("low"); return 'Sanitation Department'; }
        else if (type === "Water Leakage") { setSeverity("medium"); return 'Water Management'; }

          setSeverity("medium");
          return "Municipal Authority";
        // else { setSeverity("medium"); return 'Municipal Authority'; }
        }

  // ─── Submit ────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all required fields
    if (!issueType) {
      // toast.error('Please select an incident type.');
      return;
    }
    if (!lat || !lng) {
      // toast.error('Location is required. Please enable GPS.');
      if (!(await ensureLocation())) return;
    }
    if (!description.trim()) {
      // toast.error('Please provide a description.');
      return;
    }
    if (!photo) {
      // toast.error('Please capture an evidence photo using your camera.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData?.user) {
        // toast.error('Please log in to submit a report.');
        setIsSubmitting(false);
        return;
      }

      const userId = authData.user.id;
      
      if (!userId) {
        // toast.error('Please log in to submit a report.');
        setIsSubmitting(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 2000);
      // toast.success('Report submitted successfully!');

      // 2. SAVE TO LOCALSTORAGE (immediate display in history)
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
      const reports = JSON.parse(localStorage.getItem('reports') || '[]');

        // example severity mapping (adjust to your original logic)
        // if (type === "Accident") setSeverity("critical");
        // else if (type === "Pothole") setSeverity("high");
        // else setSeverity("medium");

      const newReport = {
        id: Date.now().toString(),
        type: issueType,
        severity: severity,
        location,
        lat: lat,
        lng: lng,
        description,
        photo,
        status: 'pending',
        timestamp: new Date().toISOString(),
        userName: user.name || 'Anonymous',
        userEmail: user.email,
        aiVerified: true,
        departmentNotified: handleTypeChange(issueType)
      };

      reports.push(newReport);
      localStorage.setItem('reports', JSON.stringify(reports));

      // const localReport = {
      //   id: data.id, //Date.now().toString(),
      //   issueType,
      //   severity,
      //   lat,
      //   lng,
      //   description,
      //   photo,
      //   user: user.email,
      //   status: data.status,
      //   timestamp: data.created_at ?? new Date().toISOString(), //timestamp: new Date().toISOString(),
      // };

      // const existing = JSON.parse(localStorage.getItem('reports') || '[]');
      // const updatedReports = [localReport, ...existing];
      // localStorage.setItem('reports', JSON.stringify(updatedReports));

      // Set default status as pending
      const reportStatus = 'pending';

      // 1. SAVE TO SUPABASE (with loader showing)
      const { data, error } = await supabase
        .from('incident_reports')
        .insert({
          user_id: userId,
          incident_type: issueType,
          incident_description: description,
          severity,
          status: reportStatus,
          location: `POINT(${lng} ${lat})`,
          photo_url: photo,
          //timestamp: new Date().toISOString(),
        })
        .select()
        .single();

      if (!data) {
        //console.error('Supabase insert error:', error);
        // toast.error('Report could not be saved. Please try again.');
        setIsSubmitting(false);
        return;
      }

      console.log('Report saved to Supabase:', data);

      // Dispatch events to update ReportHistory
      // window.dispatchEvent(new StorageEvent('storage', {
      //   key: 'reports',
      //   newValue: JSON.stringify(updatedReports),
      //   oldValue: JSON.stringify(existing),
      //   url: window.location.href
      // }));

      // window.dispatchEvent(new CustomEvent('reports-updated', {
      //   detail: { reports: updatedReports }
      // }));

      // console.log('Report saved to localStorage and database:', localReport);

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
      console.error('Submit error:', err);
      // toast.error(err.message || 'Submission failed');
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
      // toast.error('Failed to save report to database.');
      console.error('Supabase insert error:', {
        message: error.message,
        // details: error.details,
        // hint: error.hint,
      });
      setIsSubmitting(false);
      return;
    }

    const { data } = supabase.storage
      .from('incident-images')
      .getPublicUrl(filePath);

    setPhoto(data.publicUrl); // 🔥 NOW it's hosted
  };

    if (success) {
    return (
      <div className={`h-full flex items-center justify-center rounded-2xl ${isDark ? "bg-blue-200" : "bg-gray-50" }`}>
        <div className="text-center w-full max-w-sm bg-white rounded-2xl px-6 py-8 shadow-2xl">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 className={`text-2xl mb-3 text-blue-800`}>Incident Report Submitted</h2>
          <div className="flex items-center justify-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
            <ShieldCheck className="text-green-700" size={20} />
            <span className="text-sm text-green-800">AI verification in progress</span>
          </div>
          <p className={`${isDark ? "text-gray-600" : "text-gray-50" }`}>
            Local authorities have been notified. You'll receive real-time updates on the resolution progress.
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
            disabled={isLoadingLocation || !issueType || !photo || isSubmitting}
            className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${
              isLoadingLocation || !issueType || !photo || isSubmitting
                ? "bg-gray-400 cursor-not-allowed text-gray-200"
                : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-blue-500/25 active:scale-[0.98]"
            }`}
          >
            {isSubmitting && <Loader2 size={20} style={{
                    animation: 'spin 1s linear infinite',
                  }} />}
            {isLoadingLocation
              ? "Detecting Location..."
              : isSubmitting
              ? "Submitting Report..."
              : !issueType || !photo
              ? "Select Type & Photo"
              : "Submit Incident Report"}
          </button>
        </form>
      </div>
    </div>
  );  
}
