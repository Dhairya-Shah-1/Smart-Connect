# Smart Connect

Smart Connect is a Vite + React incident-reporting app backed by Supabase, with AI-assisted incident verification through Gemini.

## Environment setup

1. Copy `.env.example` to `.env`.
2. Fill in the required values:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
GEMINI_API_KEY=your-gemini-api-key
VITE_INCIDENT_AI_URL=https://your-service.onrender.com
```

Notes:
- `VITE_` variables are used by the frontend.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `GEMINI_API_KEY` are used by the server/API routes.
- `SUPABASE_SERVICE_ROLE_KEY` is a secret used only by `/api/manage-admin` (Super Admin -> Manage Admins -> **+ Add Admin**) to create admin auth users. Never expose it to the browser.
- `.env` files are ignored by git, while `.env.example` is safe to commit.

## Running locally

```bash
npm ci
npm run dev
```

The Vite development server now serves the existing `/api/verify-incident` handler locally. Set `VITE_INCIDENT_AI_URL` to the Render service URL — the Smart-Connect ONNX model runs automatically after a report is submitted and, on login, reviews any report whose `ai_interpretation` column is still empty.

## GitHub readiness

This repo is configured so that:
- secrets are loaded from environment variables instead of being hardcoded
- `.env` files are excluded from git
- `.env.example` documents the required configuration for new contributors

## Keeping Supabase awake (keep-alive)

Supabase pauses **free** projects after **1 week of inactivity** (see
[supabase.com/pricing](https://supabase.com/pricing)) — a paused project stops
serving API requests until it is restored from the Supabase dashboard. The app
only touches the database while somebody is actively using it, so the repo
ships two keep-alive layers. Any successful API request counts as activity,
so the inactivity window is never reached.

### Layer A — Vercel Cron (immune to the GitHub 60-day rule, recommended)

`api/keep-alive.ts` + the `crons` entry in `vercel.json` pings Supabase
daily at 07:00 UTC (`0 7 * * *`) using the **public anon key**. Vercel Cron
runs as long as the deployment exists — it is **not** disabled after 60 days
of no commits, unlike GitHub scheduled workflows.

One-time setup: in the Vercel dashboard → project → **Settings →
Environment Variables**, make sure `SUPABASE_URL` and `SUPABASE_ANON_KEY`
(or the existing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) are set for
the Production environment, then redeploy. The handler follows the same
convention as the other `/api` routes, so either naming works.

Verify: `node --experimental-strip-types scripts/e2e-keep-alive.test.mjs`
runs the real handler against Supabase and asserts a 200 + ok response.
You can also open `https://<your-app>.vercel.app/api/keep-alive` in a
browser — `{"ok":true,"supabaseStatus":200,...}` means the ping path works.

### Layer B — GitHub Actions (backup)

The scheduled workflow (`.github/workflows/supabase-keep-alive.yml`) sends
one lightweight, authenticated REST request every day.

### One-time setup

1. Open the GitHub repo → **Settings → Secrets and variables → Actions**.
2. Add these repository secrets:

   | Secret | Value |
   | --- | --- |
   | `SUPABASE_URL` | same as `VITE_SUPABASE_URL`, e.g. `https://your-project.supabase.co` |
   | `SUPABASE_ANON_KEY` | same as `VITE_SUPABASE_ANON_KEY` (the **public anon key** — safe here; never put the service role key in this workflow) |
   | `INCIDENT_AI_URL` | *(optional)* the Render service URL, same as `VITE_INCIDENT_AI_URL` — the workflow also wakes the AI service and verifies it responds |

3. Commit the workflow file to the default branch — scheduled workflows only
   run from the default branch. It runs daily at 07:00 UTC and can also be run
   manually from the **Actions** tab (the *Run workflow* button).

### Notes

- If the project is already paused, the workflow fails with a clear error
  message. Restore the project in the Supabase dashboard, then re-run the
  workflow from the Actions tab to confirm recovery.
- GitHub automatically **disables scheduled workflows after 60 days without
  repository activity**. Any push to the repo resets that timer; if the
  workflow has been disabled, re-enable it from the Actions tab.
- Normal app usage also counts as activity — the workflow is the safety net
  for quiet periods, not a replacement for usage.
- Local equivalent: `node scripts/keep-alive.mjs` reads `.env` and performs
  the same checks from your machine — handy to verify credentials, or as a
  manual fallback if the GitHub workflow is disabled.
- The Render AI step is a wake-up/smoke test: Render free services spin down
  after ~15 minutes regardless (waking them takes a cold start of 30–60 s on
  the first request).

## Adding admins (Super Admin)

On the Super Admin dashboard -> Manage Admins tab -> **+ Add Admin**, the super admin can register a new admin
by email with an optional password:

- Password set: an auth user is created with a confirmed email, so the admin signs in with email + password.
- Password left blank: an auth user is created with a confirmed email and no password. The admin then signs in
  with Google using that email. Supabase automatic identity linking attaches the Google identity to the same
  (already confirmed) user, so the admins.a_id link stays valid and no already-registered error is shown.

This work is performed server-side by /api/manage-admin with the service role key, because the browser anon key
cannot create auth users.
