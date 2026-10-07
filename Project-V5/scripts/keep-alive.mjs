// keep-alive.mjs
//
// Manual / local Supabase keep-alive ping.
//
// Supabase pauses FREE projects after 1 week of inactivity
// (https://supabase.com/pricing). The automated safety net is the scheduled
// GitHub Actions workflow in .github/workflows/supabase-keep-alive.yml; this
// script performs the same checks locally, useful to:
//   - verify the Supabase project is awake and the credentials work, and
//   - keep the project alive from a local machine / Task Scheduler if the
//     GitHub workflow is unavailable.
//
// Reads the project .env (same keys the app uses):
//   SUPABASE_URL or VITE_SUPABASE_URL
//   SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY   (public anon key only)
//   VITE_INCIDENT_AI_URL                          (optional Render wake-up)
//
// Run with: node scripts/keep-alive.mjs
// Exits non-zero if Supabase cannot be reached or answers non-200.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readEnvFile() {
  const envPath = resolve(projectRoot, '.env');
  if (!existsSync(envPath)) return {};
  const values = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    values[match[1]] = value;
  }
  return values;
}

const env = readEnvFile();

const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
const incidentAiUrl = (env.VITE_INCIDENT_AI_URL || '').replace(/\/+$/, '');

async function pingSupabase() {
  if (!supabaseUrl || !anonKey) {
    console.error('✗ Missing SUPABASE_URL / SUPABASE_ANON_KEY in .env.');
    return false;
  }

  // A lightweight authenticated PostgREST request: any successful API request
  // registers as project activity and resets Supabase's inactivity window.
  const target = `${supabaseUrl}/rest/v1/incident_reports?select=report_id&limit=1`;
  try {
    const response = await fetch(target, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    if (response.status === 200) {
      console.log(`✓ Supabase REST ping OK (HTTP 200): ${body}`);
      return true;
    }
    console.error(`✗ Supabase answered HTTP ${response.status}: ${body}`);
    console.error('  If the project is paused, restore it from the Supabase dashboard.');
    return false;
  } catch (error) {
    console.error(`✗ Supabase unreachable: ${error?.message || error}`);
    console.error('  If the project is paused, restore it from the Supabase dashboard.');
    return false;
  }
}

async function pingIncidentAi() {
  if (!incidentAiUrl) {
    console.log('- VITE_INCIDENT_AI_URL not set; skipping Render AI wake-up ping.');
    return true;
  }
  try {
    const response = await fetch(`${incidentAiUrl}/`, {
      signal: AbortSignal.timeout(120_000),
    });
    // Any HTTP response (even 404) proves the service is awake.
    console.log(`✓ Render Incident AI reachable (HTTP ${response.status}).`);
    return true;
  } catch (error) {
    console.error(`✗ Render Incident AI unreachable: ${error?.message || error}`);
    return false;
  }
}

const supabaseOk = await pingSupabase();
const aiOk = await pingIncidentAi();

if (!supabaseOk) process.exit(1);
if (!aiOk) process.exit(1);
console.log('Keep-alive ping completed successfully.');
