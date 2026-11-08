import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Copy, Database, Download, KeyRound, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { declareCollection, getProjectApp, removeCollection, rotateAppKey } from "@/lib/ai/app-data.functions";
import { deleteRecords, exportRecords, listRecords, saveRecord } from "@/lib/ai/records.functions";
import { columnsOf, formatCell, parseRecordJson, recordsToCsv, recordsToJson, safeFileName, type DataRecord } from "@/lib/data-export";
import { downloadBlob } from "@/lib/project-download";

const PAGE_SIZE = 25;
const OPS = [
  { op: "create", title: "ثبت اطلاعات", help: "بازدیدکننده‌ها می‌توانند رکورد تازه اضافه کنند (مثل فرم تماس).", risky: false },
  { op: "read", title: "نمایش عمومی", help: "همهٔ بازدیدکننده‌ها همهٔ رکوردهای این مجموعه را می‌بینند. برای اطلاعات شخصی (تلفن، ایمیل، سفارش) روشن نکنید.", risky: true },
  { op: "update", title: "ویرایش موارد خود", help: "هر بازدیدکننده فقط رکوردهایی را ویرایش می‌کند که با همان مرورگر ثبت کرده است.", risky: false },
  { op: "delete", title: "حذف موارد خود", help: "هر بازدیدکننده فقط رکوردهایی را حذف می‌کند که با همان مرورگر ثبت کرده است.", risky: false },
] as const;

interface Props {
  threadId: string | null;
  /** Changes after every build, so the panel reloads when the generator adds collections. */
  version: string;
  /** Called after the project's saved files changed on the server (key rotation). */
  onProjectChanged: () => void;
}

type Editor = { id: string | null; text: string; error: string | null };

function maskKey(key: string): string {
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "انجام نشد؛ دوباره امتحان کنید";
}

