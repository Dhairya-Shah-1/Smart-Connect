import { useState } from 'react';
import { Camera, MapPin, AlertCircle, ShieldCheck } from 'lucide-react';

interface ReportIssueProps {
  onSuccess: () => void;
}

export function ReportIssue({ onSuccess }: ReportIssueProps) {
  const [issueType, setIssueType] = useState('');
  const [severity, setSeverity] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const issueTypes = [
    'Flood',
    'Puddle',
    'Pothole',
    'Landslide',
    'Fire',
    'Accident',
    'Other',
  ];

  const severityLevels = [
    { value: 'low', label: 'Low', color: 'bg-blue-500', description: 'Minor inconvenience' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-500', description: 'Moderate impact' },
    { value: 'high', label: 'High', color: 'bg-orange-500', description: 'Significant concern' },
    { value: 'critical', label: 'Critical', color: 'bg-red-600', description: 'Immediate danger' },
  ];

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const reports = JSON.parse(localStorage.getItem('reports') || '[]');

    // Determine department based on issue type
    const getDepartment = (type: string) => {
      switch(type.toLowerCase()) {
        case 'flood':
        case 'puddle':
          return 'Water Management';
        case 'pothole':
          return 'Road Maintenance';
        case 'fire':
          return 'Fire Department';
        case 'accident':
          return 'Traffic Police';
        case 'landslide':
          return 'Disaster Management';
        default:
          return 'Municipal Authority';
      }
    };

    const newReport = {
      id: Date.now().toString(),
      type: issueType,
      severity: severity,
      location,
      description,
      photo,
      userEmail: user.email,
      userName: user.name,
      status: 'pending',
      timestamp: new Date().toISOString(),
      lat: 40.7128 + (Math.random() - 0.5) * 0.1,
      lng: -74.0060 + (Math.random() - 0.5) * 0.1,
      aiVerified: Math.random() > 0.3, // Simulate AI verification
      departmentNotified: getDepartment(issueType),
    };

    reports.push(newReport);
    localStorage.setItem('reports', JSON.stringify(reports));

    setSuccess(true);
    setTimeout(() => {
      onSuccess();
    }, 2000);
  };

  if (success) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
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
          <h2 className="text-2xl mb-3 text-gray-900">Incident Report Submitted</h2>
          <div className="flex items-center justify-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
            <ShieldCheck className="text-green-700" size={20} />
            <span className="text-sm text-green-800">AI verification in progress</span>
          </div>
          <p className="text-gray-600">
            Local authorities have been notified. You'll receive real-time updates on the resolution progress.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-2xl mx-auto p-6">
        <h2 className="text-2xl mb-2 text-gray-900">Report Civic Incident</h2>
        <p className="text-sm text-gray-600 mb-6">Provide detailed information for faster response</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm mb-2 text-gray-900">
              Incident Type <span className="text-red-600">*</span>
            </label>
            <select
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800 text-gray-900"
              required
            >
              <option value="">Select incident type</option>
              {issueTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-900">
              Severity Level <span className="text-red-600">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {severityLevels.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setSeverity(level.value)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    severity === level.value
                      ? 'border-blue-800 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 ${level.color} rounded-full`}></div>
                    <span className="text-sm text-gray-900">{level.label}</span>
                  </div>
                  <p className="text-xs text-gray-600">{level.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-900">
              Location <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3.5 text-gray-400" size={20} />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="Enter address or landmark"
                required
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Or enable GPS for automatic location detection
            </p>
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-900">
              Description <span className="text-red-600">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800 min-h-[120px]"
              placeholder="Provide specific details about the incident..."
              required
            ></textarea>
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-900">
              Upload Evidence Photo <span className="text-gray-500">(Recommended)</span>
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-800 transition-colors">
              {photo ? (
                <div className="relative">
                  <img
                    src={photo}
                    alt="Uploaded"
                    className="max-h-48 mx-auto rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="mt-3 text-red-600 hover:underline text-sm"
                  >
                    Remove photo
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <Camera className="mx-auto mb-3 text-gray-400" size={40} />
                  <p className="text-gray-700 mb-1">Click to upload evidence</p>
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

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="text-blue-800 flex-shrink-0" size={20} />
            <div className="text-sm text-blue-900">
              <p className="mb-1">Your report will be:</p>
              <ul className="list-disc list-inside text-xs space-y-1 text-blue-800">
                <li>Verified by AI for accuracy</li>
                <li>Forwarded to the appropriate department</li>
                <li>Tracked with real-time status updates</li>
              </ul>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-800 text-white py-4 rounded-lg hover:bg-blue-900 transition-colors shadow-lg"
          >
            Submit Incident Report
          </button>
        </form>
      </div>
    </div>
  );
}