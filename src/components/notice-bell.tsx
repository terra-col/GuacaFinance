"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export const NOTICES_READ = "guaca:notices-read";
const EVERY_MINUTE = 60_000;

/**
 * The bell: what is unread or waits for an answer. It asks again on moving between screens, on
 * coming back to the app and each minute while the app is in sight.
 */
export function NoticeBell({ initial }: { initial: number }) {
  const pathname = usePathname();
  const [count, setCount] = useState(initial);
  const [given, setGiven] = useState(initial);
  // An action redrew the frame with a newer count.
  if (given !== initial) {
    setGiven(initial);
    setCount(initial);
  }

  useEffect(() => {
    let on = true;
    async function ask() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/avisos", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { count?: number };
        if (on && typeof body.count === "number") setCount(body.count);
      } catch {
        // Without connection the last count stays.
      }
    }
    void ask();
    const timer = setInterval(ask, EVERY_MINUTE);
    document.addEventListener("visibilitychange", ask);
    window.addEventListener(NOTICES_READ, ask);
    return () => {
      on = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
      window.removeEventListener(NOTICES_READ, ask);
    };
  }, [pathname]);

  const here = pathname === "/avisos";
  const label = count > 0 ? `Avisos: ${count} ${count === 1 ? "pendiente" : "pendientes"}` : "Avisos";
  return (
    <Link href="/avisos" data-bell aria-current={here ? "page" : undefined} aria-label={label} title={label} className={`relative flex size-10 items-center justify-center rounded-xl ${here ? "fab" : "liquid"}`}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 16.5V10a6 6 0 0 1 12 0v6.5l1.5 2h-15zM10 21h4" />
      </svg>
      {count > 0 && (
        <span data-bell-count className="num absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#c8371b] px-1 text-[11px] font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
