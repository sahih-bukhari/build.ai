import { buildPreviewCsp, isSafeApiUrl } from "../../supabase/functions/_shared/preview-policy";
import { apiUrlFromSdk, SDK_PATH } from "../../supabase/functions/_shared/sdk";

// Single source of truth for how generated sites are shown inside the sandboxed preview iframe.
// Generated code is untrusted: it runs in an iframe with `sandbox="allow-scripts"` (no same-origin),
// a strict Content-Security-Policy, and no network access.

export const PREVIEW_CSP = buildPreviewCsp();

// A sandboxed iframe without `allow-same-origin` has an opaque origin, so merely touching
// window.localStorage / sessionStorage throws a SecurityError. Many generated sites save a cart,
// theme or form draft there and would crash. This shim swaps in an in-memory store when (and only when)
// the real one is unavailable, so those sites keep working inside the preview.
export const STORAGE_SHIM =
  "(function(){function mem(){var d={};return{" +
  "getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null;}," +
  "setItem:function(k,v){d[k]=String(v);}," +
  "removeItem:function(k){delete d[k];}," +
  "clear:function(){d={};}," +
  "key:function(i){return Object.keys(d)[i]||null;}," +
  "get length(){return Object.keys(d).length;}};}" +
  "['localStorage','sessionStorage'].forEach(function(n){" +
  "try{window[n].getItem('__probe__');}catch(e){" +
  "try{Object.defineProperty(window,n,{value:mem(),configurable:true});}catch(_){}}});})();";

function configuredOrigin(): string | null {
  const url = (import.meta as { env?: Record<string, string | undefined> }).env?.["VITE_SUPABASE_URL"];
  return url ? url : null;
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * The ONE network address a preview may call: the project's own app-api URL, read from the server-built db.js file.
 * It is never read from the generated page itself (that code is untrusted and could name any address), and it must
 * live on this app's own Supabase host. If that host is unknown the preview gets no network access at all.
 */
export function apiUrlFromFiles(
  files: { path: string; content: string }[] | null | undefined,
  expectedOrigin: string | null = configuredOrigin(),
): string | null {
  const sdk = files?.find((file) => file.path === SDK_PATH);
  const url = sdk ? apiUrlFromSdk(sdk.content) : null;
  if (!url || !expectedOrigin) return null;
  return sameOrigin(url, expectedOrigin) ? url : null;
}

export function securePreviewDocument(source: string, apiUrl: string | null = null): string {
  const csp = buildPreviewCsp(apiUrl && isSafeApiUrl(apiUrl) ? apiUrl : null);
  const head = `<meta http-equiv="Content-Security-Policy" content="${csp}"><script>${STORAGE_SHIM}</script>`;
  if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, (tag) => `${tag}${head}`);
  if (/<html\b[^>]*>/i.test(source)) return source.replace(/<html\b[^>]*>/i, (tag) => `${tag}<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head><body>${source}</body></html>`;
}

export function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Standalone page that hosts the preview in a sandboxed iframe (used by "open in new tab").
export function buildPreviewWrapper(source: string, apiUrl: string | null = null): string {
  const safeHtml = securePreviewDocument(source, apiUrl);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>پیش‌نمایش امن</title><style>html,body{margin:0;height:100%;}iframe{width:100%;height:100%;border:0;}</style></head><body><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${escapeAttribute(safeHtml)}"></iframe></body></html>`;
}
