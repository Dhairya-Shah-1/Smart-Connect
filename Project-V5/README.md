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

## Adding admins (Super Admin)

On the Super Admin dashboard -> Manage Admins tab -> **+ Add Admin**, the super admin can register a new admin
by email with an optional password:

- Password set: an auth user is created with a confirmed email, so the admin signs in with email + password.
- Password left blank: an auth user is created with a confirmed email and no password. The admin then signs in
  with Google using that email. Supabase automatic identity linking attaches the Google identity to the same
  (already confirmed) user, so the admins.a_id link stays valid and no already-registered error is shown.

This work is performed server-side by /api/manage-admin with the service role key, because the browser anon key
cannot create auth users.
