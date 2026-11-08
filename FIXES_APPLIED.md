# اصلاحات نسخهٔ v5 — تاریخچه و پروژه‌های جدید

این نسخه شامل سه اصلاح در رابط کاربری و منطق پروژه‌ها است:

1. **نمایش تاریخچه:** فهرست پروژه‌ها اکنون همهٔ پروژه‌های متعلق به کاربر را از جدول `projects` می‌خواند؛ پروژه‌های خالی نیز دیگر پنهان نمی‌شوند.
2. **ساخت پروژهٔ تازه:** هر بار که کاربر دکمهٔ «پروژهٔ تازه» را می‌زند، یک رکورد جدید ساخته می‌شود و پیش‌نویس قبلی دوباره استفاده نمی‌شود.
3. **مدیریت خطا و تلاش دوباره:** در صورت خطای بارگذاری فهرست یا محتوای یک پروژه، پیام قابل‌فهم و دکمهٔ «تلاش دوباره» نمایش داده می‌شود. هنگام خطای بارگذاری پروژه، آدرس پروژه حفظ می‌شود تا کاربر بتواند همان پروژه را دوباره بارگذاری کند.

## نکتهٔ انتشار

این اصلاحات در سورس برنامه انجام شده‌اند. برای اعمال آن‌ها روی سایت اصلی، فایل‌های این نسخه باید در مخزن/محیط انتشار پروژه جایگزین و دوباره Build و Deploy شوند. هیچ رکوردی از دیتابیس حذف یا ویرایش نشده و هیچ Migration جدیدی لازم نیست.

## بررسی انجام‌شده

- بررسی نحوی TypeScript/TSX برای سه فایل تغییرکرده: موفق.
- Build و تست‌های کامل پروژه اجرا نشدند؛ وابستگی‌های npm در این محیط نصب نبودند و نصب به پایان نرسید.

---

# Stage 1 (v6) — defect fixes

1. **One preview module:** `src/lib/preview.ts` now holds the CSP and the preview wrapper (the CSP used to be copied in three places). Tests: `src/test/preview.test.ts`.
2. **`localStorage` crash fixed:** the sandboxed preview has an opaque origin, so generated sites that touched `localStorage`/`sessionStorage` threw. A small in-memory fallback is injected only when the real storage throws.
3. **Dead code removed:** `src/lib/ai/output.ts` (old pipeline, nothing imported it), its test, `drizzle/` and `drizzle.config.ts`.
4. **Edge function:** model list is cached for 10 minutes (it was fetched on every request); `GEMINI_MODEL` can pin a model; the Gemini key now travels in the `x-goog-api-key` header instead of the URL; `<script type="module" src=...>` keeps `type="module"` when inlined for the preview.
5. **Smaller project rows:** version snapshots no longer store `previewHtml` a second time.

## Verification

- Syntax of every `.ts`/`.tsx` file checked (0 errors) and the shim and `buildPreview` logic run in Node.
- `bun install`, `lint`, `vitest` and `build` were NOT run here (no network). Run `bun run lint && bun run test && bun run build` before deploying.
- Redeploy the Edge Function: `supabase functions deploy ai-builder`.
- Unused packages remain in `package.json` (`drizzle-orm`, `drizzle-kit`, `postgres`, `sanitize-html`, `@types/sanitize-html`); remove them with `bun remove ...` on a machine with network so `bun.lock` stays consistent.

---

# Stage 2 (v7) — database foundation

New: migration `20261108000000_app_database.sql`, Edge Function `app-api` (+ `logic.ts`), `src/lib/ai/app-data.functions.ts`,
extended `src/integrations/supabase/types.ts`, `docs/app-database.md`, tests `src/test/app-api-logic.test.ts`.

## Verification

- Request logic (`logic.ts`): strict TypeScript check passed; 19 unit tests (including the stage 1 preview tests) pass in a Node harness.
- NOT run here: the SQL migration (no PostgreSQL available), the Edge Function against a real Supabase, `lint`, `vitest`, `build`.
  Apply the migration on a copy or branch first, then call `app-api` with curl as in `docs/app-database.md`.
- Nothing in the generator or the UI uses the new tables yet (stage 3 and 4), so existing behaviour is unchanged.

---

# Stage 3 (v8) — the generator builds sites with a real database

