"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

interface Item {
  href: string;
  label: string;
  icon: string;
}

const I = {
  home: "M4 13h6V4H4zm10 7h6V4h-6zM4 20h6v-4H4z",
  debts: "M3 6l6 6 4-4 8 8M21 11v5h-5",
  moves: "M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3",
  bills: "M4 5h16v15H4zM4 9h16M8 3v4m8-4v4m-7 7 2 2 4-4",
  goals: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
};

/** Five sections, the same on every screen. Asesor and Ajustes live in the header. */
export const TABS: Item[] = [
  { href: "/", label: "Inicio", icon: I.home },
  { href: "/movimientos", label: "Movimientos", icon: I.moves },
  { href: "/pagos", label: "Pagos", icon: I.bills },
  { href: "/deudas", label: "Créditos", icon: I.debts },
  { href: "/metas", label: "Metas", icon: I.goals },
];

function Icon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth={active ? 2.1 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Nav({ pending }: { pending: number }) {
  const pathname = usePathname();
  // The tapped tab lights up at once; the real address takes over when the screen arrives.
  const [tapped, setTapped] = useState<string | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setTapped(null);
  }
  const current = TABS.findIndex((t) => (t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)));
  const active = tapped ? TABS.findIndex((t) => t.href === tapped) : current;
  const tap = (href: string) => () => {
    if (TABS.findIndex((t) => t.href === href) !== current) setTapped(href);
  };

  // Phones: press and slide along the bar, like iOS's liquid glass tab bar. The bubble lifts and
  // follows the finger, the tab under it lights up, and letting go opens that tab. A plain tap
  // (under 8 px of movement) stays an ordinary link.
  const router = useRouter();
  const bar = useRef<HTMLElement>(null);
  const gesture = useRef<{ id: number; startX: number; dragging: boolean } | null>(null);
  const swallowClick = useRef(false);
  const lastIndex = useRef(-1);
  const [drag, setDrag] = useState<{ left: number; index: number } | null>(null);

  const measure = (clientX: number) => {
    const rect = bar.current!.getBoundingClientRect();
    const pad = 6; // the bar's p-1.5
    const width = (rect.width - pad * 2) / TABS.length;
    const x = clientX - rect.left - pad;
    return {
      index: Math.min(TABS.length - 1, Math.max(0, Math.floor(x / width))),
      left: Math.min((TABS.length - 1) * width, Math.max(0, x - width / 2)),
    };
  };
  const scrub = {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0) return;
      swallowClick.current = false;
      gesture.current = { id: e.pointerId, startX: e.clientX, dragging: false };
    },
    onPointerMove(e: React.PointerEvent) {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      if (!g.dragging) {
        if (Math.abs(e.clientX - g.startX) < 8) return;
        g.dragging = true;
        bar.current?.setPointerCapture(e.pointerId);
        lastIndex.current = -1;
      }
      const next = measure(e.clientX);
      if (lastIndex.current !== -1 && next.index !== lastIndex.current) navigator.vibrate?.(6);
      lastIndex.current = next.index;
      setDrag(next);
    },
    onPointerUp(e: React.PointerEvent) {
      const g = gesture.current;
      gesture.current = null;
      if (!g?.dragging) return;
      // The release may still fire a click on a link: the drag decides, not that click.
      swallowClick.current = true;
      setTimeout(() => (swallowClick.current = false), 400);
      setDrag(null);
      const { index } = measure(e.clientX);
      if (index !== current) {
        setTapped(TABS[index].href);
        window.dispatchEvent(new Event("guaca:navigate"));
        router.push(TABS[index].href);
      }
    },
    onPointerCancel() {
      gesture.current = null;
      setDrag(null);
    },
    onClickCapture(e: React.MouseEvent) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
  const shown = drag ? drag.index : active;

  // Desktop: the pill measures the active link, then glides to it.
  const desk = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const link = desk.current?.querySelectorAll<HTMLElement>("a")[active];
    if (!link) return setPill(null);
    const place = () => setPill({ left: link.offsetLeft, width: link.offsetWidth });
    place();
    const observer = new ResizeObserver(place);
    observer.observe(desk.current!);
    return () => observer.disconnect();
  }, [active]);

  const dot = (href: string) =>
    href === "/movimientos" && pending > 0 ? (
      <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-debt ring-2 ring-surface" aria-label={`${pending} por revisar`} />
    ) : null;

  return (
    <>
      <nav ref={desk} className="relative hidden items-center gap-0.5 text-sm lg:flex" aria-label="Secciones">
        <span
          aria-hidden="true"
          className="nav-glide absolute inset-y-0 rounded-full bg-brand/15"
          style={pill ? { left: pill.left, width: pill.width, opacity: 1 } : { opacity: 0 }}
        />
        {TABS.map((item, i) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={tap(item.href)}
            aria-current={i === current ? "page" : undefined}
            className={`relative rounded-full px-3.5 py-1.5 transition-colors ${i === active ? "font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}
          >
            {item.label}
            {dot(item.href)}
          </Link>
        ))}
      </nav>

      {/* Phones and tablets: a floating liquid-glass bar; a glass bubble slides under the chosen tab. */}
      {/* The transition name sits on the glass itself: on an ancestor it would cut the blur off from the page behind. */}
      <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 lg:hidden">
        <nav
          ref={bar}
          className="tab-scrub liquid liquid-bar relative grid grid-cols-5 rounded-[1.75rem] p-1.5"
          aria-label="Secciones"
          style={{ viewTransitionName: "tab-bar" }}
          {...scrub}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/5)]">
            <span
              className={`nav-glide liquid-bubble block h-full rounded-[1.4rem] ${drag ? "liquid-bubble-lifted" : ""}`}
              style={
                drag
                  ? // Follows the finger 1:1, slightly bigger, like a lens lifted off the bar.
                    { transform: `translateX(${drag.left}px) scale(1.12)`, opacity: 1, transition: "none" }
                  : { transform: `translateX(${Math.max(active, 0) * 100}%) scale(${active < 0 ? 0.6 : 1})`, opacity: active < 0 ? 0 : 1 }
              }
            />
          </span>
          {TABS.map((item, i) => {
            const on = i === shown;
            return (
              <Link
                key={item.href}
                href={item.href}
                draggable={false}
                onClick={tap(item.href)}
                aria-current={i === current ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 rounded-[1.4rem] py-1.5 text-[11px] font-semibold transition-colors duration-300 ${on ? "text-[var(--tab-on)]" : "text-[var(--tab-ink)]"}`}
              >
                {/* Re-keyed when it becomes active, so the icon bounces once on arrival. */}
                <span key={on ? "on" : "off"} className={`relative ${on ? "tab-bounce" : ""}`}>
                  <Icon d={item.icon} active={on} />
                  {dot(item.href)}
                </span>
                <span className="max-w-full truncate px-0.5">{item.label === "Movimientos" ? "Movim." : item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

    </>
  );
}

/** The AI advisor, one tap away from every screen. */
export function AdvisorButton() {
  const pathname = usePathname();
  const on = pathname.startsWith("/asesor");
  return (
    <Link
      href="/asesor"
      aria-current={on ? "page" : undefined}
      className={`liquid flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold transition-colors sm:px-3 ${on ? "liquid-tint" : ""}`}
      aria-label="Asesor"
      title="Asesor con IA"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
      </svg>
      <span className="max-sm:hidden">Asesor</span>
    </Link>
  );
}
