import { describe, expect, it } from "vitest";
import { apiUrlFromFiles, buildPreviewWrapper, PREVIEW_CSP, securePreviewDocument, STORAGE_SHIM } from "@/lib/preview";
import { buildSdk } from "../../supabase/functions/_shared/sdk";

describe("securePreviewDocument", () => {
  it("injects the CSP and the storage shim right after <head>", () => {
    const out = securePreviewDocument("<!doctype html><html><head><title>x</title></head><body>hi</body></html>");
    expect(out).toContain(`content="${PREVIEW_CSP}"`);
    expect(out).toContain(STORAGE_SHIM);
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(out.indexOf("<title>"));
  });

  it("adds a head when only <html> exists, and wraps bare fragments", () => {
    expect(securePreviewDocument("<html><body>a</body></html>")).toMatch(/<html><head><meta http-equiv/);
    expect(securePreviewDocument("<p>a</p>")).toMatch(/^<!doctype html><html><head>.*<\/head><body><p>a<\/p><\/body><\/html>$/s);
  });

  it("never allows network access from generated code", () => {
    expect(PREVIEW_CSP).toContain("connect-src 'none'");
    expect(PREVIEW_CSP).toContain("frame-src 'none'");
    expect(PREVIEW_CSP).toContain("form-action 'none'");
    expect(PREVIEW_CSP).not.toMatch(/\*/);
  });
});

describe("storage shim", () => {
  it("replaces storage that throws with a working in-memory store", () => {
    const fakeWindow: Record<string, unknown> = {};
    for (const name of ["localStorage", "sessionStorage"]) {
      Object.defineProperty(fakeWindow, name, { configurable: true, get() { throw new Error("SecurityError"); } });
    }
    new Function("window", STORAGE_SHIM)(fakeWindow);
    const store = fakeWindow["localStorage"] as Storage;
    store.setItem("a", "1");
    expect(store.getItem("a")).toBe("1");
    expect(store.getItem("missing")).toBeNull();
    expect(store.length).toBe(1);
    store.removeItem("a");
    expect(store.length).toBe(0);
  });

  it("leaves working storage untouched", () => {
    const real = { getItem: () => null };
    const fakeWindow = { localStorage: real, sessionStorage: real };
    new Function("window", STORAGE_SHIM)(fakeWindow);
    expect(fakeWindow.localStorage).toBe(real);
  });
});

describe("buildPreviewWrapper", () => {
  it("hosts the document in an iframe sandboxed without same-origin", () => {
    const out = buildPreviewWrapper("<html><head></head><body>\"quoted\" & <b>x</b></body></html>");
    expect(out).toContain('sandbox="allow-scripts"');
    expect(out).not.toContain("allow-same-origin");
    expect(out).not.toContain('srcdoc="<');
  });
});

describe("preview and the database endpoint", () => {
  const apiUrl = "https://abcdefgh.supabase.co/functions/v1/app-api";
  const key = "pk_" + "c".repeat(48);

  it("allows exactly one network address, and only when it is given", () => {
    const page = "<html><head></head><body></body></html>";
    expect(securePreviewDocument(page)).toContain("connect-src 'none'");
    const withDb = securePreviewDocument(page, apiUrl);
    expect(withDb).toContain(`connect-src ${apiUrl};`);
    expect(withDb).not.toContain("connect-src 'none'");
  });

  it("refuses unsafe addresses and falls back to no network", () => {
    const page = "<html><head></head><body></body></html>";
    for (const bad of ["https://evil.example/x", "http://abcdefgh.supabase.co/functions/v1/app-api", "https://a.co/functions/v1/app-api; script-src *", "*", "https://a.co/functions/v1/app-api/extra"]) {
      expect(securePreviewDocument(page, bad)).toContain("connect-src 'none'");
    }
  });

  it("reads the address only from the server-built db.js, never from the page", () => {
    const sdk = buildSdk({ apiUrl, key });
    const origin = "https://abcdefgh.supabase.co";
    expect(apiUrlFromFiles([{ path: "db.js", content: sdk }], origin)).toBe(apiUrl);
    expect(apiUrlFromFiles([{ path: "index.html", content: sdk }], origin)).toBeNull();
    expect(apiUrlFromFiles(null, origin)).toBeNull();
  });

  it("only trusts an address on this app's own Supabase host", () => {
    const evil = 'var API_URL = "https://evil.example/functions/v1/app-api";';
    const origin = "https://abcdefgh.supabase.co";
    expect(apiUrlFromFiles([{ path: "db.js", content: evil }], origin)).toBeNull();
    expect(apiUrlFromFiles([{ path: "db.js", content: buildSdk({ apiUrl, key }) }], "https://other.supabase.co")).toBeNull();
    expect(apiUrlFromFiles([{ path: "db.js", content: buildSdk({ apiUrl, key }) }], null)).toBeNull(); // host unknown: no network
  });

  it("passes the address to the new-tab wrapper too", () => {
    expect(buildPreviewWrapper("<html><head></head><body></body></html>", apiUrl)).toContain("connect-src " + apiUrl);
  });
});
