import Link from "next/link";
import { Logo } from "@/components/logo";
import { AdvisorDock } from "@/components/advisor-dock";
import { CategoriesProvider } from "@/components/pickers";
import { AdvisorButton, Nav } from "@/components/nav";
import { aiProvider } from "@/lib/ai-provider";
import { NavProgress } from "@/components/nav-progress";
import { QuickAdd, QuickAddButton } from "@/components/quick-add";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { loadShell } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { pending, accounts, categories, today } = await loadShell();

  return (
    // Every category field (Registrar, editing a movement, fixed bills, Wallet's inbox) offers the person's own categories too.
    <CategoriesProvider categories={categories}>
    <div className="mx-auto w-full max-w-5xl px-4 pb-40 sm:px-6 lg:pb-16">
      <Suspense>
        <NavProgress />
      </Suspense>
      {/* Above the page so the fixed tab bar, which lives inside, stays on top of the content. */}
      <header className="relative z-40 flex items-center justify-between gap-3 py-4 sm:py-5">
        <div className="flex items-center gap-4">
          <Logo />
          <Nav pending={pending} />
        </div>
        <div className="flex items-center gap-2">
          <QuickAddButton />
          <AdvisorButton />
          <ThemeToggle />
          {/* Ajustes is an icon here on every screen size. */}
          <Link href="/ajustes" className="liquid flex size-10 items-center justify-center rounded-xl" aria-label="Ajustes" title="Ajustes">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h10m4 0h2M4 17h2m4 0h10M16 5v4M8 15v4" />
            </svg>
          </Link>
        </div>
        <QuickAdd accounts={accounts} today={today} />
      </header>
      <main className="flex flex-col gap-6 sm:gap-8">{children}</main>
      <AdvisorDock provider={aiProvider()} />
    </div>
    </CategoriesProvider>
  );
}
