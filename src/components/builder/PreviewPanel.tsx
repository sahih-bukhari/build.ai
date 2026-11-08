import { useState } from "react";
import { ExternalLink, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { StarMark } from "@/components/Logo";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildPreviewWrapper, securePreviewDocument } from "@/lib/preview";

interface Props {
  html: string | null;
  title?: string | undefined;
  loading: boolean;
  /** The project's own database endpoint, the only address the preview may call (null = no network at all). */
  apiUrl?: string | null | undefined;
}

export function PreviewPanel({ html, title, loading, apiUrl = null }: Props) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [reloadKey, setReloadKey] = useState(0);

  const openInNewTab = () => {
    if (!html) return;
    const wrapper = buildPreviewWrapper(html, apiUrl);
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
      <div className="relative flex min-h-0 flex-1 justify-center overflow-auto bg-girih p-3 sm:p-5">
        {html ? (
          <iframe
            key={reloadKey}
            title="پیش‌نمایش ویب‌سایت"
            srcDoc={securePreviewDocument(html, apiUrl)}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className={`h-full rounded-lg border bg-card shadow-card transition-all duration-300 ${device === "mobile" ? "w-[390px] max-w-full" : "w-full"}`}
          />
        ) : (
          <div className="flex max-w-xs flex-col items-center justify-center text-center">
            <div className={`grid h-16 w-16 place-items-center rounded-xl border bg-card text-primary ${loading ? "animate-shimmer" : ""}`}>
              <StarMark className="h-8 w-8" />
            </div>
            <p className="mt-4 text-sm font-medium">{loading ? "در حال ساخت…" : "پیش‌نمایش زنده اینجا ظاهر می‌شود"}</p>
            {!loading && <p className="mt-1.5 text-xs leading-6 text-muted-foreground">درخواست‌تان را در گفتگو بنویسید؛ سایت همین‌جا ساخته می‌شود.</p>}
          </div>
        )}
        {loading && html && <div className="pointer-events-none absolute inset-0 animate-shimmer" />}
      </div>
    </section>
  );
}
