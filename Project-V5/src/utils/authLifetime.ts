import { supabase } from '../components/supabaseClient';
import { APP_CACHE_PREFIXES, clearBrowserCache } from './browserCache';
import { clearCurrentUser, readCurrentUserRaw } from './authStorage';

export const AUTH_LOGIN_AT_KEY = 'smart_connect_login_at';
export const AUTH_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const CURRENT_USER_EVENT = 'current-user-changed';

let signOutInProgress: Promise<void> | null = null;

// The login stamp must be session-scoped like `currentUser`: it is what bounds
// the six-hour login window, so it may not outlive the browser session either.
const getSessionSafe = (): Storage | null => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
};

/** Drops the pre session-scoped stamp so a restart can never reuse it. */
const dropLegacyLoginTime = () => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(AUTH_LOGIN_AT_KEY);
  } catch {
    /* ignore */
  }
};

export const recordLoginTime = (timestamp = Date.now()) => {
  dropLegacyLoginTime();
  try {
    getSessionSafe()?.setItem(AUTH_LOGIN_AT_KEY, String(timestamp));
  } catch {
    // Storage blocked - isLoginExpired() then treats the login as expired,
    // which is the safe direction (the visitor is asked to sign in again).
  }
};

export const getLoginTime = () => {
  let rawValue: string | null = null;

  try {
    rawValue = getSessionSafe()?.getItem(AUTH_LOGIN_AT_KEY) ?? null;
  } catch {
    rawValue = null;
  }

  if (!rawValue) {
    // A stamp left in localStorage survived a browser restart: it belongs to
    // a login that is already over, so it is removed and ignored.
    dropLegacyLoginTime();
    return null;
  }

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
    // clearCurrentUser() removes the record from sessionStorage (all roles),
    // localStorage (stale leftovers) and the in-memory fallback.
    clearCurrentUser();
    try {
      getSessionSafe()?.removeItem(AUTH_LOGIN_AT_KEY);
    } catch {
      /* ignore */
    }
    dropLegacyLoginTime();
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
  if (readCurrentUserRaw() && isLoginExpired()) {
    await signOutAndClearAuth();
    return true;
  }

  return false;
};
