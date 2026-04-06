import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ASSETS } from '../config/assets';
import { ArrowLeft, Loader2, Mail, CheckCircle } from 'lucide-react';
import { supabase } from './supabaseClient';

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
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4 py-8">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 border border-gray-200 text-center">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="text-blue-600" size={40} />
          </div>

          <h2 className="text-2xl text-gray-900 mb-3">Check your inbox</h2>

          <p className="text-gray-600 mb-6">
            We sent a verification link to <br />
            <span className="font-semibold text-gray-900">{email}</span>
          </p>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800 mb-8 text-left flex gap-3">
            <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />
            <p>
              Click the link in the email to activate your account. You'll be able to log in after
              verification.
            </p>
          </div>

          <button
            onClick={() => navigate('/login')}
            className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Back to Login
          </button>

          <p className="text-xs text-gray-400 mt-4">Didn't receive the email? Check your spam folder.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hide-scrollbar min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4 py-8">
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
              <p className="text-xs text-gray-600">Create Account</p>
            </div>
          </div>

          <h2 className="text-3xl text-center mb-8 text-gray-900">Join the Platform</h2>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={googleLoading}
              className="w-full bg-white border border-gray-300 text-gray-700 py-1.5 rounded-lg hover:bg-gray-50 transition-colors shadow-sm flex justify-center items-center gap-2"
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
              className="w-full bg-blue-800 text-white py-3 rounded-lg hover:bg-blue-900 transition-colors shadow-md"
            >
              Enter details manually
            </button>
          </div>

          {signupMethod === 'manual' && (
            <form onSubmit={handleSubmit} className="space-y-6 mt-6">
              <div>
                <label className="block text-sm mb-2 text-gray-700">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-800"
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-gray-700">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-800"
                  placeholder="your@email.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-gray-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-800"
                  placeholder="........"
                  required
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-gray-700">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-800"
                  placeholder="........"
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
                {loading ? <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /> : 'Sign Up'}
              </button>
            </form>
          )}

          {signupMethod !== 'manual' && error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm border border-red-200 mt-6">
              {error}
            </div>
          )}

          <p className="text-center mt-6 text-gray-600">
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} className="text-blue-800 hover:underline">
              Log in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignUpPage;
