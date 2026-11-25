"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdvisorMark } from "./advisor-mark";
import { openQuickAdd } from "./quick-add";
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

/** A phone tab: `also` is a second section that lights it up (Créditos y metas covers /metas). */
type BarItem = Item & { short?: string; also?: string };

/** Phones and tablets: four tabs with the «+» in the middle; Créditos and Metas share a tab and a switch inside it. */
const BAR: (BarItem | null)[] = [
  TABS[0],
  { ...TABS[1], short: "Movim." },
  null,
  TABS[2],
  { href: "/deudas", label: "Créditos y metas", icon: I.debts, also: "/metas" },
];
const onTab = (item: BarItem | null, path: string) =>
  !!item && (item.href === "/" ? path === "/" : path.startsWith(item.href) || (!!item.also && path.startsWith(item.also)));

/* The notch around the «+»: the bar's top edge curves down around a 68 px button with 6 px of air,
   through two rounded shoulders. Same numbers as .tab-notch in globals.css. */
/** The «+» column: wider than the notch (88 px at the bubble's top), so a resting bubble next to it is never cut. */
const MID = 92;
/** Where a tab's bubble rests: the side columns share what the «+» leaves. */
const SIDE = `((100% - ${MID}px) / 4)`;
const restAt = (i: number) => `calc(${SIDE} * ${i > 2 ? i - 1 : i} + ${i > 2 ? MID : 0}px)`;
const NOTCH_EDGE ="M0 0H1.04A16 16 0 0 1 17.03 15.43A40 40 0 0 0 96.97 15.43A16 16 0 0 1 112.96 0H114";

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
  // Compartidos is the other half of Movimientos.
  const section = pathname.startsWith("/compartidos") ? "/movimientos" : pathname;
  const current = TABS.findIndex((t) => (t.href === "/" ? section === "/" : section.startsWith(t.href)));
  const active = tapped ? TABS.findIndex((t) => t.href === tapped) : current;
  const tap = (href: string) => () => {
    if (TABS.findIndex((t) => t.href === href) !== current) setTapped(href);
  };
  const barCurrent = BAR.findIndex((t) => onTab(t, section));
  const barActive = tapped ? BAR.findIndex((t) => onTab(t, tapped)) : barCurrent;
  const tapBar = (href: string) => () => {
    if (BAR.findIndex((t) => onTab(t, href)) !== barCurrent) setTapped(href);
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
    const pad = 7; // the bar's border and p-1.5
    const inner = rect.width - pad * 2;
    const side = (inner - MID) / 4;
    const x = clientX - rect.left - pad;
    // Where each column ends: two tabs, the «+», two tabs.
    const ends = [side, 2 * side, 2 * side + MID, 3 * side + MID];
    return {
      index: ends.filter((end) => x >= end).length,
      left: Math.min(inner - side, Math.max(0, x - side / 2)),
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
      // Letting go behind the «+» goes nowhere: the bubble slides back to the open tab.
      const target = BAR[measure(e.clientX).index];
      if (target && !onTab(target, section)) {
        setTapped(target.href);
        window.dispatchEvent(new Event("guaca:navigate"));
        router.push(target.href);
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
  const shown = drag ? drag.index : barActive;

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
            data-tour={`tab${item.href}`}
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
          className="tab-scrub tab-notch liquid liquid-bar relative grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_92px_minmax(0,1fr)_minmax(0,1fr)] rounded-[1.75rem] p-1.5"
          aria-label="Secciones"
          style={{ viewTransitionName: "tab-bar" }}
          {...scrub}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-1.5">
            <span
              className={`nav-glide liquid-bubble absolute inset-y-0 rounded-[1.4rem] ${drag ? "liquid-bubble-lifted" : ""}`}
              style={
                drag
                  ? // Follows the finger 1:1, slightly bigger, like a lens lifted off the bar.
                    { left: drag.left, width: `calc${SIDE}`, transform: "scale(1.12)", opacity: 1, transition: "none" }
                  : { left: restAt(Math.max(barActive, 0)), width: `calc${SIDE}`, transform: `scale(${barActive < 0 ? 0.6 : 1})`, opacity: barActive < 0 ? 0 : 1 }
              }
            />
          </span>
          {/* The bar's edge, drawn again along the notch (the cut takes the border with it). */}
          <svg aria-hidden="true" width="114" height="60" className="tab-notch-edge pointer-events-none absolute left-[calc(50%-57px)] top-[-1px] overflow-visible">
            <path d={NOTCH_EDGE} fill="none" strokeWidth="2" />
          </svg>
          {BAR.map((item, i) => {
            if (!item) return <span key="plus" aria-hidden="true" />;
            const on = i === shown;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour={item.also ? "tab/creditos-metas" : `tab${item.href}`}
                draggable={false}
                onClick={tapBar(item.href)}
                aria-current={i === barCurrent ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 rounded-[1.4rem] py-1.5 text-[11px] font-semibold transition-colors duration-300 ${on ? "text-[var(--tab-on)]" : "text-[var(--tab-ink)]"}`}
              >
                {/* Re-keyed when it becomes active, so the icon bounces once on arrival. */}
                <span key={on ? "on" : "off"} className={`relative ${on ? "tab-bounce" : ""}`}>
                  <Icon d={item.icon} active={on} />
                  {dot(item.href)}
                </span>
                <span className="max-w-full px-0.5 text-center leading-tight">{item.short ?? item.label}</span>
              </Link>
            );
          })}
        </nav>
        {/* Registrar, sitting in the notch: the bubble keeps sliding behind it. */}
        <button
          type="button"
          onClick={openQuickAdd}
          data-tour="register"
          aria-label="Registrar movimiento"
          title="Registrar movimiento"
          className="fab register tab-plus absolute left-1/2 top-[-20px] flex size-[68px] -translate-x-1/2 items-center justify-center rounded-full"
          style={{ viewTransitionName: "tab-plus" }}
        >
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

    </>
  );
}

/** The AI advisor in the header, on phones and tablets (computers get the floating button). */
export function AdvisorButton() {
  const pathname = usePathname();
  const on = pathname.startsWith("/asesor");
  return (
    <Link
      href="/asesor"
      data-tour="advisor"
      aria-current={on ? "page" : undefined}
      className={`flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold transition-colors sm:px-3 lg:hidden ${on ? "fab" : "liquid"}`}
      aria-label="Asesor"
      title="Asesor con IA"
    >
      <AdvisorMark className="size-5" />
      <span className="max-sm:hidden">Asesor IA</span>
    </Link>
  );
}

