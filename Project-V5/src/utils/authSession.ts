import { supabase } from '../components/supabaseClient';
import { isLoginExpired, signOutAndClearAuth } from './authLifetime';

/**
 * Shared Supabase session helper.
 *
 * The app keeps a copy of the signed-in user in localStorage (`currentUser`)
 * and App.tsx guards every private route with it. Supabase, however, does not
 * trust localStorage: every query and every Storage write is evaluated with the
 * `anon` role unless the client is holding a valid session. That mismatch is
 * exactly what produces these symptoms while the UI still looks "logged in":
 *
 *   - `incident_reports_view` (and every other RLS protected read) answers
 *     HTTP 200 with an EMPTY array and no error, so lists look "broken/empty".
 *   - Storage uploads are rejected with
 *     `new row violates row-level security policy` (HTTP 400).
 *
 * So components must ask Supabase itself, and try to rescue an expired token,
 * before running user scoped reads/writes.
 */

/**
 * How the Supabase session currently looks.
 *
 *  - 'valid'   → a usable session exists; RLS will accept the request.
 *  - 'missing' → there is no session (expired and not refreshable, signed out,
 *                or `currentUser` was written manually without signing in).
 *  - 'error'   → the session could not be checked at all (offline, storage
 *                blocked, ...).
 */
export type SupabaseSessionState = 'valid' | 'missing' | 'error';

export interface AuthenticatedUser {
  userId: string | null;
  state: SupabaseSessionState;
  errorMessage?: string;
}

// Treat the access token as expired slightly early so we refresh it before it
// is used instead of letting PostgREST/Storage reject the request.
const EXPIRY_LEEWAY_MS = 60 * 1000;

const isExpired = (expiresAt?: number | null) =>
  typeof expiresAt !== 'number' || expiresAt * 1000 <= Date.now() + EXPIRY_LEEWAY_MS;

/**
 * Resolves the *authenticated* Supabase user id.
 *
 * 1. Uses the session supabase-js restored from browser storage (no network
 *    call) while its access token is still valid.
 * 2. If the token is expired, renews it with the stored refresh token - this
 *    rescues the common "phone was locked for a while" case, because the very
 *    next query/write will then carry a valid JWT again.
 * 3. As a last resort asks the auth server which user the stored token belongs
 *    to (server validated).
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  // A Supabase session may be restored before the app has resolved its local
  // profile. Enforce the six-hour app lifetime once that local user exists.
  if (localStorage.getItem('currentUser') && isLoginExpired()) {
    await signOutAndClearAuth();
    return { userId: null, state: 'missing', errorMessage: 'The six-hour login period has expired.' };
  }

  let hadExpiredSession = false;

  // 1. The session that supabase-js restored from persistent storage.
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.warn('[authSession] Could not read the Supabase session:', error.message);
    }

    const session = data?.session;
    const sessionUserId = session?.user?.id;

    if (sessionUserId && !isExpired(session?.expires_at)) {
      return { userId: sessionUserId, state: 'valid' };
    }

    hadExpiredSession = Boolean(sessionUserId);
  } catch (err: any) {
    console.warn('[authSession] getSession failed:', err?.message || err);
    return { userId: null, state: 'error', errorMessage: err?.message };
  }

  // 2. No usable session → try to renew it with the stored refresh token.
  try {
    const { data, error } = await supabase.auth.refreshSession();
    const refreshedUserId = data?.session?.user?.id;

    if (!error && refreshedUserId) {
      return { userId: refreshedUserId, state: 'valid' };
    }

    if (error && error.name !== 'AuthSessionMissingError') {
      console.warn('[authSession] Session refresh failed:', error.message);
    }
  } catch (err: any) {
    console.warn('[authSession] refreshSession failed:', err?.message || err);
  }

  // 3. Last resort: let the auth server validate the stored token.
  try {
    const { data, error } = await supabase.auth.getUser();

    if (data?.user?.id) {
      return { userId: data.user.id, state: 'valid' };
    }

    return {
      userId: null,
      state: 'missing',
      errorMessage: hadExpiredSession
        ? 'The stored session is expired and could not be refreshed.'
        : error?.name === 'AuthSessionMissingError'
          ? undefined
          : error?.message,
    };
  } catch (err: any) {
    return { userId: null, state: 'error', errorMessage: err?.message || String(err) };
  }
}
