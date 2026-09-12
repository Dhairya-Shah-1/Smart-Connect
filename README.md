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
```

Notes:
- `VITE_` variables are used by the frontend.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are used by the server/API route. The route uploads the stored evidence image to `https://smartconnect-api.onrender.com/predict` and stores the returned confidence percentage; no Gemini key is required.
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
