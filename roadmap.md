# Roadmap — staged plan

Each stage is finished and checked before the next one starts.

- [x] **Stage 1 — Fix existing defects**
  - [x] Remove dead code (`src/lib/ai/output.ts` + its test, `drizzle/`, `drizzle.config.ts`).
  - [x] One shared preview module (`src/lib/preview.ts`) with CSP + in-memory storage fallback, and tests.
  - [x] Edge function: cached model discovery, optional `GEMINI_MODEL`, API key sent in a header (not the URL), `type="module"` scripts survive inlining.
  - [x] Version snapshots no longer duplicate `previewHtml` (smaller project rows).
  - [x] README / docs updated.
- [x] **Stage 2 — Database foundation** (details: `docs/app-database.md`)
  - [x] Tables `project_apps`, `app_collections`, `app_records`, `app_rate_limits` with RLS and least-privilege grants.
  - [x] `app-api` Edge Function: public key, declared collections, per-collection permissions, size caps, rate limits, record cap.
  - [x] Owner server functions: key, collections, rotate key. Unit tests for the request logic.
- [x] **Stage 3 — Generator learns the database**
  - [x] `db.js` SDK written by the server (key + URL embedded), inlined into the preview, included in the ZIP.
  - [x] Per-record owner tokens: visitors can edit or delete only what their own browser created.
  - [x] Prompt with database rules (privacy by default, no login or admin screens, textContent only); the model declares collections and visitor operations.
  - [x] Server-side planning: invalid names dropped, undeclared collections added create-only, max 20, summary note in Persian.
  - [x] Preview CSP opens exactly one address (own `app-api`, own Supabase host). Daily budget 300k -> 500k tokens.
- [x] **Stage 4 — Data UI** (`src/components/builder/DataPanel.tsx`)
  - [x] "داده‌ها" view next to the files: collections with counts, records table with paging, add / edit (JSON) / delete.
  - [x] Per-collection visitor permissions (create, public read, edit/delete own) with a red warning for public read; delete a collection.
  - [x] CSV (Excel-safe, formula-neutralised, UTF-8 BOM) and JSON export. Project key shown masked, copy, rotate (saved db.js and preview are updated).
- [x] **Polish — visual identity and UX** (`docs/design.md`)
  - [x] Warm dark palette (charcoal, cream, camel; changed on request), star-and-tile motif, Lalezar display type, new logo and favicon.
  - [x] Landing: new headline and copy, database-ready starters, "what you get" strip, starter tiles.
  - [x] Chat: starter prompts, honest build timer, clearer errors. Preview and credit meter polished.
- [ ] **Stage 5 — Publish and export**: published link, ZIP with config, GitHub and APK guide, final tests.
