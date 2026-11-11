// The Content-Security-Policy of the sandboxed preview, shared by the ai-builder Edge Function (which bakes it into the
// stored preview) and the builder app (which wraps every preview with it). Generated code is untrusted, so the policy
// blocks the network completely, except for ONE exact URL: the project's own app-api endpoint, and only when the
// project uses the built-in database.

const API_URL_PATTERN = /^https:\/\/[a-z0-9.-]+(?::\d+)?\/functions\/v1\/app-api$/i;

export function isSafeApiUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && API_URL_PATTERN.test(value);
}

export function buildPreviewCsp(apiUrl?: string | null): string {
  const connect = apiUrl && isSafeApiUrl(apiUrl) ? apiUrl : "'none'";
  return (
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src https://images.unsplash.com data: blob:; font-src https://fonts.gstatic.com data:; " +
    `media-src https://images.unsplash.com data: blob:; connect-src ${connect}; object-src 'none'; ` +
    "frame-src 'none'; form-action 'none'; base-uri 'none'"
  );
}