export function DataPanel({ threadId, version, onProjectChanged }: Props) {
  const queryClient = useQueryClient();
  const loadApp = useServerFn(getProjectApp);
  const declare = useServerFn(declareCollection);
  const removeOne = useServerFn(removeCollection);
  const rotate = useServerFn(rotateAppKey);
  const list = useServerFn(listRecords);
  const exportAll = useServerFn(exportRecords);
  const save = useServerFn(saveRecord);
  const removeRecords = useServerFn(deleteRecords);

  const [chosen, setChosen] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<DataRecord | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const app = useQuery({
    queryKey: ["app-data", threadId, version],
    queryFn: () => loadApp({ data: { threadId: threadId ?? "" } }),
    enabled: Boolean(threadId),
  });
  const collections = app.data?.collections ?? [];
  // The chosen collection, or the first one when nothing is chosen yet or the chosen one was deleted.
  const current = collections.find((collection) => collection.name === chosen) ?? collections[0] ?? null;
  const selected = current?.name ?? null;
  const chooseCollection = (name: string) => { setChosen(name); setPage(0); };

  const records = useQuery({
    queryKey: ["app-records", threadId, selected, page, version],
    queryFn: () => list({ data: { threadId: threadId ?? "", collection: selected ?? "", offset: page * PAGE_SIZE, limit: PAGE_SIZE } }),
    enabled: Boolean(threadId && selected),
  });
  const rows = records.data?.records ?? [];
  const total = records.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const columns = columnsOf(rows, 4);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["app-data", threadId] }),
      queryClient.invalidateQueries({ queryKey: ["app-records", threadId] }),
    ]);
  };

  const run = async (action: () => Promise<unknown>, okMessage: string | null): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      if (okMessage) toast.success(okMessage);
      await refresh();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleOp = (op: string, on: boolean) => {
    if (!current || !threadId) return;
    const projectId = threadId;
    const name = current.name;
    const next = OPS.map((item) => item.op).filter((item) => (item === op ? on : current.publicOps.includes(item)));
    void run(() => declare({ data: { threadId: projectId, name, publicOps: next } }), null);
  };

  const openNew = () => {
    const fields = columnsOf(rows, 6);
    const template = Object.fromEntries((fields.length ? fields : ["title"]).map((field) => [field, ""]));
    setEditor({ id: null, text: JSON.stringify(template, null, 2), error: null });
  };

  const submitEditor = async () => {
    if (!editor || !threadId || !selected) return;
    const projectId = threadId;
    const collection = selected;
    const parsed = parseRecordJson(editor.text);
    if (!parsed.ok) {
      setEditor({ ...editor, error: parsed.error });
      return;
    }
    const done = await run(
      () => save({ data: { threadId: projectId, collection, ...(editor.id ? { id: editor.id } : {}), data: parsed.data } }),
      editor.id ? "رکورد ذخیره شد" : "رکورد اضافه شد",
    );
    if (done) setEditor(null);
  };

  const exportAs = async (format: "csv" | "json") => {
    if (!threadId || !selected) return;
    setBusy(true);
    try {
      const { records: all } = await exportAll({ data: { threadId, collection: selected } });
      if (!all.length) {
        toast.info("رکوردی برای خروجی گرفتن نیست");
        return;
      }
      const text = format === "csv" ? recordsToCsv(all) : recordsToJson(all);
      const type = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
      downloadBlob(new Blob([text], { type }), safeFileName(selected, format));
      toast.success("فایل خروجی دانلود شد");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!app.data) return;
    try {
      await navigator.clipboard.writeText(app.data.publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("کپی انجام نشد");
    }
  };

  if (!threadId) {
    return <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">ابتدا یک پروژه انتخاب کنید.</div>;
  }
  if (app.isLoading) {
    return <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="در حال بارگذاری" /></div>;
  }
  if (app.isError || !app.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <p className="text-sm leading-6 text-destructive">بخش داده‌ها بارگذاری نشد.</p>
        <p className="text-xs leading-5 text-muted-foreground">اگر تازه برنامه را به‌روز کرده‌اید، مطمئن شوید مایگریشن‌های دیتابیس اعمال شده‌اند.</p>
        <Button size="sm" variant="outline" onClick={() => { void app.refetch(); }}><RefreshCw className="h-4 w-4" aria-hidden /> تلاش دوباره</Button>
      </div>
    );
  }
  if (!collections.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border bg-card"><Database className="h-6 w-6 text-primary" aria-hidden /></span>
        <h3 className="mt-4 text-sm font-semibold">این پروژه هنوز دیتابیسی ندارد</h3>
        <p className="mt-2 max-w-xs text-xs leading-6 text-muted-foreground">
          در گفتگو بنویسید که سایت چه چیزی را ذخیره کند، مثلاً «یک فرم تماس بساز که پیام‌ها ذخیره شوند» یا «دفتر مهمان با نمایش نظرها». بعد از ساخت، رکوردها اینجا دیده می‌شوند.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="داده‌ها" className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1 overflow-x-auto border-b bg-surface px-3 py-2" role="tablist" aria-label="مجموعه‌ها">
        {collections.map((collection) => (
          <Button key={collection.name} size="sm" variant="ghost" role="tab" aria-selected={collection.name === selected} onClick={() => chooseCollection(collection.name)}
            dir="ltr" className={`font-mono ${collection.name === selected ? "bg-muted text-primary" : "text-muted-foreground"}`}>
            {collection.name} <span className="text-[10px] opacity-70">{collection.count.toLocaleString("fa-IR")}</span>
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {current && (
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs font-semibold">بازدیدکننده‌های سایت چه کارهایی می‌توانند بکنند؟</p>
            <div className="mt-2 space-y-2">
              {OPS.map((item) => {
                const checked = current.publicOps.includes(item.op);
                const id = `op-${current.name}-${item.op}`;
                return (
                  <div key={item.op} className="flex items-start gap-2">
                    <Checkbox id={id} checked={checked} disabled={busy} onCheckedChange={(value) => toggleOp(item.op, value === true)} className="mt-0.5" />
                    <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                      <span className="text-xs font-medium">{item.title}</span>
                      <span className={`block text-[11px] leading-5 ${item.risky && checked ? "text-destructive" : "text-muted-foreground"}`}>{item.help}</span>
                    </label>
                  </div>
                );
              })}
            </div>
            {!current.publicOps.length && <p className="mt-2 text-[11px] text-muted-foreground">هیچ دسترسی روشن نیست؛ فقط شما می‌توانید داده‌ها را ببینید و تغییر دهید.</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={openNew} disabled={busy}><Plus className="h-4 w-4" aria-hidden /> رکورد جدید</Button>
          <Button size="sm" variant="outline" onClick={() => { void exportAs("csv"); }} disabled={busy}><Download className="h-4 w-4" aria-hidden /> CSV</Button>
          <Button size="sm" variant="outline" onClick={() => { void exportAs("json"); }} disabled={busy}><Download className="h-4 w-4" aria-hidden /> JSON</Button>
          <Button size="icon-sm" variant="ghost" title="تازه‌سازی" aria-label="تازه‌سازی" onClick={() => { void refresh(); }} disabled={records.isFetching}>
            <RefreshCw className={`h-4 w-4 ${records.isFetching ? "animate-spin" : ""}`} aria-hidden />
          </Button>
          <span className="ms-auto text-xs text-muted-foreground">{total.toLocaleString("fa-IR")} رکورد</span>
        </div>

        {records.isError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">رکوردها بارگذاری نشدند.</p>
        ) : records.isLoading ? (
          <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="در حال بارگذاری" /></div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-xs leading-6 text-muted-foreground">هنوز رکوردی ثبت نشده است. وقتی بازدیدکننده‌ها فرم را پر کنند، اینجا می‌بینید.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-start text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  {columns.map((column) => <th key={column} dir="ltr" className="px-2 py-1.5 text-start font-medium">{column}</th>)}
                  <th className="px-2 py-1.5 text-start font-medium">زمان</th>
                  <th className="px-2 py-1.5 text-start font-medium">منبع</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t align-top">
                    {columns.map((column) => <td key={column} className="max-w-[12rem] px-2 py-1.5">{formatCell(row.data[column])}</td>)}
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{new Date(row.createdAt).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{row.byVisitor ? "بازدیدکننده" : "شما"}</td>
                    <td className="whitespace-nowrap px-1 py-1">
                      <Button size="icon-xs" variant="ghost" title="ویرایش" aria-label="ویرایش" disabled={busy} onClick={() => setEditor({ id: row.id, text: JSON.stringify(row.data, null, 2), error: null })}><Pencil className="h-3.5 w-3.5" aria-hidden /></Button>
                      <Button size="icon-xs" variant="ghost" title="حذف" aria-label="حذف" disabled={busy} onClick={() => setRecordToDelete(row)}><Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 text-xs">
            <Button size="icon-sm" variant="outline" aria-label="صفحهٔ بعد" disabled={page >= pages - 1} onClick={() => setPage((value) => value + 1)}><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
            <span>{(page + 1).toLocaleString("fa-IR")} از {pages.toLocaleString("fa-IR")}</span>
            <Button size="icon-sm" variant="outline" aria-label="صفحهٔ قبل" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronRight className="h-4 w-4" aria-hidden /></Button>
          </div>
        )}

        <div className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="text-xs font-semibold">کلید عمومی پروژه</span>
            <code dir="ltr" className="ms-auto truncate rounded bg-muted px-1.5 py-0.5 text-[11px]">{maskKey(app.data.publicKey)}</code>
            <Button size="icon-xs" variant="ghost" title="کپی کلید" aria-label="کپی کلید" onClick={() => { void copyKey(); }}>
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            </Button>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">این کلید محرمانه نیست و داخل خود سایت قرار می‌گیرد. دسترسی‌ها را همین‌جا کنترل می‌کنید.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmRotate(true)}>تعویض کلید</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmRemove(true)}><Trash2 className="h-4 w-4" aria-hidden /> حذف این مجموعه</Button>
          </div>
        </div>
      </div>

      <Dialog open={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor?.id ? "ویرایش رکورد" : "رکورد جدید"}</DialogTitle>
            <DialogDescription>رکورد را به‌صورت JSON بنویسید: نام فیلدها و متن‌ها داخل " " و بین فیلدها ویرگول.</DialogDescription>
          </DialogHeader>
          <Textarea dir="ltr" rows={10} className="font-mono text-xs" value={editor?.text ?? ""} onChange={(event) => setEditor(editor ? { ...editor, text: event.target.value, error: null } : editor)} aria-label="محتوای رکورد" />
          {editor?.error && <p className="text-xs text-destructive" role="alert">{editor.error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)} disabled={busy}>انصراف</Button>
            <Button onClick={() => { void submitEditor(); }} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} ذخیره</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={recordToDelete !== null} onOpenChange={(open) => { if (!open) setRecordToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>این رکورد حذف شود؟</AlertDialogTitle>
            <AlertDialogDescription>حذف قابل بازگشت نیست.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const row = recordToDelete;
              const projectId = threadId;
              const collection = selected;
              if (row && collection && projectId) void run(() => removeRecords({ data: { threadId: projectId, collection, ids: [row.id] } }), "رکورد حذف شد");
            }}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>مجموعهٔ «{current?.name}» حذف شود؟</AlertDialogTitle>
            <AlertDialogDescription>
              همهٔ {(current?.count ?? 0).toLocaleString("fa-IR")} رکورد آن برای همیشه پاک می‌شود. اگر سایت هنوز از این مجموعه استفاده کند، خطا می‌دهد؛ در گفتگو بخواهید سایت اصلاح شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const name = current?.name;
              const projectId = threadId;
              if (name && projectId) void run(() => removeOne({ data: { threadId: projectId, name } }), "مجموعه حذف شد");
            }}>حذف مجموعه و رکوردها</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>کلید پروژه عوض شود؟</AlertDialogTitle>
            <AlertDialogDescription>
              پیش‌نمایش همین‌جا خودکار با کلید تازه به‌روز می‌شود. اما سایت‌هایی که قبلاً دانلود یا منتشر کرده‌اید با کلید قدیمی کار نمی‌کنند و باید دوباره از «فایل‌ها» دانلود شوند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const projectId = threadId;
              if (projectId) void run(() => rotate({ data: { threadId: projectId } }), "کلید تازه ساخته شد").then((done) => { if (done) onProjectChanged(); });
            }}>تعویض کلید</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
