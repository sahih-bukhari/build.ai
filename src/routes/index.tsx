import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpLeft, BookOpen, Database, Download, Eye, ListChecks, MessageSquare, ShoppingBag, Sparkles, Utensils } from "lucide-react";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { PromptComposer } from "@/components/builder/ChatPanel";
import { savePendingPrompt } from "@/lib/pending-prompt";
import floral from "@/assets/floral-template.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "سازنده هوشمند — سایت و دیتابیس واقعی، با یک توصیف" },
      { name: "description", content: "به فارسی یا دری بنویسید چه می‌خواهید؛ سایت، فرم و دیتابیس واقعی ساخته می‌شود و فایل‌ها را دانلود می‌کنید." },
      { property: "og:title", content: "سازنده هوشمند — سایت و دیتابیس واقعی، با یک توصیف" },
      { property: "og:description", content: "به فارسی یا دری بنویسید چه می‌خواهید؛ سایت، فرم و دیتابیس واقعی ساخته می‌شود و فایل‌ها را دانلود می‌کنید." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

// Each starter names the data the site must keep, so the builder creates a real database for it.
const starters = [
  { icon: MessageSquare, label: "فرم تماس", prompt: "یک سایت معرفی کسب‌وکار با فرم تماس بساز؛ پیام‌ها در دیتابیس ذخیره شوند" },
  { icon: BookOpen, label: "دفتر مهمان", prompt: "یک دفتر مهمان بساز که بازدیدکننده‌ها نظر بنویسند و نظرها روی صفحه دیده شوند" },
  { icon: ShoppingBag, label: "فروشگاه با فرم سفارش", prompt: "یک فروشگاه کوچک با لیست محصولات و فرم سفارش بساز؛ سفارش‌ها ذخیره شوند" },
  { icon: Utensils, label: "رزرو میز", prompt: "یک سایت رستوران با منو و فرم رزرو میز بساز؛ رزروها ذخیره شوند" },
  { icon: ListChecks, label: "نظرسنجی", prompt: "یک صفحهٔ نظرسنجی بساز که رأی‌ها ذخیره شوند و نتیجه نمایش داده شود" },
] as const;

const gives = [
  { icon: Eye, title: "پیش‌نمایش زنده", text: "هر تغییر را همان لحظه روی موبایل و دسکتاپ می‌بینید." },
  { icon: Database, title: "دیتابیس واقعی", text: "پیام‌ها، سفارش‌ها و نظرها ذخیره می‌شوند. در تب «داده‌ها» می‌بینید و CSV می‌گیرید." },
  { icon: Download, title: "فایل‌های خودتان", text: "کد کامل سایت را ZIP دانلود می‌کنید؛ بدون قفل و بدون وابستگی." },
] as const;

const tileBase = "group h-auto flex-col items-stretch gap-0 overflow-hidden rounded-xl border bg-card p-0 text-start transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card";

function Landing() {
  const navigate = useNavigate();
  const start = (text: string) => { savePendingPrompt(text); void navigate({ to: "/builder" }); };
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div aria-hidden className="bg-girih animate-unfold pointer-events-none absolute inset-x-0 top-0 h-[36rem] [-webkit-mask-image:linear-gradient(to_bottom,black,transparent_85%)] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
        <Logo />
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link to="/builder">فضای کار</Link></Button>
          <UserMenu />
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-5 pb-12 pt-10 sm:pt-16">
        <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border bg-surface/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span>سازندهٔ هوشمند، به فارسی و دری</span>
        </div>
        <h1 className="text-balance text-center font-display text-4xl font-normal leading-[1.35] sm:text-6xl sm:leading-[1.3]">سایتتان را بگویید؛<br />همین‌جا ساخته می‌شود</h1>
        <p className="mx-auto mb-7 mt-4 max-w-xl text-center text-sm leading-7 text-muted-foreground sm:text-base">
          به فارسی یا دری بنویسید چه می‌خواهید. سایت، فرم و دیتابیس واقعی می‌گیرید و فایل‌ها را دانلود می‌کنید.
        </p>
        <div className="mx-auto max-w-2xl">
          <PromptComposer allowAttachments={false} onSend={async (text) => {
            start(text);
            return true;
          }} />
        </div>
        <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
          {starters.map((starter) => (
            <Button key={starter.label} variant="outline" size="sm" className="rounded-full bg-surface text-muted-foreground hover:text-foreground" onClick={() => start(starter.prompt)}>
              <starter.icon aria-hidden />{starter.label}
            </Button>
          ))}
        </div>
        <p className="mx-auto mt-3 max-w-2xl text-center text-xs leading-6 text-muted-foreground">
          برای ذخیرهٔ اطلاعات، فقط بگویید چه چیزهایی نگه داشته شوند؛ مثل پیام‌های تماس یا سفارش‌ها.
        </p>

        <section aria-label="آنچه می‌گیرید" className="mt-14 grid gap-6 border-t pt-8 sm:grid-cols-3 sm:gap-0">
          {gives.map((item) => (
            <div key={item.title} className="sm:px-6 sm:first:ps-0 sm:last:pe-0 sm:[&:not(:first-child)]:border-s">
              <span className="grid h-10 w-10 place-items-center rounded-xl border bg-card shadow-sm">
                <item.icon className="h-5 w-5 text-primary" aria-hidden />
              </span>
              <h2 className="mt-3 text-sm font-semibold">{item.title}</h2>
              <p className="mt-1.5 text-sm leading-7 text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </section>

        <section aria-label="شروع‌های آماده" className="mt-14 border-t pt-7">
          <h2 className="mb-5 text-sm font-medium">با یک نمونه شروع کنید</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Button variant="ghost" className={tileBase} onClick={() => start("یک سایت گل‌فروشی با رنگ‌های مرجانی، عکس گل و محصولات بساز؛ فرم سفارش داشته باشد و سفارش‌ها ذخیره شوند")}>
              <img src={floral} alt="گل‌های مرجانی در استودیوی گل‌فروشی" width={1024} height={768} className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <span className="flex items-center justify-between gap-2 p-4 text-sm"><span>گل‌فروشی با فرم سفارش</span><ArrowUpLeft aria-hidden /></span>
            </Button>
            <Button variant="ghost" className={tileBase} onClick={() => start("یک سایت کلینیک با معرفی پزشکان و فرم نوبت‌گیری بساز؛ درخواست‌ها ذخیره شوند")}>
              <span className="bg-girih flex aspect-[16/10] items-end bg-secondary p-5"><span className="font-display text-3xl font-normal leading-tight">نوبت‌گیری<br />کلینیک</span></span>
              <span className="flex items-center justify-between gap-2 p-4 text-sm"><span>درخواست‌ها ذخیره می‌شوند</span><ArrowUpLeft aria-hidden /></span>
            </Button>
            <Button variant="ghost" className={tileBase} onClick={() => start("یک دفتر مهمان برای مراسم عروسی بساز که مهمان‌ها پیام تبریک بنویسند و پیام‌ها دیده شوند")}>
              <span className="bg-girih flex aspect-[16/10] items-end bg-primary p-5 text-primary-foreground"><span className="font-display text-3xl font-normal leading-tight">دفتر مهمان<br />عروسی</span></span>
              <span className="flex items-center justify-between gap-2 p-4 text-sm"><span>پیام‌ها روی صفحه دیده می‌شوند</span><ArrowUpLeft aria-hidden /></span>
            </Button>
          </div>
        </section>
      </main>

      <footer className="relative mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 border-t px-5 py-6 text-xs text-muted-foreground">
        <span>اعتبار رایگان: روز اول ۱۰٪، هر روز بعد ۵٪</span>
        <nav className="flex gap-5"><Link to="/privacy">حریم خصوصی</Link><Link to="/terms">شرایط استفاده</Link></nav>
      </footer>
    </div>
  );
}
