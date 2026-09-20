// Verifies that the browser cache policy in src/utils/browserCache.ts behaves
// exactly as requested:
//   1. First request           → full database load, then stored in the browser.
//   2. Re-arrival ≤ 2 minutes  → ZERO database calls, show the stored data.
//   3. Re-arrival > 2 minutes, nothing changed → only a cheap signature check,
//      keep showing stored data and refresh the cookie time (no reload).
//   4. Re-arrival > 2 minutes, data changed → signature check + reload.
//   5. Cookies unavailable/cleared → the localStorage metadata mirror keeps the
//      cache working (fallback).
//   6. clearBrowserCache() removes data + metadata + cookies for a prefix.
//
// Run with:
//   npx esbuild src/utils/browserCache.ts --format=esm --outfile=scripts/.cache/browserCache.mjs
//   node scripts/verify-browser-cache.test.mjs

import assert from 'node:assert/strict';
import { loadCachedOrFresh, clearBrowserCache, BROWSER_CACHE_TTL_MS } from './.cache/browserCache.mjs';

// --- mock browser environment ------------------------------------------------
let cookieJar = '';
let storageBroken = false;
const storage = new Map();

globalThis.document = {
  get cookie() {
    if (storageBroken) throw new TypeError('cookies blocked');
    return cookieJar;
  },
  set cookie(value) {
    if (storageBroken) return;
    const name = value.split('=')[0].trim();
    if (/max-age=0/i.test(value)) {
      // browser deletes the cookie
      const prefix = name + '=';
      cookieJar = cookieJar.split('; ').filter((c) => !c.startsWith(prefix)).join('; ');
    } else {
      const prefix = name + '=';
      cookieJar = cookieJar.split('; ').filter((c) => !c.startsWith(prefix)).concat([value]).join('; ');
    }
  },
};

globalThis.localStorage = {
  get length() {
    if (storageBroken) throw new Error('storage blocked');
    return storage.size;
  },
  key(i) {
    if (storageBroken) throw new Error('storage blocked');
    return Array.from(storage.keys())[i];
  },
  getItem(k) {
    if (storageBroken) throw new Error('storage blocked');
    return storage.has(k) ? storage.get(k) : null;
  },
  setItem(k, v) {
    if (storageBroken) throw new Error('storage blocked');
    storage.set(k, String(v));
  },
  removeItem(k) {
    if (storageBroken) throw new Error('storage blocked');
    storage.delete(k);
  },
  clear() {
    if (storageBroken) throw new Error('storage blocked');
    storage.clear();
  },
};

globalThis.window = {};

const realNow = Date.now;
let fakeNow = 1_700_000_000_000;
Date.now = () => fakeNow;
const sleep = (ms) => {
  fakeNow += ms;
};

const MINUTE = 60 * 1000;
const R1 = { report_id: 'r1', status: 'pending', timestamp: '2026-01-01T00:00:00Z', severity: 'high', incident_type: 'Flood' };
const buildSignature = (rows) =>
  rows.map((r) => [r.report_id, r.status, r.timestamp, r.severity, r.incident_type].join(':')).join('|');

const cookieKey = 'smart_connect_report_history_meta_test_user_all';
const storageKey = 'smart_connect_report_history_data_test_user_all';

let dbRows = [];
let fullCalls = 0;
let sigCalls = 0;
let applied = [];

const options = {
  cookieKey,
  storageKey,
  fetchSignature: async () => {
    sigCalls++;
    return buildSignature(dbRows);
  },
  fetchFull: async () => {
    fullCalls++;
    const data = { reports: dbRows.map((r) => ({ id: r.report_id })), hasMore: false, page: 0 };
    return { data, signature: buildSignature(dbRows) };
  },
  applyData: (data) => {
    applied = data.reports;
  },
  onFinishedLoading: () => {},
};

process.stdout.write('TTL check ................. ');
assert(BROWSER_CACHE_TTL_MS === 2 * MINUTE, `BROWSER_CACHE_TTL_MS must be exactly 2 minutes, got ${BROWSER_CACHE_TTL_MS / MINUTE} min`);
console.log('OK (2 minutes)');

// Scenario 1 — first request: full DB load, list applied, cache stored.
process.stdout.write('Scenario 1 (first load) .. ');
await loadCachedOrFresh(options);
assert(fullCalls === 1, `fullCalls expected 1, got ${fullCalls}`);
assert(sigCalls === 0, `sigCalls expected 0, got ${sigCalls}`);
assert(applied.length === 0, 'applied should be the stored (empty) list');
console.log('OK');

// Scenario 2 — server gained a report, but user re-visits within 2 minutes:
//              NO database call at all, still showing the stored list.
process.stdout.write('Scenario 2 (< 2 min) ..... ');
dbRows = [R1];
await loadCachedOrFresh(options);
assert(fullCalls === 1, `fullCalls must stay 1 (no full load), got ${fullCalls}`);
assert(sigCalls === 0, `sigCalls must stay 0 (no DB at all), got ${sigCalls}`);
assert(applied.length === 0, 'should still show the cached (empty) list within 2 minutes');
console.log('OK');

// Scenario 3 — 3 minutes later, server unchanged: cheap signature check only.
process.stdout.write('Scenario 3 (> 2 min, same) ');
sleep(3 * MINUTE);
dbRows = [];
await loadCachedOrFresh(options);
assert(sigCalls === 1, `sigCalls expected 1, got ${sigCalls}`);
assert(fullCalls === 1, `fullCalls must stay 1 (nothing changed), got ${fullCalls}`);
assert(applied.length === 0, 'still showing cached data');
console.log('OK');

