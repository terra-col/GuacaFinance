"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Moving between months: what is on screen leaves toward one side at once (the next month takes a
 * moment to arrive from the server), and the new month comes in from the other. On a phone the
 * month also changes with a clear sideways swipe. Transform and opacity only, through the Web
 * Animations API: cheap, and it also works where view transitions are off (iOS).
 */

const LEAVE = "month-leave";
// The last month each place showed, to know which side the new one comes from.
const shown = new Map<string, string>();

const still = () => typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Tells the month on screen to leave: 1 toward the next month (it goes left), -1 toward the previous. */
function leave(dir: 1 | -1) {
  window.dispatchEvent(new CustomEvent(LEAVE, { detail: dir }));
}

// A swipe: mostly sideways, long enough, quick, and not from the screen's edge (the phone's own «back»).
const EDGE = 28;
const MIN = 64;
const MAX_MS = 700;

export function MonthSlide({
  scope,
  month,
  prev = null,
  next = null,
  swipe = true,
  className,
  children,
}: {
  /** Each place keeps its own memory of the month it showed (a title and a list move together). */
  scope: string;
  month: string;
  /** Where a swipe goes; null where there is no such month to go to. */
  prev?: string | null;
  next?: string | null;
  swipe?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Arriving: from the side of the month it comes from.
  useLayoutEffect(() => {
    const el = box.current;
    const before = shown.get(scope);
    shown.set(scope, month);
    if (!el) return;
    for (const a of el.getAnimations()) a.cancel();
    if (!before || before === month || still()) return;
    const dir = month > before ? 1 : -1;
    el.animate([{ transform: `translateX(${dir * 36}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, [scope, month]);

  // Leaving: right away, before the next month is here. It waits faded; arriving replaces it.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let undo: ReturnType<typeof setTimeout> | undefined;
    const onLeave = (e: Event) => {
      if (still()) return;
      const dir = (e as CustomEvent<1 | -1>).detail;
      const out = el.animate([{ transform: "none", opacity: 1 }, { transform: `translateX(${-dir * 28}px)`, opacity: 0.25 }], { duration: 170, easing: "ease-in", fill: "forwards" });
      // If the month never arrives (no connection), it comes back.
      clearTimeout(undo);
      undo = setTimeout(() => out.cancel(), 5000);
    };
    window.addEventListener(LEAVE, onLeave);
    return () => {
      window.removeEventListener(LEAVE, onLeave);
      clearTimeout(undo);
    };
  }, []);

  // The swipe, on touch screens only (touch events), never starting in a field. It may start on a
  // button (the calendar is all days): a finger that moves sideways does not press it.
  useEffect(() => {
    const el = box.current;
    if (!el || !swipe || (!prev && !next)) return;
    let start: { x: number; y: number; t: number } | null = null;
    const down = (e: TouchEvent) => {
      const touch = e.touches[0];
      const target = e.target as Element | null;
      start =
        e.touches.length === 1 && touch.clientX > EDGE && touch.clientX < window.innerWidth - EDGE && !target?.closest("input, textarea, select, [data-no-swipe], dialog")
          ? { x: touch.clientX, y: touch.clientY, t: Date.now() }
          : null;
    };
    const up = (e: TouchEvent) => {
      if (!start) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const quick = Date.now() - start.t < MAX_MS;
      start = null;
      if (!quick || Math.abs(dx) < MIN || Math.abs(dx) < 2 * Math.abs(dy) || window.getSelection()?.toString()) return;
      const href = dx < 0 ? next : prev;
      if (!href) return;
      leave(dx < 0 ? 1 : -1);
      // To the top, where the new month's name is.
      router.push(href);
    };
    const cancel = () => (start = null);
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchend", up, { passive: true });
    el.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", cancel);
    };
  }, [swipe, prev, next, router]);

  return (
    <div ref={box} className={className} data-month-slide={month}>
      {children}
    </div>
  );
}

/** A month arrow: the same link as before, and the month on screen starts leaving on the tap. */
export function MonthArrow({ href, dir, className, label, children }: { href: string; dir: 1 | -1; className?: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className={className} aria-label={label} onClick={(e) => {
        // Opening it in another tab leaves this month where it is.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        leave(dir);
      }}>
      {children}
    </Link>
  );
}
