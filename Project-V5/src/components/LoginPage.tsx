import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ASSETS } from '../config/assets';
import { ArrowLeft, Mail, CheckCircle, Loader2, Moon, Sun } from 'lucide-react';
import { supabase } from './supabaseClient';
import { notifyCurrentUserChanged, useTheme } from '../App';

type LoginView = 'login' | 'forgot-password' | 'email-sent' | 'update-password';

const authPageClass = 'relative min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 flex items-center justify-center px-4';
const authCardClass = 'bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-gray-200 dark:border-slate-700';
const authTitleClass = 'text-gray-900 dark:text-gray-100';
const authMutedClass = 'text-gray-600 dark:text-gray-400';
const authLabelClass = 'block text-sm mb-2 text-gray-700 dark:text-gray-100';
const authInputClass = 'w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-2xl bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-800 dark:focus:ring-blue-600';
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

// Separate component for password update (shown when user clicks email link)
function UpdatePasswordView() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      setSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);

    } catch (err: any) {
      console.error('Update Password Error:', err);
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={authPageClass}>
        <AuthThemeToggle />
        <div className={`max-w-md w-full text-center ${authCardClass}`}>
          <div className="w-20 h-20 bg-green-50 dark:bg-green-950/50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="text-green-600 dark:text-green-400" size={40} />
          </div>
          <h2 className={`text-2xl mb-3 ${authTitleClass}`}>Password Updated!</h2>
          <p className={`${authMutedClass} mb-6`}>
            Your password has been successfully updated. Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={authPageClass}>
      <AuthThemeToggle />
      <div className="max-w-md w-full">
        <button
          onClick={() => navigate('/login')}
          className={authBackClass}
        >
          <ArrowLeft size={20} />
          Back to Login
        </button>

        <div className={authCardClass}>
          <div className="flex items-center justify-center gap-3 mb-8">
            <img src={ASSETS.Shield} alt="Shield Icon" className="inline-flex w-12" />
            <div className="text-center">
              <span className={`text-2xl ${authTitleClass}`}>Smart Connect</span>
              <p className={`text-xs ${authMutedClass}`}>Reset Password</p>
            </div>
          </div>

          <h2 className={`text-2xl text-center mb-8 ${authTitleClass}`}>Create New Password</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className={authLabelClass}>
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={authInputClass}
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className={authLabelClass}>
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={authInputClass}
                placeholder="••••••••"
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
              {loading ? (
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                'Change Password'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Main Login Page Component
export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // All state hooks at the top - always call them in the same order
  const [view, setView] = useState<LoginView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  
  // Check if this is a password reset from email link
  const token = searchParams.get('token');
  const type = searchParams.get('type');
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hashType = hashParams.get('type');
  const isRecoveryLink = (token && type === 'recovery') || hashType === 'recovery';

  // Initialize view based on URL params (only once on mount)
  useEffect(() => {
    // Check if redirected from password reset success
    const params = new URLSearchParams(window.location.search);
    if (params.get('password_updated') === 'true') {
      setView('login');
      // Clean up URL
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  useEffect(() => {
    if (isRecoveryLink) {
      setView('update-password');
    }

    if (hashType === 'recovery') {
      setView('update-password');
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setView('update-password');
      }
      if (event === 'SIGNED_IN' && session?.user && view === 'login') {
        void resolveRoleAndRedirect(session.user).catch((err: any) => {
          console.error('OAuth Sign-In Processing Error:', err);
          setError(err.message || 'Failed to complete sign in');
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [hashType, isRecoveryLink]);

  const resolveRoleAndRedirect = async (user: any) => {
    let role: 'user' | 'admin' | 'super_admin' = 'user';
    let profileData: any = null;

    const { data: sa } = await supabase
      .from('super_admins')
      .select('*')
      .eq('sa_id', user.id)
      .maybeSingle();

    if (sa) {
      role = 'super_admin';
      profileData = sa;
    } else {
      const { data: admin } = await supabase
        .from('admins')
        .select('*')
        .eq('a_id', user.id)
        .maybeSingle();

      if (admin) {
        role = 'admin';
        profileData = admin;
      } else {
        const { data: usr } = await supabase
          .from('users')
          .select('*')
          .eq('u_id', user.id)
          .maybeSingle();

        if (usr) {
          role = 'user';
          profileData = usr;
        } else {
          const fallbackName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User';
          const { error: insertError } = await supabase.from('users').insert([
            {
              u_id: user.id,
              u_name: fallbackName,
              u_email: user.email,
            },
          ]);

          if (insertError) {
            console.error('User profile bootstrap error:', insertError);
          } else {
            profileData = {
              u_id: user.id,
              u_name: fallbackName,
              u_email: user.email,
            };
          }
        }
      }
    }

    const resolvedName =
      profileData?.sa_name ??
      profileData?.a_name ??
      profileData?.u_name ??
      user.user_metadata?.full_name ??
      user.email?.split('@')[0];

    const currentUser = {
      id: user.id,
      email: user.email,
      role,
      name: resolvedName,
      profile: profileData,
    };

    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    notifyCurrentUserChanged();

    if (role === 'super_admin') {
      navigate('/super-admin');
    } else if (role === 'admin') {
      navigate('/admin');
    } else {
      navigate('/dashboard');
    }
  };

  useEffect(() => {
    if (view !== 'login') return;

    const oauthError =
      searchParams.get('error_description') || searchParams.get('error');
    if (oauthError) {
      setError(oauthError);
      return;
    }

    const finalizeOAuthLogin = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session?.user) return;

        await resolveRoleAndRedirect(data.session.user);
      } catch (err: any) {
        console.error('OAuth Session Error:', err);
        setError(err.message || 'Failed to complete sign in');
      }
    };

    finalizeOAuthLogin();
  }, [searchParams, view]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Authenticate using Supabase Auth
      const { data: { user }, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError) throw authError;
      if (!user) throw new Error('User not found');

      await resolveRoleAndRedirect(user);

    } catch (err: any) {
      console.error('Login Error:', err);
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
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
      console.error('Google Login Error:', err);
      setError(err.message || 'Failed to start Google sign in');
      setGoogleLoading(false);
    }
  };

  // Handle forgot password request
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        resetEmail,
        {
          redirectTo: `${window.location.origin}/login`,
        }
      );

      if (resetError) throw resetError;

      setView('email-sent');
    } catch (err: any) {
      console.error('Reset Password Error:', err);
      setError(err.message || 'Failed to send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  // Render based on view state
  const renderView = () => {
    switch (view) {
      case 'email-sent':
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

              <div className={`text-center ${authCardClass}`}>
                <div className="w-20 h-20 bg-blue-50 dark:bg-blue-950/50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Mail className="text-blue-600 dark:text-blue-400" size={40} />
                </div>

                <h2 className={`text-2xl mb-3 ${authTitleClass}`}>Check your inbox</h2>

                <p className={`${authMutedClass} mb-6`}>
                  We sent a password reset link to <br />
                  <span className={`font-semibold ${authTitleClass}`}>{resetEmail}</span>
                </p>

                <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-xl border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200 mb-8 text-left flex gap-3">
                  <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />
                  <p>
                    Click the link in the email to reset your password.
                  </p>
                </div>

                <button
                  onClick={() => setView('login')}
                  className={authSecondaryButtonClass}
                >
                  Back to Login
                </button>
              </div>
            </div>
          </div>
        );

      case 'forgot-password':
        return (
          <div className={authPageClass}>
            <AuthThemeToggle />
            <div className="max-w-md w-full">
              <button
                onClick={() => setView('login')}
                className={authBackClass}
              >
                <ArrowLeft size={20} />
                Back to Login
              </button>

              <div className={authCardClass}>
                <div className="flex items-center justify-center gap-3 mb-8">
                  <img src={ASSETS.Shield} alt="Shield Icon" className="inline-flex w-12" />
                  <div className="text-center">
                    <span className={`text-2xl ${authTitleClass}`}>Smart Connect</span>
                    <p className={`text-xs ${authMutedClass}`}>Reset Password</p>
                  </div>
                </div>

                <h2 className={`text-2xl text-center mb-2 ${authTitleClass}`}>Forgot Password?</h2>
                <p className={`${authMutedClass} text-center mb-6`}>
                  Enter your email and we'll send you a link to reset your password.
                </p>

                <form onSubmit={handleForgotPassword} className="space-y-6">
                  <div>
                    <label htmlFor="resetEmail" className={authLabelClass}>
                      Email Address
                    </label>
                    <input
                      id="resetEmail"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className={authInputClass}
                      placeholder="your@email.com"
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
                    disabled={resetLoading}
                    className="w-full bg-blue-800 text-white py-3 rounded-lg hover:bg-blue-900 transition-colors shadow-md flex justify-center items-center"
                  >
                    {resetLoading ? (
                      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      'Send Reset Link'
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        );

      case 'update-password':
        return <UpdatePasswordView />;

      case 'login':
      default:
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
                <div className="flex items-center justify-center gap-3 mb-6">
                  <img src={ASSETS.Shield} alt="Shield Icon" className="inline-flex w-12" />
                  <div className="text-center">
                    <span className={`text-2xl ${authTitleClass}`}>Smart Connect</span>
                    <p className={`text-sm ${authMutedClass}`}>Secure Login</p>
                  </div>
                </div>

                <h2 className={`text-xl text-center mb-8 ${authTitleClass}`}>Welcome Back..!</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="email" className={authLabelClass}>
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={authInputClass}
                      placeholder="your@email.com"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className={authLabelClass}>
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={authInputClass}
                      placeholder="••••••••"
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
                    className="w-full bg-blue-800 text-white py-3 rounded-2xl hover:bg-blue-900 transition-colors shadow-md flex justify-center items-center"
                  >
                    {loading ? (
                      <Loader2
                        size={24}
                        style={{
                          animation: 'spin 1s linear infinite',
                        }}
                      />
                    ) : (
                      'Log In'
                    )}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 py-2 rounded-2xl mt-6 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors shadow-sm flex justify-center items-center gap-2"
                >
                  {googleLoading ? (
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <>
                      <img
                        src={ASSETS.GoogleIcon}
                        alt="Google"
                        className="w-8 h-8"
                      />
                      Continue with Google
                    </>
                  )}
                </button>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => setView('forgot-password')}
                    className="text-sm text-blue-800 dark:text-blue-300 hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>

                <p className={`text-center mt-1 ${authMutedClass}`}>
                  Don't have an account?{' '}
                  <button
                    onClick={() => navigate('/signup')}
                    className="text-blue-800 dark:text-blue-300 hover:underline"
                  >
                    Sign up
                  </button>
                </p>
              </div>
            </div>
          </div>
        );
    }
  };

  return renderView();
}

export default LoginPage;
