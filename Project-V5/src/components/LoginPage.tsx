import { useState } from 'react';
import shieldIcon from '../assets/Logos_and_icons/Shield(Gemini)(without-bg).png';
import { MapPin, ArrowLeft } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';

type Page = 'landing' | 'login' | 'signup' | 'dashboard';

interface LoginPageProps {
  onNavigate: (page: Page) => void;
  onLogin: () => void;
}

export function LoginPage({ onNavigate, onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        .single();

      if (sa) {
        role = 'super_admin';
        profileData = sa;
      } else {
        // Admin
        const { data: admin } = await supabase
          .from('admins')
          .select('*')
          .eq('a_id', user.id)
          .single();

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

      // 3. Preserve your app flow using localStorage
      const currentUser = {
        id: user.id,
        email: user.email,
        role,
        name:
          profileData?.sa_name ||
          profileData?.a_name ||
          profileData?.u_name ||
          user.email,
        ...profileData,
      };

      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      // 4. Continue existing navigation logic
      onLogin();
      onNavigate('dashboard');

    } catch (err: any) {
      console.error('Login Error:', err);
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <button
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2 text-gray-600 hover:text-blue-800 mb-8 transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Home
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200">
          <div className="flex items-center justify-center gap-3 mb-8">
            <img src={shieldIcon} alt="Shield Icon" className="inline-flex w-12" />
            <div className="text-center">
              <span className="text-2xl text-gray-900">CivicAlert</span>
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

          <p className="text-center mt-6 text-gray-600">
            Don't have an account?{' '}
            <button
              onClick={() => onNavigate('signup')}
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