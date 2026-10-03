import { useEffect, useState } from 'react';
import { Loader2, UserPlus, Mail, Lock, User, Building2, MapPin, X } from 'lucide-react';
import { useTheme } from '../App';
import { supabase } from './supabaseClient';
import { toast } from 'sonner';
import { DEPARTMENT_OPTIONS } from '../config/departments';

interface AddAdminModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Viewport based check (< 768px = phone-sized screen). Deliberately not based on
// the user agent: the card must switch between the two-column desktop layout and
// the 2-step mobile wizard based on the actual space available, and it must keep
// working no matter how device detection classifies the device.
function useIsNarrowViewport() {
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return isNarrow;
}

export function AddAdminModal({ open, onClose, onCreated }: AddAdminModalProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  // Desktop → single card with two columns (credentials | details).
  // Mobile → two steps (1/2 credentials, 2/2 details).
  const isMobileView = useIsNarrowViewport();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset the form every time the card is opened.
  useEffect(() => {
    if (open) {
      setEmail('');
      setPassword('');
      setName('');
      setDepartment('');
      setLocation('');
      setStep(1);
      setError('');
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const validateCredentials = () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) return 'Email address is required';
    if (!EMAIL_PATTERN.test(trimmedEmail)) return 'Please enter a valid email address';
    if (trimmedPassword && trimmedPassword.length < 6) {
      return 'Password must be at least 6 characters, or leave it blank.';
    }
    return '';
  };

  const validateDetails = () => {
    if (!name.trim()) return "Admin's name is required";
    if (!department.trim()) return "Department name is required";
    if (!location.trim()) return 'Location is required';
    return '';
  };

  const handleSaveStep = () => {
    const message = validateCredentials();
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setStep(2);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // On mobile the first "page" only validates the credentials and moves on.
    if (isMobileView && step === 1) {
      handleSaveStep();
      return;
    }

    const credentialsError = validateCredentials();
    if (credentialsError) {
      setError(credentialsError);
      setStep(1);
      return;
    }

    const detailsError = validateDetails();
    if (detailsError) {
      setError(detailsError);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Your session has expired. Please log in again.');
      }

      const response = await fetch('/api/manage-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim() || undefined,
          name: name.trim(),
          department_name: department.trim(),
          location: location.trim(),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to add the admin');
      }

      toast.success(payload?.message || 'Admin added successfully');
      onCreated?.();
      onClose();
    } catch (err: any) {
      console.error('Add admin error:', err);
      setError(err?.message || 'Failed to add the admin');
    } finally {
      setLoading(false);
    }
  };

  const cardClass = `relative w-full ${isMobileView ? 'max-w-md' : 'max-w-3xl'} rounded-2xl border p-6 sm:p-8 shadow-2xl ${
    isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
  }`;
  const titleClass = isDark ? 'text-gray-100' : 'text-gray-900';
  const mutedClass = isDark ? 'text-gray-400' : 'text-gray-500';
  const labelClass = `block text-sm mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`;
  const inputClass = `w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 ${
    isDark
      ? 'border-slate-600 bg-slate-900 text-gray-100 placeholder:text-gray-500'
      : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400'
  }`;
  const iconClass = `pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${mutedClass}`;
  const errorClass = `px-4 py-3 rounded-lg text-sm border ${
    isDark ? 'bg-red-950/40 text-red-300 border-red-800' : 'bg-red-50 text-red-600 border-red-200'
  }`;
  const primaryButtonClass =
    'flex items-center justify-center gap-2 rounded-lg bg-purple-700 py-3 px-6 text-white shadow-md transition-colors hover:bg-purple-800 disabled:opacity-70';
  const secondaryButtonClass = `rounded-lg border py-3 px-6 transition-colors ${
    isDark
      ? 'border-slate-600 bg-slate-900 text-gray-200 hover:bg-slate-700'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
  }`;

  const emailField = (
    <div>
      <label className={labelClass} htmlFor="admin-email">
        Email Address
      </label>
      <div className="relative">
        <Mail size={16} className={iconClass} />
        <input
          id="admin-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`${inputClass} pl-10`}
          placeholder="admin@example.com"
          autoComplete="off"
        />
      </div>
    </div>
  );

  const passwordField = (
    <div>
      <label className={labelClass} htmlFor="admin-password">
        Password <span className={`text-xs font-normal ${mutedClass}`}>(optional)</span>
      </label>
      <div className="relative">
        <Lock size={16} className={iconClass} />
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={`${inputClass} pl-10`}
          placeholder="Leave blank for Google sign-in"
          autoComplete="new-password"
        />
      </div>
      <p className={`mt-2 text-xs leading-relaxed ${mutedClass}`}>
        Leave this blank if the admin will sign in with Google using this email. A password is only needed for
        email/password sign-in.
      </p>
    </div>
  );

  const nameField = (
    <div>
      <label className={labelClass} htmlFor="admin-name">
        Admin Name
      </label>
      <div className="relative">
        <User size={16} className={iconClass} />
        <input
          id="admin-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${inputClass} pl-10`}
          placeholder="e.g. John Doe"
          autoComplete="off"
        />
      </div>
    </div>
  );

  const departmentField = (
    <div>
      <label className={labelClass} htmlFor="admin-department">
        Department Name
      </label>
      <div className="relative">
        <Building2 size={16} className={iconClass} />
        <select
          id="admin-department"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          className={`${inputClass} cursor-pointer appearance-none pl-10 pr-10`}
        >
          <option value="" disabled>
            Select a department
          </option>
          {DEPARTMENT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${mutedClass}`}
        >
          ▾
        </span>
      </div>
    </div>
  );

  const locationField = (
    <div>
      <label className={labelClass} htmlFor="admin-location">
        Location
      </label>
      <div className="relative">
        <MapPin size={16} className={iconClass} />
        <input
          id="admin-location"
          type="text"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className={`${inputClass} pl-10`}
          placeholder="e.g. Vadodara, Gujarat"
          autoComplete="off"
        />
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto hide-scrollbar bg-black/60 px-4 py-6"
      onMouseDown={() => {
        if (!loading) onClose();
      }}
    >
      <div className={cardClass} onMouseDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className={`absolute right-4 top-4 rounded-lg p-1.5 transition-colors ${
            isDark ? 'text-gray-400 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-100'
          }`}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-full ${
              isDark ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-700'
            }`}
          >
            <UserPlus size={22} />
          </div>
          <div>
            <h2 className={`text-xl font-bold ${titleClass}`}>Add New Admin</h2>
            <p className={`text-xs ${mutedClass}`}>Create an admin account and assign its details</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {isMobileView ? (
            step === 1 ? (
              <div className="space-y-5">
                {emailField}
                {passwordField}
              </div>
            ) : (
              <div className="space-y-5">
                {nameField}
                {departmentField}
                {locationField}
              </div>
            )
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-5">
                {emailField}
                {passwordField}
              </div>
              <div className="space-y-5">
                {nameField}
                {departmentField}
                {locationField}
              </div>
            </div>
          )}

          {error && <div className={errorClass}>{error}</div>}

          {isMobileView ? (
            step === 1 ? (
              <div className="mt-6">
                <div className="mb-2 flex justify-end">
                  <span className={`text-xs font-semibold ${mutedClass}`}>1/2</span>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className={`flex-1 ${secondaryButtonClass}`}
                  >
                    Cancel
                  </button>
                  <button type="button" onClick={handleSaveStep} className={`flex-1 ${primaryButtonClass}`}>
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <div className="mb-2 flex justify-end">
                  <span className={`text-xs font-semibold ${mutedClass}`}>2/2</span>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setStep(1);
                    }}
                    disabled={loading}
                    className={`flex-1 ${secondaryButtonClass}`}
                  >
                    Back
                  </button>
                  <button type="submit" disabled={loading} className={`flex-1 ${primaryButtonClass}`}>
                    {loading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Adding...
                      </>
                    ) : (
                      'Add Admin'
                    )}
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={onClose} disabled={loading} className={secondaryButtonClass}>
                Cancel
              </button>
              <button type="submit" disabled={loading} className={primaryButtonClass}>
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Admin'
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default AddAdminModal;
