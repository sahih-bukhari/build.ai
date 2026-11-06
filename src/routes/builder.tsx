import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Code2, Eye, Loader2, Lock } from "lucide-react";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/builder/ChatPanel";
import { PreviewPanel } from "@/components/builder/PreviewPanel";
import { FilesPanel } from "@/components/builder/FilesPanel";
import { ProjectHistory } from "@/components/builder/ProjectHistory";
import { createThread, deleteThread, getThread, listThreads } from "@/lib/ai/threads.functions";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { generateWebsite, getMyUsage } from "@/lib/ai/generate.functions";
import { clearPendingPrompt, readPendingPrompt } from "@/lib/pending-prompt";
import type { ChatMessage, GenerateErrorCode, GenerationResult } from "@/lib/ai/types";
import type { ReferenceFile } from "@/lib/reference-files";

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

const EMPTY_TITLE = "پروژهٔ تازه";

type Tab = "chat" | "preview" | "files";
let seq = 0;
const uid = () => `m${++seq}-${Date.now()}`;

const errorText: Record<GenerateErrorCode, string> = {
  USER_DAILY_LIMIT: "سهمیهٔ روزانهٔ شما تمام شد. پس از بازنشانی سهمیهٔ روزانه دوباره می‌توانید سایت بسازید.",
  PROJECT_DAILY_LIMIT: "ظرفیت روزانهٔ سرویس پر شده است؛ لطفاً فردا دوباره امتحان کنید.",
  RATE_LIMITED: "درخواست‌ها زیاد است؛ چند لحظه بعد دوباره امتحان کنید.",
  NO_CREDITS: "اعتبار سرویس هوش مصنوعی تمام شده است؛ به مدیر سایت اطلاع دهید.",
  PROVIDER_ERROR: "ارتباط با سرویس برقرار نشد. متن شما در کادر مانده؛ دوباره ارسال کنید.",
  INVALID_OUTPUT: "پاسخ قابل‌استفاده‌ای دریافت نشد. درخواست را ساده‌تر بنویسید و دوباره بفرستید.",
};

function Builder() {
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const pending = useRef(false);
  const generate = useServerFn(generateWebsite);
  const fetchUsage = useServerFn(getMyUsage);
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/builder" });
  const { t: threadId } = Route.useSearch();
  const fetchThreads = useServerFn(listThreads);
  const newThread = useServerFn(createThread);
  const loadThread = useServerFn(getThread);
  const removeThread = useServerFn(deleteThread);
  const [threadLoading, setThreadLoading] = useState(false);
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

  // Ensure a valid thread exists: reuse the newest empty project, otherwise create one.
  useEffect(() => {
    if (!user || threadId || !threads.data) return;
    const empty = threads.data[0]?.title === EMPTY_TITLE ? threads.data[0] : undefined;
    if (empty) void navigate({ search: { t: empty.id }, replace: true });
    else void startNewProject();
  }, [user, threadId, threads.data, navigate, startNewProject]);

  // Load the selected thread's saved messages and files.
  useEffect(() => {
    if (!user || !threadId) return;
    let cancelled = false;
    setThreadLoading(true);
    loadThread({ data: { threadId } })
      .then((row) => {
        if (cancelled) return;
        setMessages(Array.isArray(row.messages) ? row.messages : []);
        setResult(row.result ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("این پروژه پیدا نشد");
        void navigate({ search: {}, replace: true });
      })
      .finally(() => { if (!cancelled) setThreadLoading(false); });
    return () => { cancelled = true; };
  }, [user, threadId, loadThread, navigate]);

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
    async (text: string, references: ReferenceFile[] = []): Promise<boolean> => {
      if (!user || pending.current || !threadId) return false;
      pending.current = true;
      const history = messages.filter((m) => !m.error).slice(-8).map((m) => ({ role: m.role, content: m.content.slice(0, 1_200) }));
      setMessages((m) => [...m, { id: uid(), role: "user", content: text }]);
      setLoading(true);
      try {
        const reply = await generate({ data: { threadId, prompt: text, references, history, currentFiles: result?.files ?? [] } });
        if (reply.ok) {
          setResult(reply.result);
          setMessages((m) => [...m, { id: uid(), role: "assistant", content: reply.result.summary }]);
          setTab((t) => (t === "chat" ? "preview" : t));
          void usage.refetch();
          return true;
        }
        setMessages((m) => [...m, { id: uid(), role: "assistant", content: errorText[reply.code], error: true }]);
        if (reply.code === "USER_DAILY_LIMIT") void usage.refetch();
        return false;
      } catch {
        setMessages((m) => [...m, { id: uid(), role: "assistant", content: errorText.PROVIDER_ERROR, error: true }]);
        return false;
      } finally {
        pending.current = false;
        setLoading(false);
        void queryClient.invalidateQueries({ queryKey: ["threads", user.id] });
      }
    },
    [user, threadId, messages, result, generate, queryClient, usage],
  );

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
              {initialPrompt ? "درخواست شما نگه داشته شد و بعد از ورود در کادر گفتگو آماده است." : "با یک حساب رایگان، روزانه ۳۰ درخواست ساخت وب‌سایت دارید."}
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
  ];
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
            const active = id === "files" ? tab === "files" : tab !== "files";
            return (
              <Button variant="ghost" size="sm" key={id} role="tab" aria-selected={active} onClick={() => setTab(id)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${active ? "bg-card text-primary shadow" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden />{label}
              </Button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {remaining !== undefined && (
            <span className={`rounded-full border px-2.5 py-1 text-xs ${remaining === 0 ? "border-destructive/40 text-destructive" : "text-muted-foreground"}`}>
              {remaining} از {usage.data?.limit} ساخت امروز
            </span>
          )}
          <UserMenu />
        </div>
      </header>

      <div role="tablist" aria-label="بخش‌های فضای کار" className="grid grid-cols-3 border-b bg-surface md:hidden">
        {tabs.map((t) => (
          <Button variant="ghost" key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`h-11 rounded-none text-sm font-medium transition ${tab === t.id ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>
            {t.label}
          </Button>
        ))}
      </div>

      <main className="flex min-h-0 min-w-0 flex-1">
        <aside className={`${tab === "chat" ? "flex" : "hidden"} relative w-full min-w-0 flex-col bg-surface md:flex md:w-80 md:shrink-0 md:border-l lg:w-96`}>
          <ChatPanel messages={messages} loading={loading} onSend={send} initialText={initialPrompt} disabled={remaining === 0 || !threadId || threadLoading} />
          {threadLoading && (
            <div className="absolute inset-0 grid place-items-center bg-surface/70 backdrop-blur-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="در حال بارگذاری پروژه" />
            </div>
          )}
        </aside>
        <div className={`${tab === "preview" ? "flex" : "hidden"} ${tab === "files" ? "md:hidden" : "md:flex"} min-w-0 flex-1 flex-col lg:flex`}>
          <PreviewPanel html={result?.previewHtml ?? null} title={result?.title} loading={loading} />
        </div>
        <aside className={`${tab === "files" ? "flex md:flex" : "hidden md:hidden"} w-full min-w-0 flex-1 flex-col bg-surface lg:flex lg:w-96 lg:flex-none lg:border-r`}>
          <FilesPanel files={result?.files ?? []} />
        </aside>
      </main>
    </div>
  );
}