// right after scenario 3's refresh, another visit must again be a no-op
process.stdout.write('Scenario 3b (touched) ..... ');
await loadCachedOrFresh(options);
assert(sigCalls === 1, `sigCalls expected still 1 after refresh, got ${sigCalls}`);
console.log('OK');

// Scenario 4 — 3 minutes later, server HAS new data → signature check + reload.
process.stdout.write('Scenario 4 (> 2 min, new)  ');
sleep(3 * MINUTE);
dbRows = [R1];
await loadCachedOrFresh(options);
assert(sigCalls === 2, `sigCalls expected 2, got ${sigCalls}`);
assert(fullCalls === 2, `fullCalls expected 2 (changed → reload), got ${fullCalls}`);
assert(applied.length === 1 && applied[0].id === 'r1', 'applied should be the fresh list');
console.log('OK');

// Scenario 5 — the browser cleared its cookies: the localStorage metadata
//              mirror must keep the cache working (still no database call).
process.stdout.write('Scenario 5 (no cookies) ... ');
cookieJar = '';
fullCalls = 0;
sigCalls = 0;
await loadCachedOrFresh(options); // still inside the 2 minute window
assert(fullCalls === 0, `fullCalls expected 0, got ${fullCalls}`);
assert(sigCalls === 0, `sigCalls expected 0, got ${sigCalls}`);
assert(applied.length === 1 && applied[0].id === 'r1', 'cached data must still be applied');
console.log('OK');

// Scenario 6 — clearBrowserCache removes data, metadata and the cookie.
process.stdout.write('Scenario 6 (clear) ....... ');
await loadCachedOrFresh(options);
clearBrowserCache(['smart_connect_report_history']);
const leftovers = Array.from(storage.keys()).filter((k) => k.startsWith('smart_connect_report_history'));
assert(leftovers.length === 0, `expected no matching localStorage keys, got ${leftovers}`);
assert(!cookieJar.includes('smart_connect_report_history'), 'metadata cookie should be deleted');
console.log('OK');

// Boundary — exactly 2 minutes is still fresh; 2 minutes + 1 ms is stale.
process.stdout.write('Boundary (exact 2 min) ... ');
storage.clear();
cookieJar = '';
fullCalls = 0;
sigCalls = 0;
sleep(3 * MINUTE); // let the in-session memory fallback expire so this is a real cold load
await loadCachedOrFresh(options); // fresh full load
assert(fullCalls === 1, `fullCalls expected 1, got ${fullCalls}`);
sleep(2 * MINUTE);
await loadCachedOrFresh(options); // exactly 2 min → still fresh
assert(sigCalls === 0, `sigCalls expected 0 at exactly 2 min, got ${sigCalls}`);
sleep(1);
await loadCachedOrFresh(options); // 2 min + 1 ms → stale → signature check
assert(sigCalls === 1, `sigCalls expected 1 after 2 min + 1 ms, got ${sigCalls}`);
console.log('OK');

// Scenario 7 — session guard: the stored metadata says "stale" but we already
//              asked the database in this session within 2 minutes → skip.
process.stdout.write('Scenario 7 (session guard)  ');
storage.clear();
cookieJar = '';
fullCalls = 0;
sigCalls = 0;
dbRows = [R1];
sleep(3 * MINUTE); // let the in-session memory fallback expire so this is a real cold load
await loadCachedOrFresh(options); // cold full load (also records lastDbCheck)
assert(fullCalls === 1 && sigCalls === 0, `scenario 7: cold load expected full=1/sig=0, got ${fullCalls}/${sigCalls}`);
sleep(1);
// Make BOTH the cookie and the localStorage mirror look old (> 2 min).
// First drop the cookie so readMetadata falls back to the mirror we force below.
cookieJar = '';
const metaKey = storageKey + '__meta__';
const meta = JSON.parse(storage.get(metaKey));
meta.updatedAt = fakeNow - 3 * MINUTE;
storage.set(metaKey, JSON.stringify(meta));
// lastDbCheck was < 2 minutes ago, so the session guard must prevent another DB ask
await loadCachedOrFresh(options);
assert(sigCalls === 0, `scenario 7: sigCalls expected 0 (session guard), got ${sigCalls}`);
assert(fullCalls === 1, `scenario 7: fullCalls expected 1, got ${fullCalls}`);
assert(applied.length === 1 && applied[0].id === 'r1', 'scenario 7: cached data must still be applied');
console.log('OK');

// Scenario 8 — ALL browser storage completely blocked: reuse the data we
//              already loaded earlier in this session (no database call).
process.stdout.write('Scenario 8 (no storage) ... ');
storageBroken = true;
cookieJar = '';
fullCalls = 0;
sigCalls = 0;
await loadCachedOrFresh(options); // still within 2 minutes of scenario 7's load
assert(fullCalls === 0, `scenario 8: fullCalls expected 0, got ${fullCalls}`);
assert(sigCalls === 0, `scenario 8: sigCalls expected 0, got ${sigCalls}`);
assert(applied.length === 1 && applied[0].id === 'r1', 'scenario 8: must reuse the in-session data');
storageBroken = false;
console.log('OK');

Date.now = realNow;
console.log('\nAll browser-cache policy checks passed.\n');