// Transport-level smoke test: mints a real super-admin token and POSTs it
// through the Vite dev-server bridge (http://localhost:3000/api/manage-admin).
// The payload deliberately fails validation (blank name) so NOTHING is created.
// Run with: node --experimental-strip-types scripts/transport-manage-admin.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (existsSync(resolve(root, '.env'))) {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const { createClient } = await import('@supabase/supabase-js');
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: saRows, error: saErr } = await service.from('super_admins').select('sa_id').limit(1);
if (saErr) throw saErr;
const saId = saRows[0].sa_id;

let saEmail = null;
for (let page = 1; page <= 20 && !saEmail; page += 1) {
  const { data } = await service.auth.admin.listUsers({ page, perPage: 200 });
  const match = (data?.users || []).find((u) => u.id === saId);
  if (match) saEmail = match.email;
  if ((data?.users || []).length < 200) break;
}
if (!saEmail) throw new Error('super admin auth user not found');

const { data: link, error: linkErr } = await service.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
if (linkErr) throw linkErr;
const tokenHash = link?.hashed_token ?? link?.properties?.hashed_token;
const { data: otp, error: otpErr } = await service.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
if (otpErr) throw otpErr;
const token = otp.session.access_token;

const started = Date.now();
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30_000);

try {
  const res = await fetch('http://localhost:3000/api/manage-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      email: `transport-probe-${Date.now()}@example.com`,
      password: 'Test@12345',
      name: '', // invalid on purpose: handler must 400 without creating anything
      department_name: 'Traffic Police',
      location: 'Vadodara, Gujarat',
    }),
    signal: controller.signal,
  });
  const body = await res.json().catch(() => ({}));
  console.log(`HTTP ${res.status} in ${Date.now() - started}ms: ${JSON.stringify(body)}`);
  console.log(res.status === 400 ? 'PASS: bridge responded quickly with 400' : 'FAIL: unexpected response');
} catch (err) {
  console.log(`FAIL after ${Date.now() - started}ms: ${err?.name === 'AbortError' ? 'REQUEST TIMED OUT (bridge hung)' : err?.message}`);
} finally {
  clearTimeout(timer);
  process.exit(0);
}
