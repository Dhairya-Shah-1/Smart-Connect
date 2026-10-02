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
GEMINI_API_KEY=your-gemini-api-key
VITE_INCIDENT_AI_URL=https://your-service.onrender.com
```

Notes:
- `VITE_` variables are used by the frontend.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `GEMINI_API_KEY` are used by the server/API route.
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
