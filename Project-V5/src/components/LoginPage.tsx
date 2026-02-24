import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ASSETS } from '../config/assets';
import { ArrowLeft, Mail, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';

type LoginView = 'login' | 'forgot-password' | 'email-sent' | 'update-password';

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
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 border border-gray-200 text-center">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="text-green-600" size={40} />
          </div>
          <h2 className="text-2xl text-gray-900 mb-3">Password Updated!</h2>
          <p className="text-gray-600 mb-6">
            Your password has been successfully updated. Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-gray-600 hover:text-blue-800 mb-8 transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Login
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200">
          <div className="flex items-center justify-center gap-3 mb-8">
            <img src={ASSETS.Shield} alt="Shield Icon" className="inline-flex w-12" />
            <div className="text-center">
              <span className="text-2xl text-gray-900">Smart Connect</span>
              <p className="text-xs text-gray-600">Reset Password</p>
            </div>
          </div>

          <h2 className="text-2xl text-center mb-8 text-gray-900">Create New Password</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm mb-2 text-gray-700">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm mb-2 text-gray-700">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm border border-red-200">
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
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setView('update-password');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [hashType, isRecoveryLink]);

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

      // 2. Determine role
      let role: 'user' | 'admin' | 'super_admin' = 'user';
      let profileData: any = null;

      // Super Admin
      const { data: sa } = await supabase
        .from('super_admins')
        .select('*')
        .eq('sa_id', user.id)
        .maybeSingle();

      if (sa) {
        role = 'super_admin';
        profileData = sa;
      } else {
        // Admin
        const { data: admin } = await supabase
          .from('admins')
          .select('*')
          .eq('a_id', user.id)
          .maybeSingle();

        if (admin) {
          role = 'admin';
          profileData = admin;
        } else {
          // User
          const { data: usr } = await supabase
            .from('users')
            .select('*')
            .eq('u_id', user.id)
            .single();

          if (usr) {
            role = 'user';
            profileData = usr;
          }
        }
      }

      const resolvedName =
        profileData?.sa_name ??
        profileData?.a_name ??
        profileData?.u_name ??
        user.user_metadata?.full_name ??
        user.email?.split('@')[0];
        
      // 3. Preserve your app flow using localStorage
      const currentUser = {
        id: user.id,
        email: user.email,
        role,
        name: resolvedName,
        profile: profileData,
      };

      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      // 4. Navigate based on role
      if (role === 'super_admin') {
        navigate('/super-admin');
      } else if (role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }

    } catch (err: any) {
      console.error('Login Error:', err);
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
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
          <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4">
            <div className="max-w-md w-full">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-gray-600 hover:text-blue-800 mb-8 transition-colors"
              >
                <ArrowLeft size={20} />
                Back to Home
              </button>

              <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200 text-center">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Mail className="text-blue-600" size={40} />
                </div>

                <h2 className="text-2xl text-gray-900 mb-3">Check your inbox</h2>

                <p className="text-gray-600 mb-6">
                  We sent a password reset link to <br />
                  <span className="font-semibold text-gray-900">{resetEmail}</span>
                </p>

                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800 mb-8 text-left flex gap-3">
                  <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />
                  <p>
                    Click the link in the email to reset your password.
                  </p>
                </div>

                <button
                  onClick={() => setView('login')}
                  className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back to Login
                </button>
              </div>
            </div>
          </div>
        );

      case 'forgot-password':
        return (
          <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4">
            <div className="max-w-md w-full">
              <button
                onClick={() => setView('login')}
                className="flex items-center gap-2 text-gray-600 hover:text-blue-800 mb-8 transition-colors"
              >
                <ArrowLeft size={20} />
                Back to Login
              </button>

              <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200">
                <div className="flex items-center justify-center gap-3 mb-8">
                  <img src={ASSETS.Shield} alt="Shield Icon" className="inline-flex w-12" />
                  <div className="text-center">
                    <span className="text-2xl text-gray-900">Smart Connect</span>
                    <p className="text-xs text-gray-600">Reset Password</p>
                  </div>
                </div>

                <h2 className="text-2xl text-center mb-2 text-gray-900">Forgot Password?</h2>
                <p className="text-gray-600 text-center mb-6">
                  Enter your email and we'll send you a link to reset your password.
                </p>

                <form onSubmit={handleForgotPassword} className="space-y-6">
                  <div>
                    <label htmlFor="resetEmail" className="block text-sm mb-2 text-gray-700">
                      Email Address
                    </label>
                    <input
                      id="resetEmail"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800"
                      placeholder="your@email.com"
                      required
                    />
                  </div>

                  {error && (
                    <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm border border-red-200">
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
          <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4">
            <div className="max-w-md w-full">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-gray-600 hover:text-blue-800 mb-8 transition-colors"
              >
                <ArrowLeft size={20} />
                Back to Home
              </button>

              <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200">
                <div className="flex items-center justify-center gap-3 mb-8">
                  <img src={ASSETS.Shield} alt="Shield Icon" className="inline-flex w-12" />
                  <div className="text-center">
                    <span className="text-2xl text-gray-900">Smart Connect</span>
                    <p className="text-xs text-gray-600">Secure Login</p>
                  </div>
                </div>

                <h2 className="text-3xl text-center mb-8 text-gray-900">Welcome Back</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="email" className="block text-sm mb-2 text-gray-700">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800"
                      placeholder="your@email.com"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm mb-2 text-gray-700">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800"
                      placeholder="••••••••"
                      required
                    />
                  </div>

                  {error && (
                    <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm border border-red-200">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-800 text-white py-3 rounded-lg hover:bg-blue-900 transition-colors shadow-md flex justify-center items-center"
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

                <div className="mt-4 text-center">
                  <button
                    onClick={() => setView('forgot-password')}
                    className="text-sm text-blue-800 hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>

                <p className="text-center mt-6 text-gray-600">
                  Don't have an account?{' '}
                  <button
                    onClick={() => navigate('/signup')}
                    className="text-blue-800 hover:underline"
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
