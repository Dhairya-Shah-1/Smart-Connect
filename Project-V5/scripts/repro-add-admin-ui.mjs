// UI-level reproduction for the Add Admin flow: drives a real headless Chrome
// against the running Vite dev server, signs the super admin in (session
// injected exactly the way LoginPage writes it), opens Super Admin -> Manage
// Admins -> Add Admin, fills the form, submits, and records:
//   - whether the POST /api/manage-admin request is sent / answered
//   - console errors / page exceptions
//   - the state of the submit button ("Adding..." = the reported buffering)
// Everything created is deleted at the end.
// Run with: node scripts/repro-add-admin-ui.mjs
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (existsSync(resolve(root, '.env'))) {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const APP_URL = 'http://localhost:3000';
const CDP_PORT = 9333;
const PROFILE_DIR = resolve(root, '_cdp-repro');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const testEmail = `repro-add-admin-${Date.now()}@example.com`;
// VARIANT=mobile runs the narrow-viewport two-step wizard; VARIANT=hang
// simulates a wedged server (CDP pauses the API request forever) to prove the
// client-side timeout always ends the spinner. Default is desktop.
const rawVariant = process.env.VARIANT;
const VARIANT = rawVariant === 'mobile' || rawVariant === 'hang' ? rawVariant : 'desktop';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. Mint a real super-admin session (same as the e2e test) ----------
const { createClient } = await import('@supabase/supabase-js');
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: saRows, error: saErr } = await service.from('super_admins').select('sa_id').limit(1);
if (saErr) throw saErr;
if (!saRows?.length) throw new Error('no super_admins rows found');
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
const session = otp.session;
console.log(`Signed in as super admin: ${saEmail}`);

const projectRef = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
const supabaseStorageKey = `sb-${projectRef}-auth-token`;

// ---------- 2. Launch headless Chrome ----------
rmSync(PROFILE_DIR, { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--window-size=1400,900',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForCdp() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error('Chrome CDP never came up');
}

const wsUrl = await waitForCdp();
console.log('CDP target acquired:', wsUrl);
const ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
});
console.log('CDP websocket connected');

// Global watchdog so a stuck CDP command can never hang the run silently.
const watchdog = setTimeout(() => {
  console.error('WATCHDOG: repro script did not finish in 240s');
  try {
    chrome.kill();
  } catch {
    /* ignore */
  }
  process.exit(2);
}, 240_000);
watchdog.unref?.();


let nextId = 1;
const pending = new Map();
const consoleMessages = [];
const pageErrors = [];
const apiTraffic = new Map(); // requestId -> {url, sentAt, status, finishedAt, failed}

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve: res, reject: rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(msg.error.message));
    else res(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || [])
      .map((a) => a.value ?? a.description ?? JSON.stringify(a))
      .join(' ');
    consoleMessages.push({ type: msg.params.type, text });
  } else if (msg.method === 'Runtime.exceptionThrown') {
    pageErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
  } else if (msg.method === 'Network.requestWillBeSent') {
    const { requestId, request, timestamp } = msg.params;
    if (request.url.includes('/api/manage-admin')) {
      apiTraffic.set(requestId, { url: request.url, sentAt: timestamp });
    }
  } else if (msg.method === 'Network.responseReceived') {
    const { requestId, response } = msg.params;
    const rec = apiTraffic.get(requestId);
    if (rec) {
      rec.status = response.status;
      rec.statusText = response.statusText;
    }
  } else if (msg.method === 'Network.loadingFinished') {
    const rec = apiTraffic.get(msg.params.requestId);
    if (rec) rec.finishedAt = msg.params.timestamp;
  } else if (msg.method === 'Network.loadingFailed') {
    const rec = apiTraffic.get(msg.params.requestId);
    if (rec) rec.failed = msg.params.errorText;
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolvePromise, rejectPromise) => {
    pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || 'evaluation failed');
  }
  return result.result.value;
}

async function waitFor(expression, label, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expression)) return true;
    await sleep(400);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

