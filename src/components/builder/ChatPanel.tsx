import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, FileText, Loader2, Paperclip, X } from "lucide-react";
import { StarMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { readReferenceFile, REFERENCE_ACCEPT, type ReferenceFile } from "@/lib/reference-files";
import type { ChatMessage } from "@/lib/ai/types";

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  onSend: (text: string, references?: ReferenceFile[]) => Promise<boolean>;
  initialText?: string;
  disabled?: boolean | undefined;
}

export function PromptComposer({ onSend, loading = false, disabled = false, initialText = "", injected = null }: Omit<Props, "messages" | "loading"> & { loading?: boolean; injected?: { id: number; text: string } | null }) {
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<(ReferenceFile & { path?: string })[]>([]);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  useEffect(() => { if (initialText) setText(initialText); }, [initialText]);
  // A suggestion chosen elsewhere (same text twice still counts, because the id changes).
  useEffect(() => { if (injected) { setText(injected.text); document.getElementById("chat-input")?.focus(); } }, [injected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    if (!text.trim() || loading || uploading || disabled) return;
    if (await onSend(text.trim(), files.map(({ name, content }) => ({ name, content })))) {
      const uploadedPaths = files.flatMap((file) => file.path ? [file.path] : []);
      setText("");
      setFiles([]);
      if (uploadedPaths.length) {
        const { error } = await supabase.storage.from("project-references").remove(uploadedPaths);
        if (error) toast.message("درخواست انجام شد؛ پاک‌سازی فایل‌های موقت کامل نشد");
      }
    }
  };
  const attach = async (selected: FileList | null) => {
    if (!selected || uploading || disabled || loading) return;
    setUploading(true);
    try {
      if (files.length + selected.length > 3) throw new Error("حداکثر ۳ فایل را انتخاب کنید.");
      for (const file of Array.from(selected)) {
        const ref = await readReferenceFile(file);
        let path: string | undefined;
        if (user) {
          const mimeByExtension: Record<string, string> = {
            txt: "text/plain", md: "text/markdown", html: "text/html", css: "text/css", json: "application/json",
          };
          const extension = file.name.split(".").pop()?.toLowerCase() ?? "txt";
          const safeName = ref.name.replaceAll("\\", "_").replaceAll("/", "_").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || `reference.${extension}`;
          path = `${user.id}/${crypto.randomUUID()}/${safeName}`;
          const { error } = await supabase.storage.from("project-references").upload(path, file, {
            contentType: mimeByExtension[extension] || "text/plain",
            upsert: false,
          });
          if (error) throw new Error("آپلود انجام نشد؛ دوباره امتحان کنید.");
        }
        setFiles((current) => [...current, { ...ref, ...(path ? { path } : {}) }]);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "فایل خوانده نشد"); }
    finally { setUploading(false); if (input.current) input.current.value = ""; }
  };
  const remove = async (index: number) => {
    const file = files[index];
    if (file?.path) {
      const { error } = await supabase.storage.from("project-references").remove([file.path]);
      if (error) { toast.error("حذف فایل انجام نشد"); return; }
    }
    setFiles((current) => current.filter((_, i) => i !== index));
  };
  return <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="rounded-xl border bg-card p-3 shadow-card transition-colors focus-within:border-primary/70" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void attach(e.dataTransfer.files); }}>
    {files.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{files.map((file, i) => <div key={`${file.name}-${i}`} className="flex min-w-0 max-w-full items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs"><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="max-w-36 truncate" dir="auto">{file.name}</span><Check className="h-3 w-3 text-success" /><Button type="button" variant="ghost" size="icon-xs" aria-label={`حذف ${file.name}`} disabled={loading} onClick={() => void remove(i)}><X /></Button></div>)}</div>}
    <label htmlFor="chat-input" className="sr-only">پیام</label>
    <textarea id="chat-input" rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled || loading} placeholder="چه چیزی می‌خواهید بسازید؟" className="w-full resize-none bg-transparent text-sm leading-7 outline-none placeholder:text-muted-foreground" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} />
    <div className="mt-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2"><input ref={input} type="file" multiple accept={REFERENCE_ACCEPT} className="hidden" onChange={(e) => void attach(e.target.files)} /><Button type="button" variant="ghost" size="icon-sm" title="آپلود فایل متنی (TXT، MD، HTML، CSS، JSON)" aria-label="آپلود فایل متنی" disabled={loading || disabled || uploading} onClick={() => input.current?.click()}>{uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}</Button><span className="text-[11px] text-muted-foreground">{files.length ? `${files.length.toLocaleString("fa-IR")} فایل` : <span className="hidden sm:inline">Enter برای ارسال، Shift+Enter برای خط جدید</span>}</span></div>
      <Button type="submit" size="icon-sm" disabled={!text.trim() || disabled || loading || uploading} aria-label="ارسال">{loading ? <Loader2 className="animate-spin" /> : <ArrowUp />}</Button>
    </div>
  </form>;
}

