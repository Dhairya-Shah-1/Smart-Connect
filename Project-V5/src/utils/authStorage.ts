/**
 * Session-scoped storage for the app-level `currentUser` record.
 *
 * EVERY role - user, admin and super-admin - is kept in sessionStorage, which
 * the browser discards as soon as the browser (or this tab) is closed. A
 * returning visitor therefore always lands on the login screen and has to
 * authenticate again: no login can ever survive a browser restart.
 *
 * A `currentUser` record found in localStorage is stale by definition - it
 * outlived a browser session, which is exactly what must no longer happen -
 * so it is dropped on read and the visitor is asked to sign in again.
 *
 * When sessionStorage itself is blocked (storage policy, private mode, ...)
 * the record is held in memory only: the login then works for the lifetime of
 * the current page load but is still gone after a restart.
 */

const CURRENT_USER_KEY = 'currentUser';
const OAUTH_PENDING_KEY = 'smart_connect_oauth_pending';

const getSafeSessionStorage = (): Storage | null => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
};

const getSafeLocalStorage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

// Fallback used only when sessionStorage is unavailable: keeps the login
// alive for the current page load without ever writing it to disk.
let inMemoryUserRaw: string | null = null;

/**
 * Reads the raw `currentUser` JSON.
 *
 * Only the session-scoped record counts. Anything still sitting in localStorage
 * survived a browser restart (older build / pre session-scoped storage), which
 * means its login is over by definition, so it is dropped and the visitor must
 * sign in again.
 */
export function readCurrentUserRaw(): string | null {
  const session = getSafeSessionStorage();
  const local = getSafeLocalStorage();

  try {
    const sessionValue = session?.getItem(CURRENT_USER_KEY) ?? null;
    if (sessionValue) {
      // Drop a leftover localStorage copy so exactly one record can exist.
      try {
        local?.removeItem(CURRENT_USER_KEY);
      } catch {
        /* ignore */
      }
      return sessionValue;
    }
  } catch {
    // sessionStorage unreadable - fall through to the other sources.
  }

  if (inMemoryUserRaw) return inMemoryUserRaw;

  try {
    if (local?.getItem(CURRENT_USER_KEY) != null) {
      // Stale record from before session-scoped storage: it outlived the
      // browser session, so the login it represents no longer exists.
      local.removeItem(CURRENT_USER_KEY);
    }
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * Persists the signed-in user to session-scoped storage and removes any copy
 * from localStorage, so exactly one - non-persistent - record can exist.
 */
export function writeCurrentUser(user: unknown): void {
  const raw = JSON.stringify(user);
  const session = getSafeSessionStorage();
  const local = getSafeLocalStorage();

  try {
    // Never leave a record in localStorage: it would outlive the browser.
    local?.removeItem(CURRENT_USER_KEY);
  } catch {
    /* ignore */
  }

  if (!session) {
    // sessionStorage unavailable - memory only (page lifetime, no restart).
    inMemoryUserRaw = raw;
    return;
  }

  try {
    session.setItem(CURRENT_USER_KEY, raw);
    inMemoryUserRaw = null;
  } catch {
    // Storage blocked (quota/policy) - keep the login for this page only
    // instead of losing it outright, but never fall back to localStorage.
    inMemoryUserRaw = raw;
  }
}

/** Removes the app-level user from both stores (used by every sign-out). */
export function clearCurrentUser(): void {
  inMemoryUserRaw = null;
  try {
    getSafeSessionStorage()?.removeItem(CURRENT_USER_KEY);
  } catch {
    /* ignore */
  }
  try {
    getSafeLocalStorage()?.removeItem(CURRENT_USER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Marks that THIS tab started an OAuth round-trip (Google sign-in/sign-up
 * redirects away and comes back to the same tab). The marker is kept in
 * sessionStorage, so - like admin sessions - it dies with the tab and can
 * never leak into a later browser session.
 */
export function markOAuthPending(): void {
  try {
    getSafeSessionStorage()?.setItem(OAUTH_PENDING_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearOAuthPending(): void {
  try {
    getSafeSessionStorage()?.removeItem(OAUTH_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** True while the current URL still carries an auth-redirect payload. */
export function hasAuthRedirectParams(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const { hash, search } = window.location;
    if (!hash && !search) return false;
    return /access_token|refresh_token|type=|code=/.test(`${hash}${search}`);
  } catch {
    return false;
  }
}

/**
 * True when a login may be completed from an existing Supabase session
 * (this tab started Google sign-in, or the URL is an auth redirect such as
 * a password-recovery link).
 *
 * When this is false, a Supabase session that was merely restored from
 * browser storage must NOT be turned into an app login: that is how a
 * returning admin was silently signed back in without credentials - and,
 * with an expired token failing the role queries, even downgraded to the
 * normal-user dashboard.
 */
export function isAuthRedirectInProgress(): boolean {
  try {
    return getSafeSessionStorage()?.getItem(OAUTH_PENDING_KEY) === '1' || hasAuthRedirectParams();
  } catch {
    return hasAuthRedirectParams();
  }
}