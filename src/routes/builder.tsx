import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Code2, Eye, Loader2, Lock, RefreshCw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/builder/ChatPanel";
import { PreviewPanel } from "@/components/builder/PreviewPanel";
import { apiUrlFromFiles } from "@/lib/preview";
import { FilesPanel } from "@/components/builder/FilesPanel";
import { DataPanel } from "@/components/builder/DataPanel";
import { ProjectHistory } from "@/components/builder/ProjectHistory";
import { createThread, deleteThread, getThread, listThreads } from "@/lib/ai/threads.functions";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { beginGeneration, finishGeneration, getMyUsage } from "@/lib/ai/generate.functions";
import { supabase } from "@/integrations/supabase/client";
import { applyEvent, startProgress, withPhase, type BuildProgress } from "@/lib/ai/progress";
import { streamGeneration, type StreamOutcome } from "@/lib/ai/stream-client";
import { clearPendingPrompt, readPendingPrompt } from "@/lib/pending-prompt";
import type { ChatMessage, GenerateErrorCode, GenerationResult } from "@/lib/ai/types";
import { splitAttachments, type Attachment } from "@/lib/reference-files";

export const Route = createFileRoute("/builder")({
  head: () => ({
    meta: [
      { title: "فضای کار — سازنده هوشمند" },
      { name: "description", content: "گفتگو کنید، پیش‌نمایش زنده ببینید و فایل‌های سایت خود را بگیرید." },
      { property: "og:title", content: "فضای کار — سازنده هوشمند" },
      { property: "og:description", content: "گفتگو کنید، پیش‌نمایش زنده ببینید و فایل‌های سایت خود را بگیرید." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { t?: string } =>
    typeof search['t'] === "string" && /^[0-9a-f-]{36}$/i.test(search['t']) ? { t: search['t'] } : {},
  component: Builder,
});

type Tab = "chat" | "preview" | "files" | "data";
let seq = 0;
const uid = () => `m${++seq}-${Date.now()}`;

const errorText: Record<GenerateErrorCode, string> = {
  USER_DAILY_LIMIT: "اعتبار امروز شما تمام شد. اعتبار هر روز (به وقت جهانی) تازه می‌شود.",
  PROJECT_DAILY_LIMIT: "ظرفیت روزانهٔ سرویس پر شده است؛ لطفاً فردا دوباره امتحان کنید.",
  RATE_LIMITED: "درخواست‌ها زیاد است؛ چند لحظه بعد دوباره امتحان کنید.",
  NO_CREDITS: "اعتبار سرویس هوش مصنوعی تمام شده است؛ به مدیر سایت اطلاع دهید.",
  PROVIDER_ERROR: "ارتباط با سرویس برقرار نشد. متن شما در کادر مانده؛ دوباره ارسال کنید.",
  INVALID_OUTPUT: "پاسخ قابل‌استفاده‌ای دریافت نشد. درخواست را ساده‌تر بنویسید و دوباره بفرستید.",
  CANCELLED: "ساخت متوقف شد.",
  DATABASE_ERROR: "سایت ساخته شد، اما تنظیم دیتابیس انجام نشد. دوباره امتحان کنید؛ اگر تکرار شد، تعداد مجموعه‌ها (حداکثر ۲۰) را بررسی کنید.",
};

function Builder() {
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const pending = useRef(false);
  const begin = useServerFn(beginGeneration);
  const finish = useServerFn(finishGeneration);
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchUsage = useServerFn(getMyUsage);
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/builder" });
  const { t: threadId } = Route.useSearch();
  const fetchThreads = useServerFn(listThreads);
  const newThread = useServerFn(createThread);
  const loadThread = useServerFn(getThread);
  const removeThread = useServerFn(deleteThread);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadLoadError, setThreadLoadError] = useState<string | null>(null);
  const [threadLoadAttempt, setThreadLoadAttempt] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const creating = useRef(false);
  useEffect(() => { setMessages([]); setResult(null); }, [user?.id]);

  const threads = useQuery({
    queryKey: ["threads", user?.id],
    queryFn: () => fetchThreads(),
    enabled: !!user,
  });

  const startNewProject = useCallback(async () => {
    if (creating.current) return;
    creating.current = true;
    try {
      const { id } = await newThread();
      setMessages([]);
      setResult(null);
      setTab("chat");
      await navigate({ search: { t: id }, replace: true });
      void queryClient.invalidateQueries({ queryKey: ["threads", user?.id] });
    } catch {
      toast.error("پروژهٔ تازه ساخته نشد؛ دوباره امتحان کنید");
    } finally {
      creating.current = false;
    }
  }, [newThread, navigate, queryClient, user?.id]);

  // Resume the latest saved project on entry. Creating a new project is an explicit action.
  useEffect(() => {
    if (!user || threadId || !threads.data) return;
    const latestProject = threads.data[0];
    if (latestProject) void navigate({ search: { t: latestProject.id }, replace: true });
    else void startNewProject();
  }, [user, threadId, threads.data, navigate, startNewProject]);

  // Load the selected thread's saved messages and files. Keep the URL intact on
  // failure so the user can retry instead of being silently redirected elsewhere.
  useEffect(() => {
    if (!user || !threadId) {
      setThreadLoading(false);
      setThreadLoadError(null);
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    setThreadLoadError(null);
    setMessages([]);
    setResult(null);
    loadThread({ data: { threadId } })
      .then((row) => {
        if (cancelled) return;
        setMessages(Array.isArray(row.messages) ? row.messages : []);
        setResult(row.result ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[builder] Failed to load project", error);
        setThreadLoadError("این پروژه بارگذاری نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.");
      })
      .finally(() => { if (!cancelled) setThreadLoading(false); });
    return () => { cancelled = true; };
  }, [user, threadId, loadThread, threadLoadAttempt]);

  const selectThread = (id: string) => {
    setHistoryOpen(false);
    if (id === threadId) return;
    setTab("chat");
    void navigate({ search: { t: id } });
  };

  const removeProject = async (id: string) => {
    try {
      await removeThread({ data: { threadId: id } });
      queryClient.setQueryData(["threads", user?.id], (list: { id: string }[] | undefined) => list?.filter((x) => x.id !== id));
      toast.success("پروژه حذف شد");
      if (id === threadId) {
        setMessages([]);
        setResult(null);
        await navigate({ search: {}, replace: true });
      }
    } catch {
      toast.error("حذف انجام نشد؛ دوباره امتحان کنید");
    }
  };

  const usage = useQuery({
    queryKey: ["usage", user?.id],
    queryFn: () => fetchUsage(),
    enabled: !!user,
  });

  useEffect(() => {
    setInitialPrompt(readPendingPrompt());
  }, []);
  useEffect(() => {
    if (user) clearPendingPrompt();
  }, [user]);

  const send = useCallback(
    async (text: string, attachments: Attachment[] = []): Promise<boolean> => {
      if (!user || pending.current || !threadId) return false;
      pending.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      setMessages((m) => [...m, { id: uid(), role: "user", content: text }]);
      setLoading(true);
      setProgress(startProgress());
      try {
        // 1) save the message and get what the builder function needs, 2) watch the build live, 3) validate and save it.
        const { payload } = await begin({ data: { threadId, prompt: text } });
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
        const apiKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
        let outcome: StreamOutcome;
        if (!accessToken || !supabaseUrl || !apiKey) {
          outcome = { ok: false, code: "PROVIDER_ERROR" };
        } else {
          const { references, media } = splitAttachments(attachments);
          outcome = await streamGeneration({
            supabaseUrl, apiKey, accessToken,
            body: { ...payload, references, media },
            signal: controller.signal,
            onEvent: (event) => setProgress((current) => (current ? applyEvent(current, event) : current)),
          });
        }
        if (outcome.ok) setProgress((current) => (current ? withPhase(current, "saving") : current));
        const reply = await finish({ data: outcome.ok ? { threadId, result: outcome.result } : { threadId, errorCode: outcome.code } });
        if (reply.ok) {
          setResult(reply.result);
          setMessages((m) => [...m, reply.message]);
          setTab((t) => (t === "chat" ? (reply.result.kind === "project" ? "files" : "preview") : t));
          void usage.refetch();
          return true;
        }
        if (reply.code === "CANCELLED") {
          setMessages((m) => [...m, { id: uid(), role: "assistant", content: "ساخت متوقف شد.", notice: true }]);
        } else {
          setMessages((m) => [...m, { id: uid(), role: "assistant", content: errorText[reply.code], error: true }]);
        }
        void usage.refetch();
        return false;
      } catch {
        setMessages((m) => [...m, { id: uid(), role: "assistant", content: errorText.PROVIDER_ERROR, error: true }]);
        return false;
      } finally {
        pending.current = false;
        abortRef.current = null;
        setLoading(false);
        setProgress(null);
        void queryClient.invalidateQueries({ queryKey: ["threads", user.id] });
      }
    },
    [user, threadId, begin, finish, queryClient, usage],
  );

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);
  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (lastUser) void send(lastUser.content);
  }, [messages, send]);
  const fixError = useCallback((message: string) => {
    setTab("chat");
    void send(`در پیش‌نمایش این خطا رخ داده است. علت را در کد پیدا کن و درستش کن:\n${message}`);
  }, [send]);

  if (authLoading)
    return (
      <div className="grid min-h-screen place-items-center bg-hero">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="در حال بارگذاری" />
      </div>
    );

  if (!user)
    return (
      <div className="flex min-h-screen flex-col bg-hero">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
          <Logo />
        </header>
        <main className="flex flex-1 items-center justify-center px-5 pb-16">
          <div className="w-full max-w-md rounded-3xl border bg-card/90 p-8 text-center shadow-card">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted"><Lock className="h-5 w-5 text-primary" aria-hidden /></span>
            <h1 className="mt-5 text-xl font-bold">برای ساخت وارد شوید</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {initialPrompt ? "درخواست شما نگه داشته شد و بعد از ورود در کادر گفتگو آماده است." : "حساب رایگان در روز اول ۱۰٪ اعتبار دارد و از روز بعد هر روز ۵٪. مصرف بر اساس حجم پروژه است: سایت کوچک کم و پروژهٔ سنگین بیشتر خرج می‌کند."}
            </p>
            {initialPrompt && <p className="mt-4 line-clamp-3 rounded-xl bg-muted px-3 py-2 text-sm">«{initialPrompt}»</p>}
            <Button asChild variant="hero" className="mt-6 w-full"><Link to="/auth">ورود یا ثبت‌نام</Link></Button>
          </div>
        </main>
      </div>
    );

  const tabs: { id: Tab; label: string }[] = [
    { id: "chat", label: "گفتگو" },
    { id: "preview", label: "پیش‌نمایش" },
    { id: "files", label: "فایل‌ها" },
    { id: "data", label: "داده‌ها" },
  ];
  const side = tab === "files" || tab === "data"; // the third pane shows the files or the data
  const remaining = usage.data?.remaining;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-2 border-b bg-surface px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <ProjectHistory
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            threads={threads.data ?? []}
            loading={threads.isLoading}
            error={threads.isError ? "فهرست پروژه‌ها بارگذاری نشد." : null}
            onRetry={() => { void threads.refetch(); }}
            activeId={threadId}
            disabled={loading}
            onNew={() => { setHistoryOpen(false); void startNewProject(); }}
            onSelect={selectThread}
            onDelete={removeProject}
          />
          <Logo />
        </div>
        <div role="tablist" aria-label="نمای کار" className="hidden rounded-lg bg-muted p-0.5 md:flex lg:hidden">
          {([["preview", Eye, "پیش‌نمایش"], ["files", Code2, "فایل‌ها"]] as const).map(([id, Icon, label]) => {
            const active = id === "files" ? side : !side;
            return (
              <Button variant="ghost" size="sm" key={id} role="tab" aria-selected={active} onClick={() => setTab(id)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${active ? "bg-card text-primary shadow" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden />{label}
              </Button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {remaining !== undefined && usage.data && (
            <div className="flex flex-col items-end gap-1" title="اعتبار روزانه؛ هر روز (به وقت جهانی) تازه می‌شود">
              <span className={`text-[11px] leading-none ${remaining === 0 ? "text-destructive" : "text-muted-foreground"}`}>
                اعتبار امروز: {remaining.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪
              </span>
              <span className="h-1 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className={`block h-full rounded-full transition-[width] duration-500 ${remaining / usage.data.limit < 0.2 ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.max(0, Math.min(100, (remaining / usage.data.limit) * 100))}%` }} />
              </span>
            </div>
          )}
          <UserMenu />
        </div>
      </header>

      <div role="tablist" aria-label="بخش‌های فضای کار" className="grid grid-cols-4 border-b bg-surface md:hidden">
        {tabs.map((t) => (
          <Button variant="ghost" key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`h-11 rounded-none text-sm font-medium transition ${tab === t.id ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>
            {t.label}
          </Button>
        ))}
      </div>

      {threads.isError && (
        <div className="flex items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm" role="alert">
          <span className="text-destructive">بارگذاری تاریخچهٔ پروژه‌ها ناموفق بود.</span>
          <Button size="sm" variant="outline" disabled={threads.isFetching} onClick={() => { void threads.refetch(); }}>
            {threads.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "تلاش دوباره"}
          </Button>
        </div>
      )}

      <main className="flex min-h-0 min-w-0 flex-1">
        <aside className={`${tab === "chat" ? "flex" : "hidden"} relative w-full min-w-0 flex-col bg-surface md:flex md:w-80 md:shrink-0 md:border-l lg:w-96`}>
          <ChatPanel messages={messages} loading={loading} progress={progress} onSend={send} onStop={stop} onRetry={retry} initialText={initialPrompt} disabled={remaining === 0 || !threadId || threadLoading || !!threadLoadError} />
          {threadLoading && (
            <div className="absolute inset-0 grid place-items-center bg-surface/70 backdrop-blur-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="در حال بارگذاری پروژه" />
            </div>
          )}
          {threadLoadError && !threadLoading && (
            <div className="absolute inset-0 grid place-items-center bg-surface/90 p-5 backdrop-blur-sm" role="alert">
              <div className="max-w-xs text-center">
                <p className="text-sm leading-6 text-destructive">{threadLoadError}</p>
                <Button className="mt-4" variant="outline" onClick={() => setThreadLoadAttempt((attempt) => attempt + 1)}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> تلاش دوباره
                </Button>
              </div>
            </div>
          )}
        </aside>
        <div className={`${tab === "preview" ? "flex" : "hidden"} ${side ? "md:hidden" : "md:flex"} min-w-0 flex-1 flex-col lg:flex`}>
          <PreviewPanel html={result?.previewHtml ?? null} title={result?.title} loading={loading} apiUrl={apiUrlFromFiles(result?.files)} isProject={result?.kind === "project"} onFixError={fixError} onOpenFiles={() => setTab("files")} />
        </div>
        <aside className={`${side ? "flex md:flex" : "hidden md:hidden"} w-full min-w-0 flex-1 flex-col bg-surface lg:flex lg:w-96 lg:flex-none lg:border-r`}>
          <div role="tablist" aria-label="فایل‌ها و داده‌ها" className="hidden gap-1 border-b bg-surface p-1.5 md:flex">
            {([["files", "فایل‌ها"], ["data", "داده‌ها"]] as const).map(([id, label]) => (
              <Button variant="ghost" size="sm" key={id} role="tab" aria-selected={(tab === "data") === (id === "data")} onClick={() => setTab(id)}
                className={`flex-1 ${(tab === "data") === (id === "data") ? "bg-muted text-primary" : "text-muted-foreground"}`}>
                {label}
              </Button>
            ))}
          </div>
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">
              {tab === "data"
                ? <DataPanel threadId={threadId ?? null} version={result?.createdAt ?? ""} onProjectChanged={() => setThreadLoadAttempt((attempt) => attempt + 1)} />
                : <FilesPanel files={result?.files ?? []} />}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
