import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpLeft, Flower2, LayoutTemplate, Palette, ShoppingBag, Sparkles } from "lucide-react";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { PromptComposer } from "@/components/builder/ChatPanel";
import { savePendingPrompt } from "@/lib/pending-prompt";
import { toast } from "sonner";
import floral from "@/assets/floral-template.jpg";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "سازنده هوشمند — ویب‌سایت را توصیف کنید، زنده ببینید" },
      { name: "description", content: "بنویسید چه ویب‌سایتی می‌خواهید؛ هوش مصنوعی در چند ثانیه آن را می‌سازد." },
      { property: "og:title", content: "سازنده هوشمند — ویب‌سایت را توصیف کنید، زنده ببینید" },
      { property: "og:description", content: "بنویسید چه ویب‌سایتی می‌خواهید؛ هوش مصنوعی در چند ثانیه آن را می‌سازد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const examples = [
  { icon: ShoppingBag, label: "فروشگاه آنلاین", prompt: "یک فروشگاه آنلاین مدرن با محصولات و بخش تماس بساز" },
  { icon: Palette, label: "نمونه‌کار", prompt: "یک سایت نمونه‌کار حرفه‌ای برای طراح محصول بساز" },
  { icon: LayoutTemplate, label: "سایت کسب‌وکار", prompt: "یک سایت حرفه‌ای معرفی کسب‌وکار با خدمات و تماس بساز" },
] as const;
function Landing() {
  const navigate = useNavigate();
  const start = (text: string) => { savePendingPrompt(text); void navigate({ to: "/builder" }); };
  return <div className="min-h-dvh bg-background">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5"><Logo /><div className="flex items-center gap-3"><Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link to="/builder">فضای کار</Link></Button><UserMenu /></div></header>
    <main className="mx-auto max-w-4xl px-5 pb-12 pt-12 sm:pt-20">
      <div className="mb-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><Sparkles className="h-4 w-4 text-primary" />ایدهٔ تازه، شروع تازه</div>
      <h1 className="text-center text-3xl font-bold leading-normal sm:text-5xl">سازنده هوشمند</h1>
      <p className="mb-8 mt-3 text-center text-sm text-muted-foreground sm:text-base">از ایده تا سایت؛ با سلیقهٔ شما.</p>
      <div className="mx-auto max-w-2xl"><PromptComposer onSend={async (text, refs = []) => { const full = text + refs.map((r) => `\nفایل مرجع ${r.name}:\n${r.content}`).join(""); if (full.length > 4000) { toast.error("برای فایل‌های بزرگ‌تر، ابتدا وارد فضای کار شوید."); return false; } start(full); return true; }} /></div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">{examples.map((example) => <Button key={example.label} variant="outline" size="sm" className="rounded-full bg-surface text-muted-foreground" onClick={() => start(example.prompt)}><example.icon />{example.label}</Button>)}</div>
      <section className="mt-14 border-t pt-7"><div className="mb-5 flex items-center justify-between"><h2 className="text-sm font-medium">برای ایدهٔ بعدی شما</h2><span className="text-xs text-muted-foreground">شروع‌های منتخب</span></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Button variant="ghost" className="group h-auto flex-col items-stretch gap-0 overflow-hidden rounded-lg border bg-card p-0 text-right" onClick={() => start("یک سایت گل‌فروشی با رنگ‌های مرجانی، عکس گل و محصولات بساز")}><img src={floral} alt="گل‌های مرجانی در استودیوی گل‌فروشی" width={1024} height={768} className="aspect-[16/10] w-full object-cover transition-transform group-hover:scale-105" /><span className="flex items-center justify-between p-4 text-sm"><span>استودیوی گل</span><ArrowUpLeft /></span></Button>
          <Button variant="ghost" className="h-auto flex-col items-stretch gap-0 overflow-hidden rounded-lg border bg-card p-0 text-right" onClick={() => start(examples[1].prompt)}><div className="flex aspect-[16/10] flex-col justify-between bg-primary p-5 text-primary-foreground"><Palette className="h-8 w-8" /><span className="text-2xl font-bold">ایده. طراحی.<br />اثر.</span></div><span className="flex items-center justify-between p-4 text-sm">نمونه‌کار خلاق<ArrowUpLeft /></span></Button>
          <Button variant="ghost" className="h-auto flex-col items-stretch gap-0 overflow-hidden rounded-lg border bg-card p-0 text-right" onClick={() => start(examples[2].prompt)}><div className="flex aspect-[16/10] flex-col justify-between bg-secondary p-5"><Flower2 className="h-8 w-8 text-primary" /><span className="text-2xl font-bold">یک قدم<br />رو به جلو.</span></div><span className="flex items-center justify-between p-4 text-sm">برند شخصی<ArrowUpLeft /></span></Button>
        </div>
      </section>
    </main>
    <footer className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 border-t px-5 py-6 text-xs text-muted-foreground"><span>۳۰ درخواست ساخت روزانه برای هر حساب</span><nav className="flex gap-5"><Link to="/privacy">حریم خصوصی</Link><Link to="/terms">شرایط استفاده</Link></nav></footer>
  </div>;
}
