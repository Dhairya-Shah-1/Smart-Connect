// e2e regression test for api/manage-admin.ts - runs the real handler with a
// real super-admin token (super admin sign-in is minted via admin magic link).
// Everything it creates is deleted at the end. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (e.g. from the project .env).
// Run with: node --experimental-strip-types scripts/e2e-manage-admin.test.mjs
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

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log(`PASS: ${msg}`);
  else { console.error(`FAIL: ${msg}`); failures += 1; }
};

const { createClient } = await import('@supabase/supabase-js');
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- 1. Find the super admin and mint a session token for them ---
const { data: saRows, error: saErr } = await service.from('super_admins').select('sa_id').limit(1);
if (saErr) throw saErr;
if (!saRows?.length) throw new Error('no super_admins rows found');
const saId = saRows[0].sa_id;

let saEmail = null;
for (let page = 1; page <= 20 && !saEmail; page += 1) {
  const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  const match = (data?.users || []).find((u) => u.id === saId);
  if (match) saEmail = match.email;
  if ((data?.users || []).length < 200) break;
}
if (!saEmail) throw new Error('super admin auth user not found');
console.log(`Super admin: ${saEmail}`);

const { data: link, error: linkErr } = await service.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
if (linkErr) throw linkErr;
const tokenHash = link?.hashed_token ?? link?.properties?.hashed_token;
const { data: otp, error: otpErr } = await service.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
if (otpErr) throw otpErr;
const token = otp.session.access_token;

// --- 2. Run the real handler ---
const handler = (await import('../api/manage-admin.ts')).default;
const testEmail = `e2e-manage-admin-fix-${Date.now()}@example.com`;

const req = new Request('http://localhost/api/manage-admin', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    email: testEmail,
    password: 'Test@12345',
    name: 'E2E Test Admin',
    department_name: 'Traffic Police',
    location: 'Vadodara, Gujarat',
  }),
});

const res = await handler(req);
const body = await res.json().catch(() => ({}));
console.log(`handler status: ${res.status} body: ${JSON.stringify(body)}`);
assert(res.status === 200 && body.success === true, 'handler created the admin (200 + success)');

// --- 3. Verify the stored rows ---
const { data: row } = await service
  .from('admins')
  .select('a_id, a_name, department_name, station, location')
  .eq('a_email', testEmail)
  .maybeSingle();
assert(!!row, 'admins row exists');
assert(row?.station === 'Vadodara, Gujarat', 'free-text location stored in `station`');
assert(row?.location === null || row?.location === undefined, 'geography `location` stays NULL');
assert(row?.department_name === 'Traffic Police', 'department stored');

const { data: profile } = await service.from('users').select('u_id, u_name, u_email').eq('u_id', row?.a_id ?? '').maybeSingle();
assert(!!profile, 'public.users profile row exists (admins.a_id FK satisfied)');
assert(profile?.u_name === 'E2E Test Admin', 'profile name matches');

// --- 4. Simulate what AdminList/SuperAdminDashboard read ---
const { data: listRow } = await service.from('admins').select('location, station, district').eq('a_email', testEmail).maybeSingle();
const displayed = listRow?.location || listRow?.station;
assert(displayed === 'Vadodara, Gujarat', `AdminList MapPin line renders "${displayed}"`);

// --- 5. Cleanup everything this test created ---
if (row?.a_id) {
  await service.from('admins').delete().eq('a_id', row.a_id);
  await service.from('users').delete().eq('u_id', row.a_id);
  const { error: delErr } = await service.auth.admin.deleteUser(row.a_id);
  if (delErr) console.error(`cleanup warning: deleteUser: ${delErr.message}`);
}
const { data: verifyGone } = await service.from('admins').select('a_id').eq('a_email', testEmail).maybeSingle();
assert(!verifyGone, 'cleanup: test admin row removed');

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
