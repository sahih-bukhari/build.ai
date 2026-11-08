# Database for generated sites — API contract (stages 2 and 3)

A generated site talks to its own database through one HTTPS endpoint:

    POST {SUPABASE_URL}/functions/v1/app-api      Content-Type: application/json

Every request carries the project's **public key** (`pk_` + 48 hex characters). The key is not a secret: it ships inside the site.
Anyone holding it can do exactly what the owner enabled for visitors, nothing more.

## Requests

| op       | body                                                 | needs permission | success response |
|----------|------------------------------------------------------|------------------|------------------|
| `create` | `{key, op, collection, data}`                        | `create`         | `201 {ok, id, created_at}` |
| `list`   | `{key, op, collection, limit?=50 (1-100), offset?=0 (0-10000)}` | `read` | `200 {ok, records:[{id,data,created_at,updated_at}], has_more}` newest first |
| `update` | `{key, op, collection, id, token, data}` (replaces `data`) | `update`   | `200 {ok, id}` |
| `delete` | `{key, op, collection, id, token}`                   | `delete`         | `200 {ok, id}` |

`create` answers `201 {ok, id, created_at, token}`. The `token` is a secret for THAT record: the visitor's browser keeps it
and must send it to update or delete the record (only its SHA-256 hash is stored). So a visitor can change only what their own
browser created. Records created by the owner have no token and can never be changed by visitors.

Errors are `{ok:false, code, error}`: `BAD_REQUEST 400`, `INVALID_KEY 401`, `FORBIDDEN 403`, `LIMIT_REACHED 403`,
`UNKNOWN_COLLECTION 404`, `NOT_FOUND 404`, `TOO_LARGE 413`, `RATE_LIMITED 429`, `SERVER_ERROR 500`.

Example (what the SDK of stage 3 will wrap):

```js
const res = await fetch(API_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key: PUBLIC_KEY, op: "create", collection: "messages", data: { name, text } }),
});
const out = await res.json();
```

## Rules enforced by the server

- A collection must be **declared** by the owner (`declareCollection`), name `^[a-z][a-z0-9_]{0,39}$`, at most 20 per project.
- Visitors may only use the operations the owner enabled on the collection. A new collection is **create-only** (a write-only inbox).
  `read` lists ALL records of the collection to every visitor, so it must never be enabled for private data.
  `update` / `delete` apply only to records the visitor's own browser created (record token, see above).
- `data`: a non-empty JSON object, at most 50 fields, field names 1-64 characters, 6 nested levels, 16,000 bytes.
- Request body: at most 40,000 bytes.
- Rate limits per minute: writes 20 per visitor and 300 per project; reads 120 per visitor and 1,500 per project.
  A visitor is a SHA-256 hash of project id + IP address; raw addresses are never stored.
- Record cap: 2,000 records per project (secret `APP_MAX_RECORDS` overrides it).
- Records are stored as `jsonb`. Sites must **escape** values when writing them into HTML (use `textContent`, never `innerHTML`).

## Owner side (inside the builder)

Server functions in `src/lib/ai/app-data.functions.ts`: `getProjectApp` (creates the key on first use and returns key,
API URL and collections), `declareCollection`, `removeCollection` (also deletes its records), `rotateAppKey`
(the old key stops working at once). They run with the owner's session, so Row Level Security limits them to the owner's projects.
Owners can read and edit all of their records directly through RLS; the Data tab of stage 4 will use that.

## Deploy checklist

1. Apply the migrations `20261108000000_app_database.sql` and `20261108010000_app_owner_tokens_and_budget.sql` (`supabase db push`).
2. Deploy BOTH functions (they share `supabase/functions/_shared`): `supabase functions deploy app-api --no-verify-jwt` and `supabase functions deploy ai-builder`.
3. Optional secret: `APP_MAX_RECORDS`.
4. `SUPABASE_URL` must be set on the app host (it already is for the existing server functions).

## The `db` SDK that generated sites use (`db.js`)

The server (never the model) writes `db.js` into every project that uses the database, with the project's key and API URL
embedded, and rewrites it on every build. It is plain ES5 and pure ASCII.

```js
const posts = db.collection("posts");
await posts.create({ title, body });            // -> { id, createdAt }
await posts.list({ limit: 50, offset: 0 });     // -> { records: [{ id, createdAt, updatedAt, data, mine }], hasMore }
await posts.update(id, { title, body });        // only when record.mine === true
await posts.remove(id);                         // only when record.mine === true
db.messageFor(error);                           // Persian message for error.code
```

Errors have `.code` (`NETWORK`, `RATE_LIMITED`, `LIMIT_REACHED`, `TOO_LARGE`, `BAD_REQUEST`, `FORBIDDEN`, `NOT_OWNER`, `NOT_FOUND`).
Record tokens live in the visitor's `localStorage` (in memory when storage is blocked, e.g. inside the builder preview, where a reload forgets them).

## How the generator uses it (stage 3)

1. `generateWebsite` creates or reads the project's public key and sends it to the `ai-builder` Edge Function (`appKey`) together with
   the project's existing collections.
2. The model gets database instructions only when a key is available. It returns the usual files plus an optional
   `database: {collections: [{name, ops}]}`, choosing the smallest set of visitor operations.
3. The Edge Function plans the database (`_shared/database.ts`): invalid names or operations are dropped, a collection used in the code but not
   declared is added as **create-only**, existing collections are kept, at most 20. It then adds the server-built `db.js`, rebuilds the preview
   with it inlined, and appends a short Persian note to the summary saying what visitors can do.
4. `generateWebsite` writes the declared collections (`app_collections`) before saving the project; if that fails the build is reported as `DATABASE_ERROR`.
5. The preview CSP allows exactly one network address, the project's own `app-api` URL, read from the server-built `db.js` and accepted only on this
   app's own Supabase host (`VITE_SUPABASE_URL`). Every other address stays blocked.
6. The ZIP download contains `db.js`, so the exported site keeps talking to the same database. Rotating the project key breaks exported sites until they are rebuilt.

## Daily budget

`BUDGET_TOKENS` is now 500,000 (first day 50,000 tokens, later days 25,000). Change it in `src/lib/ai/credits.ts` AND in `reserve_ai_tokens()` (SQL) together.
