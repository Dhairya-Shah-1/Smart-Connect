import { MapPin, AlertTriangle, Droplets, Flame, Car, Mountain, Shield, Zap, Users } from 'lucide-react';
import heroImage from 'figma:asset/a3b27285e66ad3a5cc9d090bb3cd22ade7b4992f.png';

type Page = 'landing' | 'login' | 'signup' | 'dashboard';

interface LandingPageProps {
  onNavigate: (page: Page) => void;
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  const issues = [
    { icon: Droplets, label: 'Floods & Puddles', color: 'text-blue-600' },
    { icon: AlertTriangle, label: 'Potholes', color: 'text-yellow-600' },
    { icon: Mountain, label: 'Landslides', color: 'text-orange-600' },
    { icon: Flame, label: 'Fire Hazards', color: 'text-red-600' },
    { icon: Car, label: 'Accidents', color: 'text-purple-600' },
    { icon: MapPin, label: 'Other Issues', color: 'text-green-600' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Shield className="text-blue-800" size={32} />
              <div>
                <span className="text-xl text-gray-900">CivicAlert</span>
                <p className="text-xs text-gray-600">Real-Time Incident Monitoring</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => onNavigate('login')}
                className="px-4 py-2 text-gray-700 hover:text-blue-800 transition-colors"
              >
                Login
              </button>
              <button
                onClick={() => onNavigate('signup')}
                className="px-6 py-2 bg-blue-800 text-white rounded-lg hover:bg-blue-900 transition-colors shadow-md"
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-4 py-2 rounded-full mb-6">
              <Zap className="text-blue-800" size={16} />
              <span className="text-sm text-blue-800">Powered by SmartConnect AI</span>
            </div>
            <h1 className="text-5xl mb-6 text-gray-900">
              Report &amp; Monitor Civic Incidents in Real-Time
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              A trusted platform for citizens and authorities to report, track, and resolve civic incidents with AI-powered verification and instant alerts.
            </p>
            <button
              onClick={() => onNavigate('signup')}
              className="px-8 py-4 bg-blue-800 text-white rounded-lg hover:bg-blue-900 transition-colors text-lg shadow-lg"
            >
              Start Reporting Now
            </button>
          </div>
          <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200">
            <img src={heroImage} alt="Civic issues illustration" className="w-full h-auto" />
          </div>
        </div>
      </div>

      {/* Trust Indicators */}
      <div className="bg-blue-800 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <Shield className="mx-auto mb-3" size={40} />
              <h3 className="text-2xl mb-2">AI-Verified</h3>
              <p className="text-blue-100">Every report verified for accuracy and authenticity</p>
            </div>
            <div>
              <Zap className="mx-auto mb-3" size={40} />
              <h3 className="text-2xl mb-2">Real-Time</h3>
              <p className="text-blue-100">Instant notifications and live incident tracking</p>
            </div>
            <div>
              <Users className="mx-auto mb-3" size={40} />
              <h3 className="text-2xl mb-2">Trusted</h3>
              <p className="text-blue-100">Direct connection to municipal authorities</p>
            </div>
          </div>
        </div>
      </div>

      {/* Issues Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl text-center mb-12 text-gray-900">What You Can Report</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {issues.map((issue) => (
            <div
              key={issue.label}
              className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow text-center border border-gray-200"
            >
              <issue.icon className={`mx-auto mb-3 ${issue.color}`} size={40} strokeWidth={2} />
              <p className="text-sm text-gray-700">{issue.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-slate-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl text-center mb-12 text-gray-900">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center bg-white p-8 rounded-xl shadow-sm border border-gray-200">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-blue-800">1</span>
              </div>
              <h3 className="text-xl mb-3 text-gray-900">Report Instantly</h3>
              <p className="text-gray-600">
                Spot an issue? Take a photo, select severity level, and submit with one tap.
              </p>
            </div>
            <div className="text-center bg-white p-8 rounded-xl shadow-sm border border-gray-200">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-blue-800">2</span>
              </div>
              <h3 className="text-xl mb-3 text-gray-900">AI Verification</h3>
              <p className="text-gray-600">
                Reports are verified by AI and routed to the correct department automatically.
              </p>
            </div>
            <div className="text-center bg-white p-8 rounded-xl shadow-sm border border-gray-200">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-blue-800">3</span>
              </div>
              <h3 className="text-xl mb-3 text-gray-900">Track Progress</h3>
              <p className="text-gray-600">
                Receive real-time updates and view resolution status on an interactive map.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600">
          <p>&copy; 2025 CivicAlert. Building safer communities through technology.</p>
        </div>
      </footer>
    </div>
  );
}