import { supabase } from '../components/supabaseClient';
import { APP_CACHE_PREFIXES, clearBrowserCache } from './browserCache';

export const AUTH_LOGIN_AT_KEY = 'smart_connect_login_at';
export const AUTH_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const CURRENT_USER_EVENT = 'current-user-changed';

let signOutInProgress: Promise<void> | null = null;

export const recordLoginTime = (timestamp = Date.now()) => {
  localStorage.setItem(AUTH_LOGIN_AT_KEY, String(timestamp));
};

export const getLoginTime = () => {
  const rawValue = localStorage.getItem(AUTH_LOGIN_AT_KEY);
  if (!rawValue) return null;

  const timestamp = Number(rawValue);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
};

export const isLoginExpired = (now = Date.now()) => {
  const loginTime = getLoginTime();
  return loginTime === null || now - loginTime >= AUTH_MAX_AGE_MS;
};

export const notifyCurrentUserChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CURRENT_USER_EVENT));
  }
};

/** Clears the local user, application cache cookies, and persisted Supabase session. */
export const signOutAndClearAuth = async () => {
  if (signOutInProgress) return signOutInProgress;

  signOutInProgress = (async () => {
    // Clear browser-visible auth immediately; the remote sign-out may need a network round trip.
    localStorage.removeItem('currentUser');
    localStorage.removeItem(AUTH_LOGIN_AT_KEY);
    clearBrowserCache(APP_CACHE_PREFIXES);
    notifyCurrentUserChanged();

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.warn('Sign-out cleanup error:', error);
    }
  })().finally(() => {
    signOutInProgress = null;
  });

  return signOutInProgress;
};

export const enforceLoginLifetime = async () => {
  if (localStorage.getItem('currentUser') && isLoginExpired()) {
    await signOutAndClearAuth();
    return true;
  }

  return false;
};
