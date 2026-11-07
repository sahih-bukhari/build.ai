import { useState } from "react";
import { ExternalLink, Monitor, RefreshCw, Smartphone, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const PREVIEW_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src https://images.unsplash.com data: blob:; font-src https://fonts.gstatic.com data:; media-src https://images.unsplash.com data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

function securePreviewDocument(source: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
  if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, (head) => `${head}${policy}`);
  if (/<html\b[^>]*>/i.test(source)) return source.replace(/<html\b[^>]*>/i, (html) => `${html}<head>${policy}</head>`);
  return `<!doctype html><html><head>${policy}</head><body>${source}</body></html>`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface Props {
  html: string | null;
  title?: string | undefined;
  loading: boolean;
}

export function PreviewPanel({ html, title, loading }: Props) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [reloadKey, setReloadKey] = useState(0);

  const openInNewTab = () => {
    if (!html) return;
    const safeHtml = securePreviewDocument(html);
    const wrapper = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>پیش‌نمایش امن</title><style>html,body{margin:0;height:100%;}iframe{width:100%;height:100%;border:0;}</style></head><body><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${escapeAttribute(safeHtml)}"></iframe></body></html>`;
    const url = URL.createObjectURL(new Blob([wrapper], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const iconBtn = "rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    <section aria-label="پیش‌نمایش" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-surface px-4 py-2">
        <p className="truncate text-sm font-medium">{title ?? "پیش‌نمایش"}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" type="button" className={iconBtn} disabled={!html} onClick={() => setReloadKey((k) => k + 1)} aria-label="تازه‌سازی" title="تازه‌سازی">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" type="button" className={iconBtn} disabled={!html} onClick={openInNewTab} aria-label="باز کردن در تب جدید" title="باز کردن در تب جدید">
            <ExternalLink className="h-4 w-4" aria-hidden />
          </Button>
          <div className="ms-1 flex rounded-lg bg-muted p-0.5" role="group" aria-label="اندازهٔ پیش‌نمایش">
            {([["desktop", Monitor, "دسکتاپ"], ["mobile", Smartphone, "موبایل"]] as const).map(([d, Icon, label]) => (
              <Button variant="ghost" size="icon-sm" key={d} type="button" onClick={() => setDevice(d)} aria-pressed={device === d} aria-label={label} title={label} className={`rounded-md p-1.5 transition ${device === d ? "bg-card text-primary shadow" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-4 w-4" aria-hidden />
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 justify-center overflow-auto bg-grid p-3 sm:p-5">
        {html ? (
          <iframe
            key={reloadKey}
            title="پیش‌نمایش ویب‌سایت"
            srcDoc={securePreviewDocument(html)}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className={`h-full rounded-lg border bg-card shadow-card transition-all duration-300 ${device === "mobile" ? "w-[390px] max-w-full" : "w-full"}`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground">
            <div className={`grid h-16 w-16 place-items-center rounded-2xl border bg-card ${loading ? "animate-shimmer" : ""}`}>
              <Wand2 className="h-7 w-7 text-primary" aria-hidden />
            </div>
            <p className="mt-4 text-sm">{loading ? "در حال ساخت…" : "سایت شما اینجا نمایش داده می‌شود."}</p>
          </div>
        )}
        {loading && html && <div className="pointer-events-none absolute inset-0 animate-shimmer" />}
      </div>
    </section>
  );
}
