import Link from "next/link";
import { Logo } from "@/components/logo";
import { AdvisorDock } from "@/components/advisor-dock";
import { CategoriesProvider } from "@/components/pickers";
import { AdvisorButton, Nav } from "@/components/nav";
import { aiProvider } from "@/lib/ai-provider";
import { NavProgress } from "@/components/nav-progress";
import { NoticeBell } from "@/components/notice-bell";
import { CurrencyProvider } from "@/components/currency-context";
import { QuickAdd, QuickAddButton } from "@/components/quick-add";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeaderTray } from "@/components/header-tray";
import { PrivacyToggle } from "@/components/privacy";
import { PRIVACY_COOKIE } from "@/lib/privacy";
import { cookies } from "next/headers";
import { loadShell } from "@/lib/data";
import { Tour } from "@/components/tour";
import { SharedReadyProvider } from "@/components/shared-ready";
import { RecurrenceReadyProvider } from "@/components/recurrence-ready";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { pending, accounts, categories, userId, tourSeen, sharedReady, socialReady, noticeCount, recurrenceReady, incomeRecurrenceReady, customPeriodsReady, currenciesReady, accountCurrenciesReady, today } = await loadShell();

  return (
    // Every category field (Registrar, editing a movement, fixed bills, Wallet's inbox) offers the person's own categories too.
    <CategoriesProvider categories={categories}>
    <SharedReadyProvider ready={sharedReady} social={socialReady}>
    <RecurrenceReadyProvider ready={recurrenceReady} incomes={incomeRecurrenceReady} custom={customPeriodsReady}>
    <CurrencyProvider ready={currenciesReady} accounts={accountCurrenciesReady}>
    <div className="mx-auto w-full max-w-5xl px-4 pb-40 sm:px-6 lg:pb-16">
      <Suspense>
        <NavProgress />
      </Suspense>
      {/* Above the page so the fixed tab bar, which lives inside, stays on top of the content. */}
      <header className="relative z-40 flex items-center justify-between gap-3 py-4 sm:py-5">
        <div className="flex items-center gap-4">
          {/* On phones the unfolded options cover the logo, so it steps aside. */}
          <span className="header-logo">
            <Logo compact={socialReady} />
          </span>
          <Nav pending={pending} />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <QuickAddButton />
          <HeaderTray>
            <AdvisorButton />
            {socialReady && <NoticeBell initial={noticeCount} />}
            <PrivacyToggle initial={(await cookies()).get(PRIVACY_COOKIE)?.value === "1"} />
            <ThemeToggle />
            <Link href="/ajustes" data-tour="settings" className="liquid flex size-10 items-center justify-center rounded-xl" aria-label="Más ajustes" title="Más ajustes">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </Link>
          </HeaderTray>
        </div>
        <QuickAdd accounts={accounts} today={today} />
      </header>
      <main className="flex flex-col gap-6 sm:gap-8">{children}</main>
      <AdvisorDock provider={aiProvider()} userId={userId} />
      <Tour autoStart={!tourSeen} userId={userId} />
    </div>
    </CurrencyProvider>
    </RecurrenceReadyProvider>
    </SharedReadyProvider>
    </CategoriesProvider>
  );
}
