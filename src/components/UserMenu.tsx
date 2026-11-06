import { Link, useNavigate } from "@tanstack/react-router";
import { Gauge, LogOut, Settings2, UserRound } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyUsage } from "@/lib/ai/generate.functions";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function UserMenu() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [leaving, setLeaving] = useState(false);
  const fetchUsage = useServerFn(getMyUsage);
  const usage = useQuery({ queryKey: ["usage", user?.id], queryFn: () => fetchUsage(), enabled: !!user });
  const fa = (n: number) => n.toLocaleString("fa-IR");
  if (loading) return <div className="h-9 w-20 animate-pulse rounded-lg bg-muted" />;
  if (!user)
    return (
      <Button asChild size="sm" variant="secondary">
        <Link to="/auth">ورود / ثبت‌نام</Link>
      </Button>
    );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="تنظیمات حساب" title="تنظیمات حساب"><Settings2 aria-hidden /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md" dir="rtl">
        <DialogHeader className="sm:text-right">
          <DialogTitle>تنظیمات حساب</DialogTitle>
          <DialogDescription>حساب کاربری شما</DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 items-center gap-3 border-y py-5">
          <UserRound className="size-8 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 break-all text-sm" dir="ltr">{user.email}</span>
        </div>
        <div className="rounded-xl border bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 font-medium"><Gauge className="size-4 text-primary" aria-hidden />سهمیهٔ امروز</span>
            {usage.data ? (
              <span className={usage.data.remaining === 0 ? "text-destructive" : "text-muted-foreground"}>
                {fa(usage.data.remaining)} از {fa(usage.data.limit)} ساخت باقی‌مانده
              </span>
            ) : usage.isError ? (
              <span className="text-muted-foreground">در دسترس نیست</span>
            ) : (
              <span className="h-4 w-24 animate-pulse rounded bg-muted" />
            )}
          </div>
          {usage.data && (
            <Progress className="mt-3 h-2" value={usage.data.limit ? (usage.data.remaining / usage.data.limit) * 100 : 0} aria-label="سهمیهٔ باقی‌مانده" />
          )}
          <p className="mt-2 text-xs text-muted-foreground">سهمیه هر روز (به وقت جهانی) تازه می‌شود.</p>
        </div>
        <Button variant="outline" disabled={leaving} className="justify-start text-destructive" onClick={async () => {
          setLeaving(true);
          try {
            await queryClient.cancelQueries();
            queryClient.clear();
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            await navigate({ to: "/auth", replace: true });
            toast.success("از حساب خارج شدید");
          } catch { toast.error("خروج انجام نشد؛ دوباره امتحان کنید"); }
          finally { setLeaving(false); }
        }}><LogOut aria-hidden />{leaving ? "در حال خروج…" : "خروج از حساب"}</Button>
      </DialogContent>
    </Dialog>
  );
}
