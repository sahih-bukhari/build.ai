# Persian AI Builder V3

Persian/Dari-first AI website builder using TanStack Start, React, Supabase Auth, PostgreSQL, Storage, and the deployed `ai-builder` Edge Function.

## Supabase project

This project is configured for Supabase project `f1.ai` (`wsoanthjrhatxaentjgk`). The app stores builder work in `public.projects`: `messages` contains the conversation, `result` contains the latest generation, `files` contains the current source files, and `versions` contains snapshots. Existing rows are preserved.

## Environment

Copy `.env.example` to `.env` and set the Supabase URL and publishable key. The publishable key can be used in browser code. Never put a service-role or secret key in a `VITE_` variable.

The `ai-builder` Edge Function requires `GEMINI_API_KEY` configured as a Supabase Function Secret. Supabase provides `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Edge Functions. The function requires a signed-in user's JWT (`verify_jwt = true`) and enforces a 30-generation daily quota in PostgreSQL.

### Authentication setup

- Email/password authentication uses Supabase Auth.
- Google sign-in now uses Supabase OAuth directly (it no longer requires the Lovable Cloud auth bridge). To enable it, configure the Google provider in **Authentication → Sign In / Providers → Google**. Add `https://wsoanthjrhatxaentjgk.supabase.co/auth/v1/callback` as the Google OAuth redirect URI, then add your deployed app URL ending in `/auth` to Supabase's allowed redirect URLs.
- Email confirmation and recovery redirects use `/builder` and `/reset-password` on the current app origin.

### Storage and privacy

- `project-references` is a private bucket. Object paths must start with the authenticated user's UUID; RLS policies restrict upload, read, and deletion to that owner.
- Generated project data is persisted in `public.projects`. The current project result and files are saved along with conversation messages and version snapshots.
- Uploaded reference files are temporary. The app attempts to remove them after a successful generation; failed attempts may leave a temporary object until the user removes it.

### Security note

The quota reservation RPC now runs as `SECURITY INVOKER` under explicit owner-only RLS policies; its daily limit is fixed server-side at 30 and its `search_path` is empty. The unused legacy assistant-message RPC is no longer executable by application users. The remaining leaked-password protection warning is a separate Auth Dashboard setting and must be enabled there if the project plan supports it.

## Run

```bash
bun install
bun run dev
```

## Hosting

This is a TanStack Start app with server functions, not a static-only site. Deploy it to an SSR/Worker-capable host (the included build preset targets Cloudflare's Nitro runtime by default). GitHub Pages alone cannot execute the server functions used for authenticated database operations.

## Checks

```bash
bun run lint
bun run test
bun run build
```

## Deploying the Edge Function

Deploy `supabase/functions/ai-builder/index.ts` to project `wsoanthjrhatxaentjgk` with JWT verification enabled. The matching deployed function was updated through the Supabase connection for this project.

### Database setup on a brand-new Supabase project

`supabase/migrations/20261103113149_baseline_schema.sql` now creates the five tables (`projects`, `conversations`, `messages`, `user_settings`, `ai_usage_daily`), indexes, triggers, RLS policies and minimal grants from scratch. Run the migrations in filename order (`supabase db push`), then set the secret `GEMINI_API_KEY` and deploy the `ai-builder` function. On the existing `f1.ai` project the baseline is a no-op. `20261106011111_revoke_unneeded_table_privileges.sql` removes TRUNCATE/TRIGGER/REFERENCES from `anon` and `authenticated`; it is already applied on `f1.ai`.

The `drizzle/` folder is a legacy leftover and is not used by the app. Do not run it against Supabase.

Database changes are additive and recorded in the migration files under `supabase/migrations/`. They preserve existing project rows. The database fixes the quota at 30 per UTC day; callers cannot increase it by changing the RPC argument.
