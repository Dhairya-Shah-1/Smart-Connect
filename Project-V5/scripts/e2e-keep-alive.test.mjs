// regression test for api/keep-alive.ts - loads the project .env, runs the
// real handler and asserts it pings Supabase successfully (and rejects
// non-GET methods). Requires SUPABASE_URL / SUPABASE_ANON_KEY (or the VITE_
// variants) from the project .env.
// Run with: node --experimental-strip-types scripts/e2e-keep-alive.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (existsSync(resolve(root, '.env'))) {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
}

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log(`PASS: ${msg}`);
  else { console.error(`FAIL: ${msg}`); failures += 1; }
};

const handler = (await import('../api/keep-alive.ts')).default;

// --- 1. GET pings Supabase and returns ok ---
let res = await handler(new Request('http://localhost/api/keep-alive'));
let body = await res.json().catch(() => ({}));
console.log(`GET status: ${res.status} body: ${JSON.stringify(body)}`);
assert(res.status === 200 && body.ok === true && body.supabaseStatus === 200, 'GET pings Supabase (200 + ok)');
assert(typeof body.durationMs === 'number', 'response reports ping duration');

// --- 2. Non-GET methods are rejected ---
res = await handler(new Request('http://localhost/api/keep-alive', { method: 'POST' }));
assert(res.status === 405, 'POST is rejected with 405');

if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('All keep-alive checks passed.');
