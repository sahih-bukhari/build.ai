import { useEffect, useState } from "react";
import { Check, Copy, Download, FileCode2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createProjectZip, downloadBlob } from "@/lib/project-download";
import { toast } from "sonner";
import type { ProjectFile } from "@/lib/ai/types";

function download(file: ProjectFile) {
  const extension = file.path.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript",
    json: "application/json", svg: "image/svg+xml", md: "text/markdown", txt: "text/plain",
  };
  const blob = new Blob([file.content], { type: mimeTypes[extension ?? ""] ?? "application/octet-stream" });
  downloadBlob(blob, file.path);
}

export function FilesPanel({ files }: { files: ProjectFile[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);
  const file = files[active] ?? files[0];
  const fileKey = files.map((f) => f.path).join("|");
  useEffect(() => { setActive(0); }, [fileKey]);

  const downloadZip = async () => {
    if (zipping || !files.length) return;
    setZipping(true);
    try {
      const blob = await createProjectZip(files);
      downloadBlob(blob, "project.zip");
      toast.success("فایل ZIP دانلود شد");
    } catch {
      toast.error("ساخت فایل ZIP ناموفق بود؛ دوباره امتحان کنید");
    } finally {
      setZipping(false);
    }
  };

  if (!file)
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground">
        <FileCode2 className="mb-3 h-7 w-7 text-primary" aria-hidden />
        هنوز فایلی ساخته نشده است.
      </div>
    );

  return (
    <section aria-label="فایل‌ها" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-surface px-3 py-2">
        <div className="flex min-w-0 gap-1 overflow-x-auto" role="tablist">
          {files.map((f, i) => (
            <Button size="sm" variant="ghost" key={f.path} role="tab" aria-selected={i === active} onClick={() => setActive(i)} dir="ltr" className={`font-mono ${i === active ? "bg-muted text-primary" : "text-muted-foreground"}`}>
              {f.path}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" title="کپی فایل" aria-label="کپی"
            onClick={async () => {
              try { await navigator.clipboard.writeText(file.content); }
              catch { toast.error("کپی انجام نشد"); return; }
              setCopied(true);
              toast.success("کپی شد");
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" aria-label="دانلود فایل" title="دانلود فایل" onClick={() => download(file)}><Download className="h-4 w-4" /></Button>
        </div>
      </div>
      <pre dir="ltr" className="min-h-0 flex-1 overflow-auto p-4 text-left font-mono text-xs leading-5 text-muted-foreground">
        <code>{file.content}</code>
      </pre>
      <div className="border-t p-3">
        <Button className="w-full" disabled={zipping} aria-busy={zipping} onClick={() => void downloadZip()} aria-label="دانلود پروژه">
          {zipping ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          {zipping ? "در حال ساخت ZIP…" : "دانلود پروژه · ZIP"}
        </Button>
      </div>
    </section>
  );
}
