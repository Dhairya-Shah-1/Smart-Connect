# Smart Connect

Smart Connect is a Vite + React incident-reporting app backed by Supabase, with AI-assisted incident analysis through the deployed Smart Connect model.

## Environment setup

1. Copy `.env.example` to `.env`.
2. Fill in the required values:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Notes:
- `VITE_` variables are used by the frontend.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are used only by the server/API routes. Set these values in Vercel (not `VITE_` variables). The service-role key lets the authenticated `/api/upload-evidence` route save normal-user evidence without weakening Storage RLS; it must never be exposed in browser code.
- The server uploads the stored evidence image to `https://smartconnect-api.onrender.com/predict` and saves the returned confidence percentage; no Gemini key is required.
- `.env` files are ignored by git, while `.env.example` is safe to commit.

## Running locally

```bash
npm ci
npm run dev
```

## GitHub readiness

This repo is configured so that:
- secrets are loaded from environment variables instead of being hardcoded
- `.env` files are excluded from git
- `.env.example` documents the required configuration for new contributors
