import { useState, useEffect } from 'react';
// import { Camera, MapPin, AlertCircle, ShieldCheck, X, Monitor, Navigation, RefreshCw, HelpCircle } from 'lucide-react';
import { canReportIncident } from '../utils/deviceDetection';
import { useTheme } from '../App';
import { toast } from 'sonner@2.0.3';
import { supabase } from './supabaseClient';

interface ReportIssueProps {
  onSuccess: () => void;
}

export function ReportIssue({ onSuccess }: ReportIssueProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [issueType, setIssueType] = useState('');
  const [severity, setSeverity] = useState('');
  const [location, setLocation] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);

  // Check if device can report
  const canReport = canReportIncident();

  // Request location permission on component mount
  useEffect(() => {
    if (!canReport) return;

    if ('geolocation' in navigator) {
      setIsLoadingLocation(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLat(latitude);
          setLng(longitude);
          setLocation(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          setLocationError('');
          setIsLoadingLocation(false);
        },
        (error) => {
          setIsLoadingLocation(false);
          switch (error.code) {
            case error.PERMISSION_DENIED:
              setLocationError('Location permission denied. Please enable location access to report incidents.');
              break;
            case error.POSITION_UNAVAILABLE:
              setLocationError('Location information unavailable. Please check your device settings.');
              break;
            case error.TIMEOUT:
              setLocationError('Location request timed out. Please try again.');
              break;
            default:
              setLocationError('Unable to retrieve location. Please try again.');
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      setLocationError('Geolocation is not supported by your device.');
      setIsLoadingLocation(false);
    }
  }, [canReport]);

  const issueTypes = [
    'Flood',
    'Puddle',
    'Pothole',
    'Landslide',
    'Fire',
    'Accident',
    'Other',
  ];

  const handleTypeChange = (type: string) => {
    setIssueType(type);
    
    // Auto-assign severity based on type
    switch (type.toLowerCase()) {
      case 'flood':
      case 'landslide':
      case 'fire':
        setSeverity('critical');
        break;
      case 'accident':
        setSeverity('high');
        break;
      case 'pothole':
        setSeverity('medium');
        break;
      case 'puddle':
      case 'other':
        setSeverity('low');
        break;
      default:
        setSeverity('low');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
    if (!file) return;

    setPhoto(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadImageToSupabase = async (file: File, userId: string) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}.${fileExt}`;

  const { error } = await supabase.storage
    .from('incident-images')
    .upload(fileName, file, { upsert: false });

  if (error) throw error;

  const { data } = supabase.storage
    .from('incident-images')
    .getPublicUrl(fileName);

    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent submission if location is not available
    if (!lat || !lng || locationError) {
      toast.error('Location is required to submit a report. Please enable location access and try again.');
      return;
    }

    // v2 addition 1

    const newReport = {
      id: Date.now().toString(),
      type: issueType,
      severity,
      location,
      lat,
      lng,
      description,
      photo: photoUrl, // Supabase public URL
      status: 'pending',
      timestamp: new Date().toISOString(),
      userName: user.name || 'Anonymous',
      userEmail: user.email,
      aiVerified: true,
      departmentNotified: 'Public Works Dept',
      synced: true
    };

    // v2 addition 1 complete

    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');

    // old report structure before supabase integration

    // const newReport = {
    //   id: Date.now().toString(),
    //   type: issueType,
    //   severity: severity,
    //   location,
    //   lat: lat,
    //   lng: lng,
    //   description,
    //   photo,
    //   status: 'pending',
    //   timestamp: new Date().toISOString(),
    //   userName: user.name || 'Anonymous',
    //   userEmail: user.email,
    //   aiVerified: true,
    //   departmentNotified: 'Public Works Dept'

    // addition

    if (!user?.id) {
      toast.error('User not authenticated');
      return;
    }

    let photoUrl: string | null = null;

    try {
      if (photo) {
        photoUrl = await uploadImageToSupabase(photo, user.id);
      }
    } catch (err) {
      toast.error('Failed to upload image');
      return;
    }

    // addition complete

    // addition 2

    const { error: dbError } = await supabase
      .from('incidents')
      .insert([
        {
          user_id: user.id,
          incident_type: issueType,
          incident_desciption: description,
          severity,
          status: 'pending',
          location,
          photo_url: photoUrl,
          timestamp: new Date().toISOString()
        }
      ]);

    if (dbError) {
      toast.error('Failed to submit incident');
      return;
    }

    // addition 2 complete

    const existingReports = JSON.parse(localStorage.getItem('reports') || '[]');
    localStorage.setItem('reports', JSON.stringify([newReport, ...existingReports]));

    setSuccess(true);
  };
    // setTimeout(onSuccess, 2000);

  const getSeverityDotColor = (sev: string) => {
    switch (sev) {
      case 'critical': return 'bg-red-600';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-400';
    }
  };

  const getSeverityTextColor = (sev: string) => {
    switch (sev) {
      case 'critical': return 'text-red-700 bg-red-50 border-red-200';
      case 'high': return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-700 bg-blue-50 border-blue-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  if (success) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center animate-in fade-in">
        <div className="bg-green-50 p-8 rounded-2xl max-w-sm border border-green-100 shadow-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="text-green-600" size={32} />
          </div>
          <h3 className="text-xl font-bold text-green-900 mb-2">Report Submitted</h3>
          <p className="text-green-700">Thank you for helping make the city safer. Your report has been verified.</p>
        </div>
      </div>
    );
  }

  // If desktop, show restriction message
  if (!canReport) {
    return (
      <div className={`h-full flex items-center justify-center p-6 ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className={`max-w-md rounded-2xl shadow-lg border p-8 text-center ${
          isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
            isDark ? 'bg-blue-900' : 'bg-blue-100'
          }`}>
            <Monitor className={isDark ? 'text-blue-400' : 'text-blue-600'} size={40} />
          </div>
          <h3 className={`text-2xl mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Mobile Device Required
          </h3>
          <p className={`text-sm mb-6 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Incident reporting is only available on mobile devices and tablets for accurate location tracking and photo evidence capture.
          </p>
          <div className={`rounded-lg p-4 ${isDark ? 'bg-slate-700' : 'bg-blue-50'}`}>
            <p className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-800'}`}>
              💡 <span className="font-semibold">You can still:</span>
            </p>
            <ul className={`text-sm mt-2 space-y-1 text-left list-disc list-inside ${
              isDark ? 'text-gray-300' : 'text-gray-700'
            }`}>
              <li>View the live incident map</li>
              <li>Check your report history</li>
              <li>Monitor notifications and alerts</li>
              <li>Access your profile</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">⚠️ Report an Incident</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Incident Type */}
          <div>
            <label className="flex block text-sm font-medium text-gray-700 mb-3">Incident Type<p className="text-red-400">*</p></label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {issueTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                    issueType === type
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-[1.02]'
                      : 'bg-white text-gray-600 border-blue-600 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-assigned Severity Level Display */}
          {issueType && (
             <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex items-center justify-between transition-all animate-in fade-in slide-in-from-top-2">
               <span className="text-sm text-gray-600 font-medium">Severity Level :</span>
               
               <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border ${getSeverityTextColor(severity)}`}>
                 <span className={`w-2.5 h-2.5 rounded-full ${getSeverityDotColor(severity)} shadow-sm`} />
                 <span className="text-sm font-bold uppercase tracking-wide">{severity}</span>
               </div>
             </div>
          )}

          {/* Location */}
          <div>
            <label className="flex block text-sm font-medium text-gray-700 mb-2">
              Location <p className="text-red-400">*</p>
              <span className="ml-2 text-xs text-gray-500">(Auto-detected)</span>
            </label>
            <div className="relative">
              {isLoadingLocation && (
                <Navigation className="absolute left-3 top-3 text-blue-500 animate-pulse" size={20} />
              )}
              {!isLoadingLocation && !locationError && (
                <MapPin className="absolute left-3 top-3 text-green-500" size={20} />
              )}
              {locationError && (
                <MapPin className="absolute left-3 top-3 text-red-400" size={20} />
              )}
              <input
                type="text"
                value={location || (isLoadingLocation ? 'Detecting your location...' : 'Location unavailable')}
                readOnly
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none cursor-not-allowed transition-shadow ${
                  locationError 
                    ? 'border-red-300 bg-red-50' 
                    : isLoadingLocation
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-green-300 bg-green-50'
                }`}
                placeholder="Waiting for GPS coordinates..."
                required
              />
            </div>
            {isLoadingLocation && (
              <p className="text-sm text-blue-600 mt-1 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></span>
                Acquiring precise GPS location...
              </p>
            )}
            {!isLoadingLocation && !locationError && lat && lng && (
              <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 bg-green-600 rounded-full"></span>
                Location acquired successfully (Lat: {lat.toFixed(4)}, Lng: {lng.toFixed(4)})
              </p>
            )}
            {locationError && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 font-medium">⚠️ {locationError}</p>
                <p className="text-xs text-red-600 mt-1">You must enable location access to submit an incident report.</p>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="flex block text-sm font-medium text-gray-700 mb-2">Description<p className="text-red-400">*</p></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 border border-yellow-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none transition-shadow"
              placeholder="Describe the issue in detail..."
              required
            ></textarea>
          </div>

          {/* Photo Upload */}
          <div>
            <label className="flex block text-sm font-medium text-gray-700 mb-2">Evidence Photo<p className="text-red-400">*</p></label>
            <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${photo ? 'border-blue-200 bg-blue-50/30' : 'border-yellow-600 hover:bg-gray-50'}`}>
              {photoPreview ? (
                <div className="relative h-48 w-full group">
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-contain rounded-lg shadow-sm" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                     <button
                      type="button"
                      onClick={() => {
                        setPhoto(null);
                        setPhotoPreview(null);
                      }}
                      className="bg-white text-red-600 px-4 py-2 rounded-lg font-medium shadow-lg hover:bg-red-50 flex items-center gap-2"
                    >
                      <X size={16} /> Remove Photo
                    </button>
                  </div>
                </div>
              ) : (
                <label className="cursor-pointer block w-full h-full">
                  <Camera className="mx-auto mb-3 text-gray-400" size={40} />
                  <p className="text-gray-700 font-medium mb-1">Click to upload evidence</p>
                  <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
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

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
            <AlertCircle className="text-blue-700 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Smart Verification Active</p>
              <ul className="list-disc list-inside text-xs space-y-1 text-blue-800 opacity-90">
                <li>Verifying image location metadata</li>
                <li>Analyzing severity with AI models</li>
                <li>Route optimization for repair crews</li>
              </ul>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-700 border border-black-100 text-blue-900 py-4 rounded-xl hover:bg-blue-800 transition-all shadow-lg hover:shadow-blue-900/20 font-bold text-lg"
          >
            Submit Incident Report
          </button>
        </form>
      </div>
    </div>
  );
}