const starters = [
  { label: "فرم تماس که پیام‌ها ذخیره شوند", prompt: "یک سایت معرفی کسب‌وکار با فرم تماس بساز؛ پیام‌ها در دیتابیس ذخیره شوند" },
  { label: "دفتر مهمان با نمایش نظرها", prompt: "یک دفتر مهمان بساز که بازدیدکننده‌ها نظر بنویسند و نظرها روی صفحه دیده شوند" },
  { label: "فروشگاه کوچک با فرم سفارش", prompt: "یک فروشگاه کوچک با لیست محصولات و فرم سفارش بساز؛ سفارش‌ها ذخیره شوند" },
  { label: "رزرو میز برای رستوران", prompt: "یک سایت رستوران با منو و فرم رزرو میز بساز؛ رزروها ذخیره شوند" },
] as const;

/** Honest progress: the time that has passed, not an invented list of steps. */
function BuildingStatus() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div role="status" className="rounded-lg border border-primary/25 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
        <span>در حال ساخت…</span>
        <span aria-hidden className="ms-auto text-xs tabular-nums text-muted-foreground">{seconds.toLocaleString("fa-IR")} ثانیه</span>
      </div>
      <p className="mt-1.5 text-xs leading-6 text-muted-foreground">معمولاً کمتر از یک دقیقه طول می‌کشد. نتیجه در پیش‌نمایش ظاهر می‌شود.</p>
    </div>
  );
}

export function ChatPanel({ messages, loading, onSend, initialText = "", disabled }: Props) {
  const end = useRef<HTMLDivElement>(null);
  const [injected, setInjected] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }); }, [messages, loading]);
  return <section aria-label="گفتگو" className="flex h-full min-h-0 flex-col">
    <div className="flex items-center gap-2 border-b px-4 py-3 text-xs"><StarMark className="h-4 w-4 text-primary" /><span>دستیار طراحی</span></div>
    <div className="flex-1 space-y-5 overflow-y-auto p-4" aria-live="polite">
      {!messages.length && (
        <div className="py-6">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow"><StarMark className="h-6 w-6" /></span>
          <h2 className="mt-4 font-display text-2xl font-normal">چه چیزی بسازیم؟</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">به فارسی یا دری بنویسید. اگر سایت باید چیزی را ذخیره کند، مثل پیام‌ها یا سفارش‌ها، همان را بگویید تا دیتابیس واقعی هم ساخته شود.</p>
          <ul className="mt-5 space-y-2">
            {starters.map((starter) => (
              <li key={starter.label}>
                <Button type="button" variant="outline" disabled={disabled || loading} onClick={() => setInjected((current) => ({ id: (current?.id ?? 0) + 1, text: starter.prompt }))}
                  className="h-auto w-full justify-start whitespace-normal rounded-lg bg-surface px-3 py-2.5 text-start text-sm font-normal text-muted-foreground hover:text-foreground">
                  {starter.label}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {messages.map((message) => <div key={message.id} className={`whitespace-pre-wrap text-sm leading-7 ${message.role === "user" ? "ms-6 rounded-lg border bg-card p-3" : message.error ? "rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive" : "text-foreground"}`}>{message.role === "assistant" && !message.error && <StarMark className="mb-2 h-4 w-4 text-primary" />}{message.content}</div>)}
      {loading && <BuildingStatus />}<div ref={end} />
    </div>
    <div className="p-3"><PromptComposer onSend={onSend} loading={loading} disabled={disabled} initialText={initialText} injected={injected} /></div>
  </section>;
}
