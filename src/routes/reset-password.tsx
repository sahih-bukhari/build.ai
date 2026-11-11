import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "رمز تازه — سازنده هوشمند" },
      { name: "description", content: "رمز عبور تازه برای حساب خود انتخاب کنید." },
      { property: "og:title", content: "رمز تازه — سازنده هوشمند" },
      { property: "og:description", content: "رمز عبور تازه برای حساب خود انتخاب کنید." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error("تغییر رمز انجام نشد. لینک ممکن است منقضی شده باشد.");
      return;
    }
    toast.success("رمز عبور تغییر کرد.");
    void navigate({ to: "/builder" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-hero">
      <header className="mx-auto w-full max-w-6xl px-5 py-5"><Logo /></header>
      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl border bg-card/90 p-6 shadow-card sm:p-8">
          <h1 className="text-xl font-bold">رمز عبور تازه</h1>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">رمز تازه (دست‌کم ۸ نویسه)</Label>
            <Input id="new-password" type="password" dir="ltr" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" variant="hero" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}ذخیرهٔ رمز
          </Button>
        </form>
      </main>
    </div>
  );
}
