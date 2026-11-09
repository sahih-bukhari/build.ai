import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, Circle, Database, FileArchive, FileText, Image as ImageIcon, Loader2, Paperclip, RotateCcw, Square, X } from "lucide-react";
import { StarMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { attachmentTokens, checkCanAdd, readAttachment, type Attachment } from "@/lib/reference-files";
import type { BuildPhase, BuildProgress } from "@/lib/ai/progress";
import type { ChatMessage } from "@/lib/ai/types";

const fa = (value: number) => value.toLocaleString("fa-IR");
const tokensLabel = (tokens: number) => (tokens >= 1000 ? `≈ ${fa(Math.round(tokens / 100) / 10)} هزار توکن` : `≈ ${fa(tokens)} توکن`);

// ---------------------------------------------------------------- composer

interface ComposerProps {
  onSend: (text: string, attachments: Attachment[]) => Promise<boolean>;
  onStop?: (() => void) | undefined;
  loading?: boolean;
  disabled?: boolean | undefined;
  initialText?: string;
  /** A suggestion chosen elsewhere (the same text twice still counts, because the id changes). */
  injected?: { id: number; text: string } | null;
  allowAttachments?: boolean;
}

function AttachmentChip({ attachment, onRemove, disabled }: { attachment: Attachment; onRemove: () => void; disabled: boolean }) {
  const isZip = attachment.kind === "text" && /\.zip$/i.test(attachment.name);
  const isImage = attachment.kind === "media" && attachment.mimeType.startsWith("image/");
  const detail = attachment.kind === "text"
    ? `${isZip ? `${fa(attachment.fileCount)} فایل · ` : ""}${tokensLabel(attachmentTokens(attachment))}`
    : `${fa(Math.max(1, Math.round(attachment.size / 1024)))} کیلوبایت`;
  return (
    <li className="flex min-w-0 max-w-full items-center gap-2 rounded-lg border bg-muted py-1 ps-1.5 pe-1 text-xs" title={attachment.kind === "text" ? attachment.note : undefined}>
      {isImage && attachment.kind === "media"
        ? <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
        : <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-card text-primary">{isZip ? <FileArchive className="h-4 w-4" aria-hidden /> : attachment.kind === "media" ? <ImageIcon className="h-4 w-4" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}</span>}
      <span className="min-w-0">
        <span className="block max-w-40 truncate font-medium" dir="auto">{attachment.name}</span>
        <span className="block text-[10px] text-muted-foreground">{detail}{attachment.kind === "text" && attachment.note ? " · ناقص" : ""}</span>
      </span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`حذف ${attachment.name}`} disabled={disabled} onClick={onRemove}><X aria-hidden /></Button>
    </li>
  );
}

export function PromptComposer({ onSend, onStop, loading = false, disabled = false, initialText = "", injected = null, allowAttachments = true }: ComposerProps) {
  const [text, setText] = useState(initialText);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const latest = useRef<Attachment[]>([]); // the newest list, so files added one after another never overwrite each other
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (initialText) setText(initialText); }, [initialText]);
  useEffect(() => { if (injected) { setText(injected.text); document.getElementById("chat-input")?.focus(); } }, [injected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: Attachment[]) => { latest.current = next; setAttachments(next); };
  const busy = loading || reading || Boolean(disabled);

  const submit = async () => {
    const message = text.trim();
    if (!message || busy) return;
    const sentFiles = latest.current;
    // Clear at once (like a chat); if the build fails or is stopped, the text and files come back so nothing is lost.
    setText("");
    commit([]);
    const ok = await onSend(message, sentFiles);
    if (!ok) {
      setText((current) => current || message);
      if (!latest.current.length) commit(sentFiles);
    }
  };

  const attach = async (list: FileList | File[] | null) => {
    if (!allowAttachments || !list || busy) return;
    const files = Array.from(list);
    if (!files.length) return;
    setReading(true);
    try {
      for (const file of files) {
        try {
          const item = await readAttachment(file);
          checkCanAdd(latest.current, item);
          commit([...latest.current, item]);
        } catch (error) {
          toast.error(`${file.name.slice(0, 40)}: ${error instanceof Error ? error.message : "فایل خوانده نشد"}`);
        }
      }
      const tokens = latest.current.reduce((sum, item) => sum + attachmentTokens(item), 0);
      if (tokens > 20_000) toast.info("فایل‌ها حجم زیادی دارند و بخش بزرگی از اعتبار امروز را مصرف می‌کنند.");
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); void submit(); }}
      onDragOver={(event) => { if (!allowAttachments) return; event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { if (!allowAttachments) return; event.preventDefault(); setDragging(false); void attach(event.dataTransfer.files); }}
      className={`relative rounded-xl border bg-card p-3 shadow-card transition-colors focus-within:border-primary/70 ${dragging ? "border-primary bg-primary/5" : ""}`}
    >
      {dragging && <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl bg-card/90 text-sm font-medium text-primary">فایل را اینجا رها کنید</div>}
      {attachments.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="فایل‌های پیوست">
          {attachments.map((attachment) => (
            <AttachmentChip key={attachment.id} attachment={attachment} disabled={loading} onRemove={() => commit(latest.current.filter((item) => item.id !== attachment.id))} />
          ))}
        </ul>
      )}
      <label htmlFor="chat-input" className="sr-only">پیام</label>
      <textarea
        id="chat-input" rows={3} maxLength={4000} value={text} onChange={(event) => setText(event.target.value)} disabled={Boolean(disabled) || loading}
        placeholder="چه چیزی می‌خواهید بسازید؟" className="w-full resize-none bg-transparent text-sm leading-7 outline-none placeholder:text-muted-foreground"
        onPaste={(event) => { if (allowAttachments && event.clipboardData.files.length) { event.preventDefault(); void attach(event.clipboardData.files); } }}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {allowAttachments && (
            <>
              <input ref={input} type="file" multiple className="hidden" onChange={(event) => void attach(event.target.files)} />
              <Button type="button" variant="ghost" size="icon-sm" title="پیوست فایل: کد (هر زبان)، ZIP، تصویر یا PDF" aria-label="پیوست فایل" disabled={busy} onClick={() => input.current?.click()}>
                {reading ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />}
              </Button>
            </>
          )}
          <span className="truncate text-[11px] text-muted-foreground">
            {attachments.length ? `${fa(attachments.length)} پیوست` : <span className="hidden sm:inline">Enter برای ارسال، Shift+Enter برای خط جدید</span>}
          </span>
        </div>
        {loading && onStop
          ? <Button type="button" size="sm" variant="outline" onClick={onStop} aria-label="توقف ساخت"><Square className="fill-current" aria-hidden /> توقف</Button>
          : <Button type="submit" size="icon-sm" disabled={!text.trim() || busy} aria-label="ارسال">{loading ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowUp aria-hidden />}</Button>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- build progress

const ORDER: Record<BuildPhase, number> = { preparing: 0, reading: 1, writing: 2, retrying: 2, finalizing: 3, saving: 4 };
const STEPS = ["آماده‌سازی پروژه", "بررسی درخواست و فایل‌ها", "نوشتن کد", "ساخت پیش‌نمایش", "ذخیره پروژه"] as const;

function StepIcon({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done") return <Check className="h-4 w-4 text-success" aria-hidden />;
  if (state === "active") return <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />;
  return <Circle className="h-4 w-4 text-muted-foreground/50" aria-hidden />;
}

/** What the build is doing right now. Every line comes from a real event of the server, none is invented. */
export function BuildProgressCard({ progress, onStop }: { progress: BuildProgress; onStop?: (() => void) | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = ORDER[progress.phase];
  const seconds = Math.max(0, Math.floor((now - progress.startedAt) / 1000));
  return (
    <section aria-label="پیشرفت ساخت" aria-busy="true" className="rounded-xl border border-primary/25 bg-primary/5 p-3.5">
      <header className="flex items-center gap-2">
        <StarMark className="h-4 w-4 text-primary" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{progress.title ? `در حال ساخت «${progress.title}»` : "در حال ساخت…"}</h3>
        <span aria-hidden className="text-xs tabular-nums text-muted-foreground">{fa(seconds)} ثانیه</span>
        {onStop && <Button type="button" size="xs" variant="ghost" onClick={onStop}><Square className="fill-current" aria-hidden /> توقف</Button>}
      </header>
      <span className="sr-only" role="status">{STEPS[current]}</span>
      <ol className="mt-3 space-y-2">
        {STEPS.map((label, index) => {
          const state = index < current ? "done" : index === current ? "active" : "pending";
          return (
            <li key={label} className={state === "pending" ? "opacity-50" : ""}>
              <div className="flex items-center gap-2 text-sm"><StepIcon state={state} /><span>{label}</span></div>
              {index === 2 && current >= 2 && (
                <div className="ms-6 mt-1.5">
                  {progress.phase === "retrying" && <p className="mb-1 text-xs text-muted-foreground">مدل قبلی پاسخ نداد؛ مدل دیگری امتحان می‌شود…</p>}
                  <ul className="space-y-1">
                    {progress.files.map((file) => (
                      <li key={file.path} className="flex items-center gap-2 text-xs">
                        {file.done || current > 2 ? <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden /> : <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />}
                        <span dir="ltr" className="min-w-0 truncate font-mono">{file.path}</span>
                        <span className="ms-auto shrink-0 tabular-nums text-muted-foreground">{fa(file.lines)} خط</span>
                      </li>
                    ))}
                  </ul>
                  {progress.model && <p dir="ltr" className="mt-1.5 text-start text-[10px] text-muted-foreground">{progress.model}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- messages

function ActivityDetails({ message }: { message: ChatMessage }) {
  const activity = message.activity;
  if (!activity || (!activity.files.length && !activity.collections.length)) return null;
  return (
    <details className="group mt-3 rounded-lg border bg-card/60 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground">
        <FileText className="h-3.5 w-3.5" aria-hidden />
        <span>{fa(activity.files.length)} فایل{activity.kind === "project" ? " · پروژه (بدون پیش‌نمایش زنده)" : ""}</span>
        {activity.collections.length > 0 && <span className="flex items-center gap-1"><Database className="h-3.5 w-3.5" aria-hidden />{fa(activity.collections.length)} مجموعهٔ داده</span>}
        <ChevronDown className="ms-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="space-y-1 border-t px-3 py-2">
        {activity.files.map((file) => (
          <li key={file.path} className="flex items-center gap-2"><span dir="ltr" className="min-w-0 truncate font-mono">{file.path}</span><span className="ms-auto shrink-0 tabular-nums text-muted-foreground">{fa(file.lines)} خط</span></li>
        ))}
        {activity.collections.map((name) => (
          <li key={`db-${name}`} className="flex items-center gap-2 text-primary"><Database className="h-3.5 w-3.5 shrink-0" aria-hidden /><span dir="ltr" className="font-mono">{name}</span></li>
        ))}
      </ul>
    </details>
  );
}

function MessageView({ message, onRetry }: { message: ChatMessage; onRetry?: (() => void) | undefined }) {
  if (message.role === "user") {
    return <div className="ms-auto max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-se-md bg-secondary px-3.5 py-2.5 text-sm leading-7">{message.content}</div>;
  }
  if (message.notice) return <p className="text-center text-xs text-muted-foreground">{message.content}</p>;
  if (message.error) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-7 text-destructive">
        <p className="whitespace-pre-wrap">{message.content}</p>
        {onRetry && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onRetry}><RotateCcw aria-hidden /> تلاش دوباره</Button>}
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><StarMark className="h-3.5 w-3.5 text-primary" />سازنده</div>
      <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
      <ActivityDetails message={message} />
    </div>
  );
}

const starters = [
  { label: "فرم تماس که پیام‌ها ذخیره شوند", prompt: "یک سایت معرفی کسب‌وکار با فرم تماس بساز؛ پیام‌ها در دیتابیس ذخیره شوند" },
  { label: "دفتر مهمان با نمایش نظرها", prompt: "یک دفتر مهمان بساز که بازدیدکننده‌ها نظر بنویسند و نظرها روی صفحه دیده شوند" },
  { label: "فروشگاه کوچک با فرم سفارش", prompt: "یک فروشگاه کوچک با لیست محصولات و فرم سفارش بساز؛ سفارش‌ها ذخیره شوند" },
  { label: "API ساده با پایتون (FastAPI)", prompt: "یک API ساده برای مدیریت لیست کارها با پایتون و FastAPI بنویس و روش اجرایش را توضیح بده" },
] as const;

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  progress: BuildProgress | null;
  onSend: (text: string, attachments: Attachment[]) => Promise<boolean>;
  onStop?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
  initialText?: string;
  disabled?: boolean | undefined;
}

export function ChatPanel({ messages, loading, progress, onSend, onStop, onRetry, initialText = "", disabled }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // follow new content only while the person is at the bottom
  const [injected, setInjected] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => { if (stick.current) end.current?.scrollIntoView?.({ behavior: "smooth", block: "end" }); }, [messages, loading, progress?.files.length, progress?.phase]);
  const lastIndex = messages.length - 1;
  return (
    <section aria-label="گفتگو" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2.5 text-xs text-muted-foreground"><StarMark className="h-4 w-4 text-primary" /><span>دستیار طراحی و برنامه‌نویسی</span></div>
      <div
        ref={scroller} aria-live="polite"
        onScroll={() => { const el = scroller.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140; }}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5"
      >
        {!messages.length && !loading && (
          <div className="py-4">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow"><StarMark className="h-6 w-6" /></span>
            <h2 className="mt-4 font-display text-2xl font-normal">چه چیزی بسازیم؟</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              سایت، اپ یا هر کدی را به فارسی توصیف کنید. اگر سایت باید چیزی را ذخیره کند، مثل پیام‌ها یا سفارش‌ها، همان را بگویید تا دیتابیس واقعی هم ساخته شود. فایل کد، ZIP پروژه، تصویر طرح یا PDF هم می‌توانید پیوست کنید.
            </p>
            <ul className="mt-5 space-y-2">
              {starters.map((starter) => (
                <li key={starter.label}>
                  <Button type="button" variant="outline" disabled={Boolean(disabled)} onClick={() => setInjected((current) => ({ id: (current?.id ?? 0) + 1, text: starter.prompt }))}
                    className="h-auto w-full justify-start whitespace-normal rounded-lg bg-surface px-3 py-2.5 text-start text-sm font-normal text-muted-foreground hover:text-foreground">
                    {starter.label}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((message, index) => <MessageView key={message.id} message={message} onRetry={!loading && index === lastIndex ? onRetry : undefined} />)}
        {loading && progress && <BuildProgressCard progress={progress} onStop={onStop} />}
        <div ref={end} />
      </div>
      <div className="border-t bg-surface/80 p-3 backdrop-blur">
        <PromptComposer onSend={onSend} onStop={onStop} loading={loading} disabled={disabled} initialText={initialText} injected={injected} />
      </div>
    </section>
  );
}
