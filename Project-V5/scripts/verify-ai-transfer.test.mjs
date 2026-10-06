// Regression test for the "transfer to a different department" feature on the
// Map incident view card (MapView).
//
// Covers:
//   A. parseAiPredictedLabel + matchesIncidentType gating against the real
//      ai_interpretation formats stored in the database
//      (the transfer control must appear ONLY when the AI model predicts
//      something else while the incident type is something else).
//   B. getTransferableDepartments only offers DIFFERENT departments.
//   C. every canonical incident type used by a transfer routes to its
//      own department.
//   D. RLS: a real departmental admin JWT can update incident_type
//      (no data is changed - the update writes back the current value).
//
// Run with: node --experimental-strip-types scripts/verify-ai-transfer.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

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

// --- Load the real modules -------------------------------------------------
// aiReview.ts pulls in the browser supabase client and the classifier; stub
// both so the pure parsing functions can run under Node.
const require = createRequire(import.meta.url);
const { build } = require('esbuild');

const stubPlugin = {
  name: 'stubs',
  setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({
      path: 'supabase-stub',
      namespace: 'stub',
    }));
    builder.onResolve({ filter: /incidentClassifier$/ }, () => ({
      path: 'classifier-stub',
      namespace: 'stub',
    }));
    builder.onLoad({ filter: /^supabase-stub$/ }, () => ({
      contents: 'export const supabase = {};',
      loader: 'js',
    }));
    builder.onLoad({ filter: /^classifier-stub$/ }, () => ({
      contents: 'export const classifyIncidentImage = async () => [];',
      loader: 'js',
    }));
  },
};

