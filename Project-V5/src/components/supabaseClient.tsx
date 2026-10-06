import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

// Closing the browser must end the login, and that includes the Supabase
// session itself: it is what carries the JWT for RLS-protected queries. The
// session is therefore kept in sessionStorage (discarded when the browser or
// the tab is closed) instead of the default localStorage.
const getSessionSafeStorage = (): Storage | undefined => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : undefined;
  } catch {
    return undefined;
  }
};

// Older builds persisted the Supabase token in localStorage, which would
// silently restore a session after a browser restart. Purge any such
// leftover so no auth material survives outside the current session.
const purgeLegacyLocalAuthTokens = () => {
  try {
    if (typeof localStorage === 'undefined') return;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && /^sb-[\w-]+-auth-token$/.test(key)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
};

purgeLegacyLocalAuthTokens();

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: getSessionSafeStorage(),
  },
});