try {
  console.log('Enabling CDP domains...');
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VARIANT === 'mobile' ? 500 : 1400,
    height: 900,
    deviceScaleFactor: 1,
    mobile: VARIANT === 'mobile',
  });
  console.log(`Domains enabled (variant: ${VARIANT})`);

  // ---------- 3. Seed the app's session exactly like LoginPage writes it ----------
  console.log('Navigating to /login...');
  await send('Page.navigate', { url: `${APP_URL}/login` });
  await sleep(2500);
  console.log('At /login, seeding session storage');

  const seed = `(() => {
    const session = ${JSON.stringify(session)};
    const user = ${JSON.stringify({
      id: saId,
      email: saEmail,
      role: 'super_admin',
      name: saEmail.split('@')[0],
      profile: { sa_id: saId },
    })};
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    sessionStorage.setItem('smart_connect_login_at', String(Date.now()));
    sessionStorage.setItem(${JSON.stringify(supabaseStorageKey)}, JSON.stringify(session));
    localStorage.removeItem('currentUser');
    return JSON.stringify(Object.keys(sessionStorage));
  })()`;
  console.log('Seeded sessionStorage keys:', await evaluate(seed));

  // ---------- 4. Open the dashboard and the Add Admin modal ----------
  console.log('Navigating to /super-admin...');
  await send('Page.navigate', { url: `${APP_URL}/super-admin` });
  await waitFor(
    `[...document.querySelectorAll('button')].some(b => b.textContent.includes('Manage Admins'))`,
    'Manage Admins tab',
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Manage Admins')).click()`,
  );
  await waitFor(`document.body.textContent.includes('System Admins')`, 'AdminList');
  console.log('AdminList visible, opening Add Admin modal...');
  await waitFor(
    `[...document.querySelectorAll('button')].some(b => b.textContent.includes('Add Admin') && b.type !== 'submit')`,
    'Add Admin header button',
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Add Admin') && b.type !== 'submit').click()`,
  );
  await waitFor(`!!document.getElementById('admin-email')`, 'Add Admin modal');
  console.log('Modal open, filling the form...');

  // ---------- 5. Fill the form ----------
  const setNative = (selector, value) => {
    const el = document.querySelector(selector);
    if (!el) return `missing ${selector}`;
    const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  };
  const fill = async (selector, value) => {
    const expr = `(${setNative.toString()})(${JSON.stringify(selector)}, ${JSON.stringify(value)})`;
    const status = await evaluate(expr);
    if (status !== 'ok') throw new Error(status);
    await sleep(120);
  };

  await fill('#admin-email', testEmail);
  await fill('#admin-password', 'Test@12345');
  if (VARIANT === 'mobile') {
    // Narrow viewport: the wizard only shows credentials on step 1/2.
    await evaluate(
      `[...document.querySelectorAll('form button[type=button]')].find(b => b.textContent.trim() === 'Save').click()`,
    );
    await waitFor(`!!document.getElementById('admin-name')`, 'mobile wizard step 2/2');
    console.log('Mobile wizard advanced to step 2/2');
  }
  await fill('#admin-name', 'Repro Test Admin');
  await fill('#admin-department', 'Traffic Police');
  await fill('#admin-location', 'Vadodara, Gujarat');

  // ---------- 6. Submit and watch what happens ----------
  const readState = `(() => {
    const form = document.querySelector('form');
    const btn = form && form.querySelector('button[type=submit]');
    const toasts = [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.textContent);
    const errorBox = form && [...form.querySelectorAll('div')].find(d => /red-600|red-300/.test(d.className));
    return JSON.stringify({
      modalOpen: !!form,
      buttonText: btn ? btn.textContent.trim() : null,
      buttonDisabled: btn ? btn.disabled : null,
      inlineError: errorBox ? errorBox.textContent.trim() : null,
      toasts,
      adminsHeading: (document.querySelector('h2') || {}).textContent || null,
    });
  })()`;

  console.log('State before submit:', await evaluate(readState));
  if (VARIANT === 'hang') {
    // Simulate a wedged server: CDP pauses every /api/manage-admin request and
    // never resumes it, so without a client-side timeout the fetch - and the
    // "Adding..." spinner - would hang forever.
    await send('Fetch.enable', { patterns: [{ urlPattern: '*api/manage-admin*', requestStage: 'Request' }] });
    console.log('Fetch interception ON (simulated server hang)');
  }
  const submittedAt = Date.now();
  await evaluate(`document.querySelector('form button[type=submit]').click()`);

  const timeline = [];
  let outcome = 'unknown';
  const maxWaitMs = VARIANT === 'hang' ? 75_000 : 25_000;
  const maxIterations = VARIANT === 'hang' ? 150 : 60;
  for (let i = 0; i < maxIterations; i += 1) {
    await sleep(500);
    const state = JSON.parse(await evaluate(readState));
    timeline.push({ t: Date.now() - submittedAt, ...state });
    if (!state.modalOpen && state.toasts.length > 0) {
      outcome = 'closed-with-toast';
      break;
    }
    if (!state.modalOpen) {
      outcome = 'closed';
      break;
    }
    if (state.buttonText && !state.buttonText.includes('Adding') && state.inlineError) {
      outcome = 'error-shown';
      break;
    }
    if (Date.now() - submittedAt > maxWaitMs) break;
  }
  if (VARIANT === 'hang') {
    try {
      await send('Fetch.disable');
    } catch {
      /* ignore */
    }
  }

  const finalState = JSON.parse(await evaluate(readState));

  // Watch what happens behind/around the modal for the next 10s: a stuck
  // "Loading admins..." loader here would also look like buffering to the user.
  const listSamples = [];
  const readList = `(() => JSON.stringify({
    listLoading: document.body.textContent.includes('Loading admins'),
    hasSystemAdmins: document.body.textContent.includes('System Admins'),
    toasts: [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.textContent),
    modalOpen: !!document.querySelector('form'),
  }))()`;
  for (let i = 0; i < 20; i += 1) {
    listSamples.push({ t: Date.now() - submittedAt, ...JSON.parse(await evaluate(readList)) });
    await sleep(500);
  }

  console.log('\n=== OUTCOME ===');
  console.log(`outcome: ${outcome}`);
  console.log('final state:', JSON.stringify(finalState, null, 2));
  const changed = listSamples.filter(
    (s, i, a) => i === 0 || i === a.length - 1 || JSON.stringify(s) !== JSON.stringify(a[i - 1]),
  );
  console.log('list/loader samples over 10s (changes only):', JSON.stringify(changed, null, 2));
  console.log('\nAPI traffic for /api/manage-admin:');
  if (apiTraffic.size === 0) console.log('  (NO REQUEST WAS EVER SENT)');
  for (const rec of apiTraffic.values()) {
    console.log(
      `  status=${rec.status ?? 'none'} finished=${rec.finishedAt ? 'yes' : 'no'} failed=${rec.failed ?? 'none'}`,
    );
  }
  console.log('\nPage exceptions:', pageErrors.length ? pageErrors : '(none)');
  const errors = consoleMessages.filter((m) => m.type === 'error' || m.type === 'warning');
  console.log('Console errors/warnings:', errors.length ? errors : '(none)');

  // ---------- 7. Cleanup ----------
  const { data: row } = await service.from('admins').select('a_id').eq('a_email', testEmail).maybeSingle();
  if (row?.a_id) {
    await service.from('admins').delete().eq('a_id', row.a_id);
    await service.from('users').delete().eq('u_id', row.a_id);
    const { error: delErr } = await service.auth.admin.deleteUser(row.a_id);
    if (delErr) console.error('cleanup warning: deleteUser:', delErr.message);
    console.log('\nCleanup: test admin removed');
  } else {
    console.log('\nCleanup: no admin row was created');
  }
  process.exitCode = 0;
} catch (err) {
  console.error('\nREPRO FAILED:', err?.stack || err);
  process.exitCode = 1;
} finally {
  try {
    ws.close();
  } catch {
    /* ignore */
  }
  chrome.kill();
  await sleep(500);
  rmSync(PROFILE_DIR, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0);
}

