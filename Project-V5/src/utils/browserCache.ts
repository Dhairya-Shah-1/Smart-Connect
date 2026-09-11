const CACHE_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;
const CACHE_LOCAL_META_SUFFIX = '__meta__';

export const BROWSER_CACHE_TTL_MS = 2 * 60 * 1000;

// Prefixes used by every component that caches data in the browser.
export const REPORT_HISTORY_CACHE_PREFIX = 'smart_connect_report_history';
export const CHECK_REPORTS_CACHE_PREFIX = 'smart_connect_check_reports';
export const SUPER_ADMIN_CACHE_PREFIX = 'smart_connect_super_admin';
export const DASHBOARD_STATS_CACHE_PREFIX = 'smart_connect_dashboard_stats';
export const PROFILE_CACHE_PREFIX = 'smart_connect_profile';
export const NOTIFICATIONS_CACHE_PREFIX = 'smart_connect_notifications';
export const MAP_CACHE_META_PREFIX = 'smart_connect_map_cache_meta';
export const MAP_CACHE_DATA_PREFIX = 'smart_connect_map_cache_data';

// All cache prefixes so sign-out / submit handlers can clear everything.
export const APP_CACHE_PREFIXES = [
  REPORT_HISTORY_CACHE_PREFIX,
  CHECK_REPORTS_CACHE_PREFIX,
  SUPER_ADMIN_CACHE_PREFIX,
  DASHBOARD_STATS_CACHE_PREFIX,
  PROFILE_CACHE_PREFIX,
  NOTIFICATIONS_CACHE_PREFIX,
  MAP_CACHE_META_PREFIX,
  MAP_CACHE_DATA_PREFIX,
];

export interface BrowserCacheEntry<T> {
  data: T;
  metadata: {
    updatedAt: number;
    signature: string;
    storageKey: string;
  };
}

/**
 * Reads the raw cookie jar. `document.cookie` can be unavailable when
 * cookies are blocked, so we defensively fall back to an empty string.
 */
const getCookies = () => {
  try {
    if (typeof document === 'undefined' || typeof document.cookie !== 'string') return '';
    return document.cookie;
  } catch {
    return '';
  }
};

const getCookieValue = (name: string) => {
  const cookies = getCookies();
  const cookie = cookies
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
};

const setCookieValue = (name: string, value: string) => {
  if (typeof document === 'undefined') return;

  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${CACHE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch (err) {
    console.warn('Failed to write browser cache cookie', err);
  }
};

const deleteCookie = (name: string) => {
  if (typeof document === 'undefined') return;

  try {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    /* cookies unavailable - ignore */
  }
};

export const sanitizeCacheKeyPart = (value: string) =>
  value.replace(/[^a-z0-9_-]/gi, '_');

const getLocalMetaKey = (storageKey: string) => `${storageKey}${CACHE_LOCAL_META_SUFFIX}`;

const writeMetadata = (
  cookieKey: string,
  storageKey: string,
  metadata: BrowserCacheEntry<unknown>['metadata'],
) => {
  const serialized = JSON.stringify(metadata);

  // The cookie is the primary freshness marker (the "cookie updated time").
  // We mirror the same metadata into localStorage so the cache keeps working
  // even when cookies are blocked, cleared, or unavailable.
  setCookieValue(cookieKey, serialized);

  try {
    localStorage.setItem(getLocalMetaKey(storageKey), serialized);
  } catch (err) {
    console.warn('Failed to write localStorage cache metadata', err);
  }
};

const readMetadata = (cookieKey: string, storageKey: string) => {
  const cookieValue = getCookieValue(cookieKey);
  if (cookieValue) {
    try {
      const metadata = JSON.parse(cookieValue);
      if (metadata && metadata.storageKey === storageKey) {
        return metadata as BrowserCacheEntry<unknown>['metadata'];
      }
    } catch {
      // invalid cookie value - fall back to the localStorage mirror
    }
  }

  try {
    const mirror = localStorage.getItem(getLocalMetaKey(storageKey));
    if (!mirror) return null;
    const metadata = JSON.parse(mirror);
    if (metadata && metadata.storageKey === storageKey) {
      return metadata as BrowserCacheEntry<unknown>['metadata'];
    }
  } catch {
    // ignore
  }

  return null;
};

export const getBrowserCache = <T,>(cookieKey: string, storageKey: string) => {
  if (typeof window === 'undefined') return null;

  const metadata = readMetadata(cookieKey, storageKey);
  if (!metadata) return null;

  let dataValue: string | null = null;
  try {
    dataValue = localStorage.getItem(storageKey);
  } catch {
    dataValue = null;
  }
  if (!dataValue) return null;

  try {
    const data = JSON.parse(dataValue) as T;

    return { data, metadata };
  } catch {
    return null;
  }
};

export const setBrowserCache = <T,>(
  cookieKey: string,
  storageKey: string,
  data: T,
  signature: string,
) => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch (err) {
    console.warn('Failed to write browser cache data', err);
    return;
  }

  writeMetadata(cookieKey, storageKey, {
    updatedAt: Date.now(),
    signature,
    storageKey,
  });
};

