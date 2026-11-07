import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ورود یا ثبت‌نام — سازنده هوشمند" },
      { name: "description", content: "با ایمیل یا گوگل وارد سازنده هوشمند شوید." },
      { property: "og:title", content: "ورود یا ثبت‌نام — سازنده هوشمند" },
      { property: "og:description", content: "با ایمیل یا گوگل وارد سازنده هوشمند شوید." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "ایمیل یا رمز عبور درست نیست.";
  if (m.includes("email not confirmed")) return "ابتدا ایمیل خود را از طریق لینک ارسال‌شده تأیید کنید.";
  if (m.includes("already registered")) return "این ایمیل قبلاً ثبت شده است؛ وارد شوید.";
  if (m.includes("password")) return "رمز عبور باید دست‌کم ۸ نویسه و قوی باشد.";
  if (m.includes("rate")) return "تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید.";
  return "مشکلی پیش آمد؛ دوباره تلاش کنید.";
}

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    if (user) void navigate({ to: "/builder" });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("خوش آمدید!");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/builder` },
        });
        if (error) throw error;
        if (!data.session) setSent("برای فعال‌شدن حساب، روی لینک تأیید در ایمیل خود بزنید.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("اگر این ایمیل ثبت شده باشد، لینک تغییر رمز برایتان ارسال شد.");
      }
    } catch (err) {
      toast.error(translateError(err instanceof Error ? err.message : ""));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Google OAuth failed", error);
      toast.error("ورود با گوگل انجام نشد؛ تنظیمات Google در Supabase را بررسی کنید.");
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, string> = {
    signin: "به حساب خود وارد شوید",
    signup: "حساب تازه بسازید",
    forgot: "بازیابی رمز عبور",
  };

  return (
    <div className="flex min-h-screen flex-col bg-hero">
      <header className="mx-auto w-full max-w-6xl px-5 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm rounded-3xl border bg-card/90 p-6 shadow-card backdrop-blur sm:p-8">
          {sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto h-10 w-10 text-primary" aria-hidden />
              <h1 className="mt-4 text-xl font-bold">ایمیل خود را بررسی کنید</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{sent}</p>
              <Button variant="secondary" className="mt-6 w-full" onClick={() => { setSent(null); setMode("signin"); }}>
                بازگشت به ورود
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold">{titles[mode]}</h1>
              <p className="mt-1 text-sm text-muted-foreground">اعتبار رایگان: روز اول ۱۰٪ و هر روز بعد ۵٪؛ مصرف بر اساس حجم پروژه.</p>

              {mode !== "forgot" && (
                <>
                  <Button type="button" variant="secondary" className="mt-6 w-full" onClick={google} disabled={busy}>
                    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    ادامه با گوگل
                  </Button>
                  <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />یا با ایمیل<span className="h-px flex-1 bg-border" />
                  </div>
                </>
              )}

              <form onSubmit={submit} className={`space-y-4 ${mode === "forgot" ? "mt-6" : ""}`}>
                <div className="space-y-1.5">
                  <Label htmlFor="email">ایمیل</Label>
                  <Input id="email" type="email" dir="ltr" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">رمز عبور</Label>
                      {mode === "signin" && (
                        <button type="button" onClick={() => setMode("forgot")} className="text-xs text-primary hover:underline">
                          فراموش کردید؟
                        </button>
                      )}
                    </div>
                    <div className="relative" dir="ltr">
                      <Input id="password" type={showPassword ? "text" : "password"} dir="ltr" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "مخفی کردن رمز عبور" : "نمایش رمز عبور"} aria-pressed={showPassword} title={showPassword ? "مخفی کردن رمز عبور" : "نمایش رمز عبور"} className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-e-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                      </button>
                    </div>
                  </div>
                )}
                <Button type="submit" variant="hero" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {mode === "signin" ? "ورود" : mode === "signup" ? "ساخت حساب" : "ارسال لینک بازیابی"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signin" ? (
                  <>حساب ندارید؟ <button className="font-semibold text-primary hover:underline" onClick={() => setMode("signup")}>ثبت‌نام</button></>
                ) : (
                  <>حساب دارید؟ <button className="font-semibold text-primary hover:underline" onClick={() => setMode("signin")}>ورود</button></>
                )}
              </p>
            </>
          )}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            با ادامه، <Link to="/terms" className="underline">شرایط استفاده</Link> و{" "}
            <Link to="/privacy" className="underline">حریم خصوصی</Link> را می‌پذیرید.
          </p>
        </div>
      </main>
    </div>
  );
}
