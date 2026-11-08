import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Logo />
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">بازگشت</Link>
      </header>
      <main className="px-5 pb-16">
        <article className="mx-auto max-w-3xl rounded-3xl border bg-card/90 p-6 leading-8 shadow-card sm:p-10 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_p]:mt-2 [&_p]:text-muted-foreground">
          <h1 className="text-3xl font-extrabold">{title}</h1>
          {children}
        </article>
      </main>
    </div>
  );
}