const bundle = await build({
  entryPoints: [join(root, 'src', 'utils', 'aiReview.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  plugins: [stubPlugin],
});
const aiReviewModuleUrl = `data:text/javascript;base64,${Buffer.from(
  bundle.outputFiles[0].text
).toString('base64')}`;
const { parseAiPredictedLabel, matchesIncidentType, parseAiVerdict } = await import(aiReviewModuleUrl);

const {
  getDepartmentsForIncidentType,
  getTransferableDepartments,
  DEPARTMENT_CANONICAL_INCIDENT_TYPE,
  DEPARTMENT_OPTIONS,
} = await import('../src/config/departments.ts');

/** Mirrors the gating expression used on the MapView card. */
const shouldOfferTransfer = (incidentType, aiText) => {
  const label = parseAiPredictedLabel(aiText);
  return !!label && !matchesIncidentType(label, incidentType);
};

// --- A. Gating against real interpretation formats -------------------------
// Samples are the actual ai_interpretation texts stored in the database.
const samples = [
  // Confirmed match -> AI predicts the SAME thing -> no transfer.
  {
    name: 'Fire confirmed (match)',
    type: 'Fire',
    ai: 'Run AI review: Fire 71%, Pothole 50%, Garbage 50%, Accident 50%, Water_Logging 50%. Fire confirmed at 71% confidence. Verdict: auto-approved.',
    expect: false,
  },
  {
    name: 'Pothole confirmed with legacy prefix (match)',
    type: 'Pothole',
    ai: 'Run AI review: Pothole 70%. Pothole confirmed at 70% confidence. Verdict: auto-approved.',
    expect: false,
  },
  {
    name: 'Garbage confirmed plain (match)',
    type: 'Garbage',
    ai: 'Garbage confirmed at 51% confidence. Verdict: auto-approved.',
    expect: false,
  },
  // Confident mismatch -> AI predicts something else -> transfer offered.
  {
    name: 'Image shows Garbage for reported Pothole (mismatch)',
    type: 'Pothole',
    ai: 'Run AI review: Garbage 70%, Flood 50%, Pothole 50%, Water_Logging 50%, Accident 50%, Landslide 50%. The image shows Garbage (70% confidence), which does not match the reported Pothole. Verdict: auto-rejected.',
    expect: true,
  },
  // Unsure but still a mismatch between prediction and incident type.
  {
    name: 'Detected Landslide for reported Garbage (mismatch)',
    type: 'Garbage',
    ai: 'The model is unsure: detected Landslide at 56% confidence for the reported Garbage. Manual review required. Verdict: manual review required.',
    expect: true,
  },
  // Special accident path - still a mismatch against the incident type.
  {
    name: 'Accident report, model saw Pothole (mismatch)',
    type: 'Accident',
    ai: 'Accident reports always need a human decision: Pothole detected at 49% confidence. Manual review required. Verdict: manual review required.',
    expect: true,
  },
  // Underscore/case differences must NOT count as a mismatch.
  {
    name: 'Water_Logging detected for reported Water Logging (match)',
    type: 'Water Logging',
    ai: 'The model is unsure: detected Water_Logging at 50% confidence for the reported Water Logging. Manual review required. Verdict: manual review required.',
    expect: false,
  },
  // Unrecognizable image -> no prediction at all -> no transfer.
  {
    name: 'Fake/unrecognizable image (no prediction)',
    type: 'Water Leakage',
    ai: 'The image is fake or unrecognizable - no supported incident could be confirmed (highest 50% confidence).\nVerdict: auto-rejected.',
    expect: false,
  },
  // AI still pending -> no prediction -> no transfer.
  { name: 'AI not reviewed yet', type: 'Pothole', ai: '', expect: false },
  { name: 'AI null', type: 'Pothole', ai: null, expect: false },
];

for (const s of samples) {
  assert(
    shouldOfferTransfer(s.type, s.ai) === s.expect,
    `${s.name} -> transfer ${s.expect ? 'shown' : 'hidden'}`
  );
}
assert(parseAiVerdict(samples[1].ai) === 'approved', 'verdict parsing untouched by the new export');

// --- B. Only DIFFERENT departments are offered -----------------------------
const potholeTargets = getTransferableDepartments('Pothole');
assert(!potholeTargets.includes('Public Works Department'), 'Pothole cannot be transferred to its own department (Public Works)');
assert(potholeTargets.length === DEPARTMENT_OPTIONS.length - 1, 'exactly one department excluded for a single-department incident');

const accidentTargets = getTransferableDepartments('Accident');
assert(
  !accidentTargets.includes('Traffic Police') && !accidentTargets.includes('Disaster Management'),
  'Accident cannot be transferred to Traffic Police or Disaster Management (both excluded)'
);
assert(accidentTargets.includes('Fire Department'), 'Accident can be transferred to Fire Department');

// A report whose type maps to no department can go anywhere.
const unroutedTargets = getTransferableDepartments('Water Leakage');
assert(unroutedTargets.length === DEPARTMENT_OPTIONS.length, 'unroutable type can be transferred to any department');

// --- C. Canonical transfer types route to their own department -------------
for (const department of DEPARTMENT_OPTIONS) {
  const canonical = DEPARTMENT_CANONICAL_INCIDENT_TYPE[department];
  assert(
    !!canonical && getDepartmentsForIncidentType(canonical).includes(department),
    `canonical type "${canonical}" routes to "${department}"`
  );
}

// --- D. RLS: a departmental admin can update incident_type -----------------
const { createClient } = await import('@supabase/supabase-js');
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: admins } = await service
  .from('admins')
  .select('a_id, a_email, department_name')
  .not('department_name', 'is', null)
  .limit(1);

if (admins?.length) {
  const adminEmail = admins[0].a_email;
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({ type: 'magiclink', email: adminEmail });
  if (linkErr) throw linkErr;
  const tokenHash = link?.hashed_token ?? link?.properties?.hashed_token;
  const { data: otp, error: otpErr } = await service.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
  if (otpErr) throw otpErr;

  const { data: row } = await service
    .from('incident_reports')
    .select('report_id, incident_type')
    .limit(1)
    .maybeSingle();

  if (row) {
    const adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${otp.session.access_token}` } },
    });
    // No-op write: sets the column to the value it already has, so no data
    // changes - it only proves the admin role is allowed to update it.
    const { error: rlsError } = await adminClient
      .from('incident_reports')
      .update({ incident_type: row.incident_type })
      .eq('report_id', row.report_id);
    assert(!rlsError, `admin JWT can update incident_type${rlsError ? ` (${rlsError.message})` : ''}`);
  } else {
    console.log('SKIP: no incident rows to test the update permission on');
  }
} else {
  console.log('SKIP: no departmental admin found for the RLS check');
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