export const isBrowserCacheFresh = (updatedAt: number, ttlMs: number = BROWSER_CACHE_TTL_MS) =>
  updatedAt > 0 && Date.now() - updatedAt <= ttlMs;

// ---------------------------------------------------------------------------
// Generic "show cached data, only touch the database when needed" policy:
//
//  1. No cache stored yet → full database load, then store it in the browser.
//  2. Cache is fresh (≤ 2 minutes) → show the stored data, do NOT query the
//     database at all.
//  3. Cache is older than 2 minutes → ask the database *only* whether anything
//     changed (cheap signature check). Reload only when there is new data,
//     otherwise keep showing the stored data and refresh the cookie time.
// ---------------------------------------------------------------------------

export interface LoadCachedOrFreshOptions<T> {
  cookieKey: string;
  storageKey: string;
  /** Cheap database call that only detects whether the dataset changed. */
  fetchSignature: () => Promise<string>;
  /** Full database call; must return the fresh data plus its signature, or null. */
  fetchFull: () => Promise<{ data: T; signature: string } | null>;
  /** Applies data (cached or freshly fetched) to the calling component. */
  applyData: (data: T) => void;
  /** Called once the component can stop showing the loading state. */
  onFinishedLoading?: () => void;
  /** Freshness window in milliseconds (defaults to 2 minutes). */
  ttlMs?: number;
}

const inflight: Record<string, Promise<void>> = {};

const runLoadCachedOrFresh = async <T,>(options: LoadCachedOrFreshOptions<T>) => {
  const { cookieKey, storageKey, fetchSignature, fetchFull, applyData, onFinishedLoading, ttlMs } = options;

  const cached = getBrowserCache<T>(cookieKey, storageKey);

  // First request: nothing is stored in the browser yet → load everything.
  if (!cached) {
    try {
      const fresh = await fetchFull();
      if (fresh) {
        setBrowserCache(cookieKey, storageKey, fresh.data, fresh.signature);
        applyData(fresh.data);
      }
    } catch (err) {
      console.error('First browser-cache load failed:', err);
    } finally {
      onFinishedLoading?.();
    }
    return;
  }

  // Every later visit: show the stored reports immediately, no database call yet.
  applyData(cached.data);
  onFinishedLoading?.();

  // Still inside the 2 minute window → do not query the database at all.
  if (isBrowserCacheFresh(cached.metadata.updatedAt, ttlMs)) return;

  // Older than 2 minutes → ask the database only whether anything changed.
  try {
    const latestSignature = await fetchSignature();

    if (latestSignature !== cached.metadata.signature) {
      // New data exists → reload and refresh the stored cache.
      const fresh = await fetchFull();
      if (fresh) {
        setBrowserCache(cookieKey, storageKey, fresh.data, fresh.signature);
        applyData(fresh.data);
      }
    } else {
      // Nothing changed → keep showing cached data, only refresh the time.
      setBrowserCache(cookieKey, storageKey, cached.data, latestSignature);
    }
  } catch (err) {
    console.error('Background freshness check failed; showing cached data:', err);
  }
};

export const loadCachedOrFresh = async <T,>(options: LoadCachedOrFreshOptions<T>) => {
  const { storageKey, cookieKey, applyData, onFinishedLoading } = options;

  const running = inflight[storageKey];
  if (running) {
    // Another loader is already handling this data (e.g. a quick remount).
    // Wait for it, then apply whatever is now stored - never double-fetch.
    try {
      await running;
    } catch {
      /* ignore */
    }
    const cached = getBrowserCache<T>(cookieKey, storageKey);
    if (cached) applyData(cached.data);
    onFinishedLoading?.();
    return;
  }

  const self = runLoadCachedOrFresh(options);
  inflight[storageKey] = self;
  try {
    await self;
  } finally {
    delete inflight[storageKey];
  }
};

/**
 * Removes every localStorage entry and cookie whose key starts with one of the
 * given prefixes. Used when the data is no longer valid (sign-out, submitting a
 * new report, ...).
 */
export const clearBrowserCache = (prefixes: string[]) => {
  if (typeof window === 'undefined') return;

  const matchesPrefix = (key: string) => prefixes.some((prefix) => key.startsWith(prefix));

  try {
    const staleKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && matchesPrefix(key)) staleKeys.push(key);
    }
    staleKeys.forEach((key) => localStorage.removeItem(key));
  } catch (err) {
    console.warn('Failed to clear localStorage cache', err);
  }

  try {
    getCookies()
      .split('; ')
      .filter(Boolean)
      .forEach((row) => {
        const name = row.split('=')[0];
        if (name && matchesPrefix(name)) deleteCookie(name);
      });
  } catch (err) {
    console.warn('Failed to clear cache cookies', err);
  }
};