New: `supabase/functions/_shared/` (patterns, preview-policy, database, sdk), migration `20261108010000_app_owner_tokens_and_budget.sql`,
tests `database-plan`, `db-sdk`, extended `preview` and `app-api-logic`.
Changed: `ai-builder` (dynamic prompt, database planning, db.js), `app-api` (record tokens), `generate.functions.ts`, `preview.ts`,
`PreviewPanel`, `builder.tsx`, types, `credits.ts`, `docs/app-database.md`.

## Change to the stage 2 contract

In stage 2, enabling `update`/`delete` would have let ANY visitor edit ANY record of the collection. Now `update`/`delete` need the secret token of the
record (kept by the browser that created it). Run the new migration before deploying the new functions.

## Verification

- 44 unit tests pass in a Node harness (request logic, database planning, the real db.js running against a fake fetch and storage, preview policy).
- Strict TypeScript check passed for the shared modules and `app-api/logic.ts`; syntax of all 108 `.ts/.tsx` files checked.
- NOT run here: the two SQL migrations (no PostgreSQL), the Edge Functions on a real Supabase, a real Gemini generation, `lint`, `vitest`, `build`.
  The prompt can only be judged with real generations: try "a contact form that saves messages", "a guestbook", "a poll" and check the collections it declares.

---

# Stage 4 (v9) — the Data view

New: `src/components/builder/DataPanel.tsx`, `src/lib/ai/records.functions.ts` (list, save, delete, export), `src/lib/data-export.ts`, test `src/test/data-export.test.ts`.
Changed: `app-data.functions.ts` (record counts; key rotation also rewrites the saved `db.js` and preview), `builder.tsx` (a "داده‌ها" switch beside "فایل‌ها"; 4 tabs on phones), README/docs.

## Behaviour worth knowing

- Records created in the builder have no owner token, so visitors can never edit or delete them. They are marked "شما"; visitor records "بازدیدکننده".
- Turning on public read shows a red warning. A collection with no permission is fully private (owner only).
- Deleting a collection deletes its records; the generated site must then be changed in the chat.
- Key rotation: the builder preview keeps working; sites already downloaded keep the old key and stop working until downloaded again.
- The owner can add records up to the same 2,000-per-project cap as visitors.

## Verification

- 56 unit tests pass in a Node harness (all stages), including the CSV/JSON export (BOM, quoting, formula neutralising).
- `DataPanel` was rendered to HTML with react-dom/server against stubbed UI modules in 12 scenarios (loading, error, empty, records, private, pagination, red warning): all pass. Clicks, dialogs and server calls were NOT exercised.
- NOT run: type-check of the TSX against the real UI library types, `lint`, `vitest`, `build`, and the server functions against a real Supabase.

---

# Polish (v10, warm dark) — UI and UX

Changed: `styles.css` (palette, `font-display`, `bg-girih`, `animate-unfold`), `__root.tsx` (Lalezar font, theme colour), `Logo.tsx` + `public/favicon.svg` (eight-pointed star), `routes/index.tsx` (landing rewrite), `ChatPanel.tsx`, `PreviewPanel.tsx`, `builder.tsx` (credit meter). New: `docs/design.md`.

## What a person sees

- Landing: headline in the display font, a prompt box, five starters that all name the data to keep (so the builder creates a real database), a three-part "what you get" strip (no identical cards), and three start tiles.
- Chat: the empty state offers four tappable starters that fill the box; building shows elapsed seconds instead of a fake step list; errors sit in a red box.
- Preview: the empty state uses the tile pattern. Credit: a thin meter that turns saffron under 20%.

## Verification

- Palette contrast computed (see `docs/design.md`). The logo, favicon and tile pattern were rasterised and looked at.
- `ChatPanel` rendered to HTML in 10 checks and `DataPanel` in 14, all pass; syntax of every file checked.
- NOT done: seeing the real app in a browser (no dependencies installed), so spacing, the Lalezar font loading, RTL details on a phone and the unfold animation still need a look on a device.

## v10.1 — colour change on request

The owner asked for a dark theme with cream tones "like Claude". The palette is now charcoal-brown, cream text and a camel accent (tokens in `styles.css`, favicon, theme colour). Layout, star motif, type and copy are unchanged. The earlier lapis-and-turquoise numbers above no longer apply.
