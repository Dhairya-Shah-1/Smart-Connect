import { MapPin, AlertTriangle, Droplets, Flame, Car, Mountain, Sun, Moon, LogOut } from "lucide-react";
import { isMobileOrTablet } from "../utils/deviceDetection";
import shieldIcon from '../assets/Logos_and_icons/Shield(Gemini)(without-bg).png';
import VerifiedIcon from '../assets/Logos_and_icons/Verified(Gemini)(without-bg).png';
import LightningIcon from '../assets/Logos_and_icons/Lightning_(Image_by_starline_on_freepik)_2_(without-bg).png';
import PeopleIcon from '../assets/Logos_and_icons/People(Gemini)(without-bg).png';
import geminiIcon from '../assets/Logos_and_icons/Google_Gemini_icon.png';
import heroImage from '../assets/LandingPageImage.png';

import { useTheme } from "../App";

type Page = "landing" | "login" | "signup" | "dashboard";

interface LandingPageProps {
  onNavigate: (page: Page) => void;
  isLoggedIn: boolean;
  onLogout: () => void;
}

export function LandingPage({
  onNavigate,
  isLoggedIn,
  onLogout,
}: LandingPageProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const isMobile = isMobileOrTablet(); // Execute function to get boolean

  const issues = [
    {
      icon: Droplets,
      label: "Floods & Puddles",
      color: isDark ? "text-blue-400" : "text-blue-600",
    },
    {
      icon: AlertTriangle,
      label: "Potholes",
      color: isDark ? "text-yellow-400" : "text-yellow-600",
    },
    {
      icon: Mountain,
      label: "Landslides",
      color: isDark ? "text-orange-400" : "text-orange-600",
    },
    {
      icon: Flame,
      label: "Fire Hazards",
      color: isDark ? "text-red-400" : "text-red-600",
    },
    {
      icon: Car,
      label: "Accidents",
      color: isDark ? "text-purple-400" : "text-purple-600",
    },
    {
      icon: MapPin,
      label: "Other Issues",
      color: isDark ? "text-green-400" : "text-green-600",
    },
  ];

  const handleStartReporting = () => {
    if (isLoggedIn) {
      onNavigate("dashboard");
    } else {
      onNavigate("signup");
    }
  };

  return (
    <div
      className={`min-h-screen ${!isMobile ? "" : ""} ${isDark ? "bg-gradient-to-b from-slate-800 to-slate-900" : "bg-gradient-to-b from-slate-50 to-white"}`}
    >
      {/* Navigation */}
      <nav
        className={`${isDark ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-gray-200"} sticky top-0 shadow-sm border-b`}
      >
        {" "}
        {/* sticky top-0 */}
        <div
          className={`max-w-7xl mx-auto min-h-screen" ${isMobile ? "px-1.5 sm:px-1.5 lg:px-1.5 py-0\.5" : "px-6 sm:px-3 lg:px-3 py-3"}`}
        >
          {/* px-6 sm:px-3 lg:px-3 py-2 */}
          <div className="flex justify-between items-center">
            <div
              className={`flex items-center ${isMobile ? "gap-2" : "gap-3"}`}
            >
              <img
                src={shieldIcon}
                alt="Shield Icon"
                className={`object-contain ${isMobile ? "w-13 h-13" : "w-16 h-16"}`}
              />
              <div>
                <span
                  className={`text-l font-bold block ${isDark ? "text-gray-100" : "text-gray-900"}`}
                >
                  Smart Connect
                </span>
                {!isMobile && (
                  <p
                    className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                  >
                    Real-Time Incident Monitoring
                  </p>
                )}
              </div>
            </div>

            <div
              className={`flex items-center ${isMobile ? "text-xs gap-0\.5 px-2 sm:px-2 lg:px-2 py-2" : "gap-6 px-6 sm:px-3 lg:px-3 py-2"}`}
            >
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-lg transition-colors ${
                  isDark
                    ? "bg-slate-700 text-yellow-400 hover:bg-slate-600"
                    : "bg-slate-200 text-gray-600 hover:text-blue-800"
                }`}
                aria-label="Toggle theme"
              >
                {isDark ? (
                  <Sun size={20} />
                ) : (
                  <Moon size={20} />
                )}
              </button>

              {!isLoggedIn ? (
                <>
                  <button
                    onClick={() => onNavigate("login")}
                    className={`px-4 py-2 transition-colors ${
                      isDark
                        ? "text-gray-300 hover:text-blue-400"
                        : "text-gray-700 hover:text-blue-800"
                    }`}
                  >
                    Login
                  </button>
                  <button
                    onClick={() => onNavigate("signup")}
                    className={` ${isMobile ? "inline-flex mx-auto px-5 py-2" : "px-6 py-2"} rounded-lg transition-colors shadow-md ${
                      isDark
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-blue-800 text-white hover:bg-blue-900"
                    }`}
                  >
                    Sign Up
                  </button>
                </>
              ) : (
                    <button
                      onClick={onLogout} className={`gap-2 flex items-center px-2 py-2 rounded-lg transition-colors border
                      ${ !isMobile ? "small" : "" }
                      ${ isDark
                        ? "bg-transparent text-blue-300 border-red-500 hover:text-red-300"
                        : "bg-white border-red-200 text-blue-600 hover:text-red-600"
                       }`}
                    >
                      <LogOut size={16} />
                      <span>Log Out</span>
                    </button>
                )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {" "}
        {/* py-11 */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 ${
                isDark
                  ? "bg-blue-900 border-blue-700"
                  : "bg-blue-50 border-blue-200"
              } border`}
            >
              <img
                src={geminiIcon}
                alt="Gemini Icon"
                className={` ${isMobile ? "w-4 h-4" : "w-6 h-6"}`}
              />
              <span
                className={`text-sm ${isDark ? "text-blue-300" : "text-blue-800"}`}
              >
                Reviewed by Gemini AI
              </span>
            </div>
            <h1
              className={`text-3xl font-bold mb-6 ${isDark ? "text-gray-100" : "text-gray-900"}`}
            >
              Report & Monitor Civic Incidents in Real-Time
            </h1>
            <p
              className={`text-lg mb-8 ${isDark ? "text-gray-300" : "text-gray-600"}`}
            >
              A trusted platform for citizens and authorities to
              report, track, and resolve civic incidents with
              AI-powered verification and instant alerts.
            </p>
            <button
              onClick={handleStartReporting}
              className={`px-8 py-4 rounded-lg transition-colors text-lg font-semibold shadow-lg ${
                isDark
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-blue-800 text-white hover:bg-blue-900"
              }`}
            >
              {isLoggedIn
                ? "Go to Dashboard"
                : "Start Reporting Now"}
            </button>
          </div>
          <div
            className={`rounded-2xl overflow-hidden shadow-2xl ${isDark ? "border-slate-700" : "border-gray-200"} border`}
          >
            <img
              src={heroImage}
              alt="Civic incident illustration"
              className="w-full h-auto"
            />
          </div>
        </div>
      </div>

      {/* Trust Indicators */}
      <div
        className={`py-12 ${isDark ? "bg-slate-800" : "bg-blue-800"} text-white`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <img
                src={VerifiedIcon}
                alt="Verified Icon"
                className="mx-auto mb-3 w-14 h-14"
              />
              <h3 className="text-2xl font-semibold mb-2">
                AI-Verified
              </h3>
              <p
                className={
                  isDark ? "text-gray-300" : "text-blue-100"
                }
              >
                Every report verified for accuracy and
                authenticity
              </p>
            </div>
            <div>
              <img
                src={LightningIcon}
                alt="Lightning Icon"
                className="mx-auto mb-3 w-14 h-14"
              />
              <h3 className="text-2xl font-semibold mb-2">
                Real-Time
              </h3>
              <p
                className={
                  isDark ? "text-gray-300" : "text-blue-100"
                }
              >
                Instant notifications and live incident tracking
              </p>
            </div>
            <div>
              <img
                src={PeopleIcon}
                alt="People Icon"
                className="mx-auto mb-3 w-14 h-14"
              />
              <h3 className="text-2xl font-semibold mb-2">
                Trusted
              </h3>
              <p
                className={
                  isDark ? "text-gray-300" : "text-blue-100"
                }
              >
                Direct connection to municipal authorities
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Issues Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2
          className={`text-3xl font-bold text-center mb-12 ${isDark ? "text-gray-100" : "text-gray-900"}`}
        >
          What You Can Report?
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {issues.map((issue) => (
            <div
              key={issue.label}
              className={`p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow text-center border ${
                isDark
                  ? "bg-slate-800 border-slate-700"
                  : "bg-slate-50 border-gray-200"
              }`}
            >
              <issue.icon
                className={`mx-auto mb-3 ${issue.color}`}
                size={40}
                strokeWidth={2}
              />
              <p
                className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}
              >
                {issue.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Features Section */}
      <div
        className={`py-16 ${isDark ? "bg-slate-800" : "bg-blue-800"}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2
            className={`text-3xl font-bold text-center mb-12 ${isDark ? "text-gray-100" : "text-white"}`}
          >
            How It Works?
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Report Instantly",
                desc: "Spot an issue? Take a photo, select severity level, and submit with one tap.",
              },
              {
                step: "2",
                title: "AI Verification",
                desc: "Reports are verified by AI and routed to the correct department automatically.",
              },
              {
                step: "3",
                title: "Track Progress",
                desc: "Receive real-time updates and view resolution status on an interactive map.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className={`text-center p-8 rounded-xl shadow-sm border ${
                  isDark
                    ? "bg-slate-700 border-slate-600"
                    : "bg-white border-gray-200"
                }`}
              >
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                    isDark ? "bg-blue-900" : "bg-blue-100"
                  }`}
                >
                  <span
                    className={`text-2xl font-bold ${isDark ? "text-white" : "text-blue-800"}`}
                  >
                    {item.step}
                  </span>
                </div>
                <h3
                  className={`text-xl font-semibold mb-3 ${isDark ? "text-gray-100" : "text-gray-900"}`}
                >
                  {item.title}
                </h3>
                <p
                  className={
                    isDark ? "text-gray-300" : "text-gray-600"
                  }
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer
        className={`py-8 border-t ${isDark ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-gray-200"}`}
      >
        <div
          className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center ${isDark ? "text-gray-400" : "text-gray-600"}`}
        >
          <p>
            &copy; 2025 Smart Connect. Building safer
            communities through technology.
          </p>
        </div>
      </footer>
    </div>
  );
}
