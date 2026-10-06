// Verifies that src/utils/authSession.ts refuses to run user scoped Supabase
// work when there is no authenticated session, because that is what caused:
//
//   1. ReportHistory showing nothing while looking signed in:
//      as the `anon` role `incident_reports_view` answers HTTP 200 with `[]`
//      and NO error, which is why the log said
//      "Report view unavailable or empty; using incident_reports fallback. null".
//   2. ReportIssue storage uploads failing with
//      `new row violates row-level security policy` (HTTP 400) because the file
//      was placed in `reports/anonymous/...` (no user id available).
//
// The helper must therefore report `userId === null` (and never throw) whenever
// the browser has no session-scoped Supabase session - and a token left in
// localStorage (a leftover that survived a browser restart) must never be
// turned into a session either.
//
// Run with:
//   node scripts/verify-auth-session.test.mjs
//
// The script bundles src/utils/authSession.ts itself (it imports relative
// modules and needs `import.meta.env` replaced, which is easier through the
// esbuild JS API than through its CLI under PowerShell).
//
// A throwaway `.invalid` Supabase URL is used on purpose: the refresh attempt of
// an expired session fails immediately, so this test never depends on the
// network or on the real project.

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const bundlePath = path.join(here, '.cache', 'authSession.mjs');

const esbuild = await import('esbuild');
await esbuild.build({
  entryPoints: [path.join(projectRoot, 'src', 'utils', 'authSession.ts')],
  bundle: true,
  format: 'esm',
  external: ['@supabase/supabase-js'],
  define: {
    'import.meta.env': JSON.stringify({
      VITE_SUPABASE_URL: 'https://session-test.invalid',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    }),
  },
  outfile: bundlePath,
  logLevel: 'warning',
});

const STORAGE_KEY = 'sb-session-test-auth-token';

// --- browser-like storage stub ----------------------------------------------
const createStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));

  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
};

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const makeAccessToken = (exp) =>
  [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub: 'test-user-uuid', exp, aud: 'authenticated', role: 'authenticated' }),
    b64url('signature'),
  ].join('.');

const makeSession = (exp) => ({
  access_token: makeAccessToken(exp),
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: exp,
  user: { id: 'test-user-uuid', email: 'test@example.com' },
});

const nowSeconds = Math.floor(Date.now() / 1000);

// --- 1. no session at all (settings-only browser / seeded currentUser) ------
globalThis.localStorage = createStorage();

const { getAuthenticatedUser } = await import('./.cache/authSession.mjs?signed-out');
const signedOut = await getAuthenticatedUser();

console.log('signed out      ->', signedOut);
assert.equal(signedOut.userId, null, 'a session-less browser must not report a user id');
assert.equal(signedOut.state, 'missing', 'a session-less browser must be reported as missing');

// --- 2. valid stored session → resolved from storage (no network needed) ----
// supabaseClient.tsx persists the session in sessionStorage, so that is where
// the stub lives; localStorage stays empty on purpose.
globalThis.localStorage = createStorage();
globalThis.sessionStorage = createStorage({
  [STORAGE_KEY]: JSON.stringify(makeSession(nowSeconds + 3600)),
});

const { getAuthenticatedUser: getAuthenticatedUserWithSession } = await import(
  './.cache/authSession.mjs?valid'
);
const signedIn = await getAuthenticatedUserWithSession();

console.log('valid session   ->', signedIn);
assert.equal(signedIn.state, 'valid', 'a stored, unexpired session must be reported as valid');
assert.equal(signedIn.userId, 'test-user-uuid', 'the session user id must be returned');

// --- 3. expired session that cannot be refreshed → still no user id ---------
globalThis.localStorage = createStorage();
globalThis.sessionStorage = createStorage({
  [STORAGE_KEY]: JSON.stringify(makeSession(nowSeconds - 60)),
});

const { getAuthenticatedUser: getAuthenticatedUserExpired } = await import(
  './.cache/authSession.mjs?expired'
);
const expired = await getAuthenticatedUserExpired();

console.log('expired session ->', expired);
assert.equal(expired.userId, null, 'an unrefreshable expired session must not be used');
assert.ok(
  expired.state === 'missing' || expired.state === 'error',
  `expired/unrefreshable sessions must not be reported as valid (got ${expired.state})`,
);

// --- 4. a localStorage-only token is a browser-restart leftover -------------
// The Supabase session is session-scoped, so a token that only exists in
// localStorage (old build / before this change) must never be revived.
globalThis.localStorage = createStorage({
  [STORAGE_KEY]: JSON.stringify(makeSession(nowSeconds + 3600)),
});
globalThis.sessionStorage = createStorage();

const { getAuthenticatedUser: getAuthenticatedUserLegacy } = await import(
  './.cache/authSession.mjs?legacy-local'
);
const legacy = await getAuthenticatedUserLegacy();

console.log('localStorage-only ->', legacy);
assert.equal(legacy.userId, null, 'a localStorage-only session must not survive a restart');
assert.notEqual(legacy.state, 'valid', 'a localStorage-only session must never be reported valid');
assert.equal(
  globalThis.localStorage.getItem(STORAGE_KEY),
  null,
  'the legacy localStorage token must be purged',
);

console.log('\nAll auth-session checks passed.');

// supabase-js starts an auto-refresh interval as soon as a session is stored,
// which would otherwise keep this script alive forever.
process.exit(0);