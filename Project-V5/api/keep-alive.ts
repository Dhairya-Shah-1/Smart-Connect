// api/keep-alive.ts
//
// Supabase keep-alive ping, invoked daily by Vercel Cron (see the "crons"
// entry in vercel.json). Supabase pauses FREE projects after 1 week of
// inactivity (https://supabase.com/pricing); any successful API request to
// the project counts as activity, so this read-only ping keeps the
// inactivity window from ever expiring - independently of the GitHub
// Actions workflow in .github/workflows/supabase-keep-alive.yml (which is
// subject to GitHub's 60-day repository-activity auto-disable rule for
// public repos).
//
// Vercel calls this endpoint with HTTP GET (user agent `vercel-cron/1.0`,
// plus an `x-vercel-cron-schedule` header). The handler performs one fixed,
// read-only PostgREST request with the PUBLIC anon key: there is no user
// input and nothing can be mutated, so it is safe to leave open - a casual
// browser hit is equivalent to one extra keep-alive ping.
//
// Environment (read the same way as the other /api handlers, either naming
// convention): SUPABASE_URL or VITE_SUPABASE_URL,
//              SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY.
/// <reference types="./deno.d.ts" />

function readServerEnv(key: string): string | undefined {
  const processValue = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  if (processValue) {
    return processValue;
  }

  try {
    return Deno.env.get(key);
  } catch {
    return undefined;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return json({ error: 'Only GET is allowed.' }, 405);
  }

  const supabaseUrl = (readServerEnv('SUPABASE_URL') || readServerEnv('VITE_SUPABASE_URL') || '').replace(/\/+$/, '');
  const anonKey = readServerEnv('SUPABASE_ANON_KEY') || readServerEnv('VITE_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    return json(
      {
        ok: false,
        error: 'Missing SUPABASE_URL / SUPABASE_ANON_KEY (or the VITE_ variants) environment variables.',
      },
      500,
    );
  }

  // One lightweight authenticated PostgREST request: any successful API
  // request registers as project activity. A SELECT against incident_reports
  // with the anon key exercises the real database path (RLS filters rows
  // rather than erroring, so an empty result is still HTTP 200).
  const target = `${supabaseUrl}/rest/v1/incident_reports?select=report_id&limit=1`;
  const startedAt = Date.now();

  try {
    const response = await fetch(target, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();

    if (response.status !== 200) {
      // A non-200 (typically the project is paused) fails the cron run so
      // Vercel surfaces it in the project's cron activity and you can restore
      // the project from the Supabase dashboard.
      return json(
        {
          ok: false,
          supabaseStatus: response.status,
          body: text,
          hint: 'If the project is paused, restore it from the Supabase dashboard, then re-run the cron.',
        },
        502,
      );
    }

    return json({
      ok: true,
      supabaseStatus: 200,
      durationMs: Date.now() - startedAt,
      at: new Date().toISOString(),
    });
  } catch (error: any) {
    return json(
      {
        ok: false,
        error: error?.message || 'Supabase unreachable',
        hint: 'If the project is paused, restore it from the Supabase dashboard, then re-run the cron.',
      },
      502,
    );
  }
}
