import { useState } from "react";
import { FolderClock, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export interface ThreadSummary {
  id: string;
  title: string;
  updated_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threads: ThreadSummary[];
  loading: boolean;
  activeId?: string | undefined;
  disabled?: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

const dateFmt = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" });

export function ProjectHistory({ open, onOpenChange, threads, loading, activeId, disabled, onNew, onSelect, onDelete }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setConfirm(null); }}>
      <SheetTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="پروژه‌های من" title="پروژه‌های من">
          <FolderClock aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" dir="rtl" className="flex w-[88vw] flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b p-5 text-right">
          <SheetTitle>پروژه‌های من</SheetTitle>
          <SheetDescription>گفتگوها و سایت‌های ساخته‌شده ذخیره می‌شوند.</SheetDescription>
        </SheetHeader>
        <div className="p-4">
          <Button variant="hero" className="w-full" disabled={disabled} onClick={onNew}>
            <Plus aria-hidden />پروژهٔ تازه
          </Button>
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="فهرست پروژه‌ها">
          {loading && (
            <li className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="در حال بارگذاری" /></li>
          )}
          {!loading && threads.length === 0 && (
            <li className="py-10 text-center text-sm text-muted-foreground">هنوز پروژه‌ای ندارید.</li>
          )}
          {threads.map((t) => {
            const active = t.id === activeId;
            return (
              <li key={t.id} className={`group flex items-center gap-1 rounded-xl border transition ${active ? "border-primary/40 bg-muted" : "border-transparent hover:bg-muted/60"}`}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(t.id)}
                  aria-current={active ? "true" : undefined}
                  className="min-w-0 flex-1 px-3 py-2.5 text-right disabled:opacity-50"
                >
                  <span className={`block truncate text-sm font-medium ${active ? "text-primary" : ""}`}>{t.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{dateFmt.format(new Date(t.updated_at))}</span>
                </button>
                {confirm === t.id ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="me-1.5 h-7 px-2 text-xs"
                    disabled={deleting === t.id}
                    onClick={async () => {
                      setDeleting(t.id);
                      try { await onDelete(t.id); } finally { setDeleting(null); setConfirm(null); }
                    }}
                  >
                    {deleting === t.id ? <Loader2 className="animate-spin" aria-hidden /> : "حذف؟"}
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="me-1 size-8 text-muted-foreground hover:text-destructive"
                    aria-label={`حذف ${t.title}`}
                    title="حذف"
                    disabled={disabled}
                    onClick={() => setConfirm(t.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
