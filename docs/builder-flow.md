# How a build works (v12)

```
browser                      app server (TanStack)              ai-builder Edge Function            Gemini
   | beginGeneration ------------>|  save the message, read history,
   |<---- payload (history, files, project key)                 
   | POST ?stream=1 (history, files, key, attachments) -------------->|  reserve credits
   |<---- phase: reading -----------------------------------------   |  stream ------------------>|
   |<---- phase: writing (model) ---------------------------------   |<---- text chunks ----------|
   |<---- progress: title + files + lines (about 4 per second) ----   |
   |<---- phase: finalizing; result (files, kind, preview) --------   |  settle credits
   | finishGeneration (result) --->|  validate, save collections, files, message
   |<---- saved result + assistant message
```

## What the person sees

A card with five steps (prepare, read the request, write code, build the preview, save). While the model writes, every file appears
with its real line count, taken from the text the model has produced so far (`_shared/progress.ts`). Nothing is invented.
"Stop" cancels the browser request; the function aborts the call to the model, credits are settled with what was really used,
and a plain "ساخت متوقف شد." note is saved. If the first model stays silent, the function tries the next one and the card says so.

## Kinds of result

- `web`: a static site that runs from `index.html` (HTML, CSS, plain JavaScript). Live preview, built-in database (`db.js`), data tab.
- `project`: code in any language (React with a bundler, Node, Python, PHP, Java, Kotlin, Flutter, C#, Go, Rust, SQL, Bash ...) with a README
  that explains how to run it. No live preview; the person downloads the ZIP. A `web` answer without `index.html` becomes a `project`.

## Attachments (all read in the browser, nothing is uploaded)

- Code and text of any language: up to 600 KB per file, 120,000 characters kept.
- ZIP: unpacked in the browser. Libraries (`node_modules`), build output, `.git`, lock files, images, binaries and secret `.env` files are left out;
  files are included by importance (manifest and README first, tests last) up to the budget, and the rest are listed by name.
- Images (PNG, JPG, WebP, GIF) and PDF: up to 4 MB each, 6 MB together, 3 at most; sent to the model as they are (a screenshot of a design works).
- At most 5 attachments; an estimate of the tokens is shown on each chip and a warning appears above about 20,000 tokens (the daily credit is small).
- Word, Excel and other binary formats are refused with a message that says what to send instead.

## Fixing errors

The preview page reports its own runtime errors (`window.onerror`, unhandled rejections) to the builder with `postMessage`. A banner shows the message and
"رفع خودکار با هوش مصنوعی" sends it to the assistant, which fixes the code. The same works by pasting an error in the chat.

## Deploying this version

No new SQL. Redeploy the function (it now shares `supabase/functions/_shared`): `supabase functions deploy ai-builder`.
The browser calls the function directly with the person's own session token (`verify_jwt = true` stays on).
