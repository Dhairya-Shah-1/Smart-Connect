import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ASSETS } from '../config/assets';
import { ArrowLeft, Loader2, Mail, CheckCircle, Moon, Sun } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useTheme } from '../App';

const authPageClass = 'hide-scrollbar relative min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 flex items-center justify-center px-4 py-8';
const authCardClass = 'bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-gray-200 dark:border-slate-700';
const authTitleClass = 'text-gray-900 dark:text-gray-100';
const authMutedClass = 'text-gray-600 dark:text-gray-400';
const authLabelClass = 'block text-sm mb-2 text-gray-700 dark:text-gray-300';
const authInputClass = 'w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-800 dark:focus:ring-blue-500';
const authBackClass = 'flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-blue-800 dark:hover:text-blue-300 mb-8 transition-colors';
const authSecondaryButtonClass = 'w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors';
const authErrorClass = 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 px-4 py-3 rounded-lg text-sm border border-red-200 dark:border-red-800';

function AuthThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className="absolute right-4 top-4 z-10 p-2 rounded-lg transition-colors bg-white text-gray-700 hover:bg-gray-100 dark:bg-slate-800 dark:text-yellow-400 dark:hover:bg-slate-700"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function SignUpPage() {
  const navigate = useNavigate();
  const [signupMethod, setSignupMethod] = useState<'manual' | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (signUpError) throw signUpError;

      if (data.user) {
        const { error: profileError } = await supabase.from('users').insert([
          {
            u_id: data.user.id,
            u_name: name,
            u_email: email,
          },
        ]);

        if (profileError) {
          console.error('Error creating user profile:', profileError);
        }
      }

      setEmailSent(true);
    } catch (err: any) {
      console.error('Signup Error:', err);
      setError(err.message || 'Error creating account');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError('');
    setGoogleLoading(true);

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login`,
        },
      });

      if (oauthError) throw oauthError;
    } catch (err: any) {
      console.error('Google Signup Error:', err);
      setError(err.message || 'Failed to start Google sign up');
      setGoogleLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className={authPageClass}>
        <AuthThemeToggle />
        <div className={`max-w-md w-full text-center ${authCardClass}`}>
          <div className="w-20 h-20 bg-blue-50 dark:bg-blue-950/50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="text-blue-600 dark:text-blue-400" size={40} />
          </div>

          <h2 className={`text-2xl mb-3 ${authTitleClass}`}>Check your inbox</h2>

          <p className={`${authMutedClass} mb-6`}>
            We sent a verification link to <br />
            <span className={`font-semibold ${authTitleClass}`}>{email}</span>
          </p>

          <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-xl border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200 mb-8 text-left flex gap-3">
            <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />
            <p>
              Click the link in the email to activate your account. You'll be able to log in after
              verification.
            </p>
          </div>

          <button
            onClick={() => navigate('/login')}
            className={authSecondaryButtonClass}
          >
            Back to Login
          </button>

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">Didn't receive the email? Check your spam folder.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={authPageClass}>
      <AuthThemeToggle />
      <div className="max-w-md w-full">
        <button
          onClick={() => navigate('/')}
          className={authBackClass}
        >
          <ArrowLeft size={20} />
          Back to Home
        </button>

        <div className={authCardClass}>
          <div className="flex items-center justify-center gap-3 mb-8">
            <img src={ASSETS.Shield} alt="Shield Icon" className="inline-flex w-12" />
            <div className="text-center">
              <span className={`text-2xl ${authTitleClass}`}>Smart Connect</span>
              <p className={`text-xs ${authMutedClass}`}>Create Account</p>
            </div>
          </div>

          <h2 className={`text-3xl text-center mb-8 ${authTitleClass}`}>Join the Platform</h2>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={googleLoading}
              className="w-full bg-white dark:bg-slate-900 border border-gray-400 dark:border-slate-600 text-gray-700 dark:text-gray-200 py-1.5 rounded-full hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors shadow-sm flex justify-center items-center gap-2"
            >
              {googleLoading ? (
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <>
                  <img src={ASSETS.GoogleIcon} alt="Google" className="w-9 h-9 rounded-full" />
                  Sign In with Google
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setError('');
                setSignupMethod('manual');
              }}
              className="w-full bg-blue-800 text-white py-3 rounded-full hover:bg-blue-900 transition-colors shadow-md"
            >
              Enter details manually
            </button>
          </div>

          {signupMethod === 'manual' && (
            <form onSubmit={handleSubmit} className="space-y-6 mt-6">
              <div>
                <label className={authLabelClass}>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={authInputClass}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <label className={authLabelClass}>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={authInputClass}
                  placeholder="your@email.com"
                  required
                />
              </div>

              <div>
                <label className={authLabelClass}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={authInputClass}
                  placeholder="........"
                  required
                />
              </div>

              <div>
                <label className={authLabelClass}>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={authInputClass}
                  placeholder="........"
                  required
                />
              </div>

              {error && (
                <div className={authErrorClass}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-800 text-white py-3 rounded-lg hover:bg-blue-900 transition-colors shadow-md flex justify-center items-center"
              >
                {loading ? <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /> : 'Sign Up'}
              </button>
            </form>
          )}

          {signupMethod !== 'manual' && error && (
            <div className={`${authErrorClass} mt-6`}>
              {error}
            </div>
          )}

          <p className={`text-center mt-6 ${authMutedClass}`}>
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} className="text-blue-800 dark:text-blue-300 hover:underline">
              Log in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignUpPage;
