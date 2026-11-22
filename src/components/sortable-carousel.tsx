"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { reorderAccounts } from "@/app/actions";
import { Carousel } from "./carousel";

/** Sent by the star when an account becomes (or stops being) the favourite, before the server answers. */
export const FAVORITE_EVENT = "guaca:favorita";
export type FavoriteDetail = { id: string; on: boolean };

const LONG_PRESS = 420; // ms holding a card on a phone before it lifts
const MOUSE_SLOP = 6; // px a mouse moves before a press becomes a drag
const TOUCH_SLOP = 8; // px a finger moves before it is a scroll, not a long press
const EDGE = 56; // px from the row's edge where a lifted card scrolls the row
const MOVE = "cubic-bezier(0.22, 1.12, 0.36, 1)"; // a little settle at the end, like a card set down

interface Drag {
  id: string;
  from: number;
  target: number;
  dx: number;
  /** Where each slot starts, measured when the card lifted. */
  lefts: number[];
}

/**
 * A carousel of accounts whose order can be changed: hold a card (on a phone) or drag it (with a
 * mouse) and the others make room; let go and it stays there, saved for next time. The favourite
 * for payments is always first and does not move. Whenever the order changes (a drag, a new
 * favourite) the cards glide to their new places instead of jumping.
 */
export function SortableCarousel({
  label,
  items,
  favorite = null,
  slideClass = "w-[82%] shrink-0 snap-start sm:w-80",
  tail,
}: {
  label: string;
  items: { id: string; node: React.ReactNode }[];
  favorite?: string | null;
  slideClass?: string;
  /** After the cards and never moved: the «+» tile. */
  tail?: React.ReactNode;
}) {
  const fromProps = items.map((i) => i.id);
  const [order, setOrder] = useState(fromProps);
  const [pinned, setPinned] = useState(favorite);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The cards rise in once. A card moved in the page would replay that animation (a moved element
  // restarts its CSS animations), so it stops applying once they are in.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 900);
    return () => clearTimeout(t);
  }, []);

  // A new order from the server (another favourite, an account added or removed) replaces ours.
  const propKey = `${fromProps.join(",")}|${favorite ?? ""}`;
  const [seen, setSeen] = useState(propKey);
  if (seen !== propKey) {
    setSeen(propKey);
    setOrder(fromProps);
    setPinned(favorite);
  }

  const byId = new Map(items.map((i) => [i.id, i.node]));
  const shown = [...order.filter((id) => byId.has(id)), ...fromProps.filter((id) => !order.includes(id))];
  const first = pinned && shown[0] === pinned ? 1 : 0; // nothing goes before the favourite

  const track = useRef<HTMLUListElement | null>(null);
  const slides = useRef(new Map<string, HTMLLIElement>());
  const last = useRef(new Map<string, number>());
  const gesture = useRef<{
    id: string;
    startX: number;
    startY: number;
    startScroll: number;
    x: number;
    active: boolean;
    timer: number | null;
  } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const justDragged = useRef(false);
  const goHome = useRef(false);
  // The latest order, for the gesture handlers (they outlive a render).
  const shownRef = useRef(shown);
  const firstRef = useRef(first);
  useLayoutEffect(() => {
    shownRef.current = shown;
    firstRef.current = first;
  });

  // FLIP: each card starts where it was drawn before and glides to where it is now.
  useLayoutEffect(() => {
    // A new favourite: back to the start of the row once the cards have their new places (before
    // that, the row would snap back to the card it was showing).
    if (goHome.current) {
      goHome.current = false;
      track.current?.scrollTo({ left: 0, behavior: "smooth" });
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [id, el] of slides.current) {
      const now = el.offsetLeft;
      const before = last.current.get(id);
      last.current.set(id, now);
      if (before === undefined || before === now || still || dragRef.current) continue;
      const dx = before - now;
      el.animate(
        [
          { transform: `translateX(${dx}px)`, zIndex: dx > 0 ? 2 : 1 },
          { transform: "translateX(0)", zIndex: dx > 0 ? 2 : 1 },
        ],
        { duration: 520, easing: MOVE },
      );
    }
  });

  // The star: the new favourite goes first at once (the server confirms later).
  useEffect(() => {
    const onFavorite = (e: Event) => {
      const { id, on } = (e as CustomEvent<FavoriteDetail>).detail;
      if (!shownRef.current.includes(id)) return;
      if (!on) return setPinned(null);
      setPinned(id);
      setOrder((o) => [id, ...o.filter((x) => x !== id)]);
      goHome.current = true;
    };
    window.addEventListener(FAVORITE_EVENT, onFavorite);
    return () => window.removeEventListener(FAVORITE_EVENT, onFavorite);
  }, []);

  function measure(id: string, x: number) {
    const g = gesture.current;
    const el = track.current;
    const d = dragRef.current;
    if (!g || !el || !d) return;
    // The card travels between the first place it may take and the last card, no further.
    const min = d.lefts[firstRef.current] - 24;
    const max = d.lefts[d.lefts.length - 1] + 24;
    const at = Math.min(max, Math.max(min, d.lefts[d.from] + x - g.startX + (el.scrollLeft - g.startScroll)));
    const dx = at - d.lefts[d.from];
    let target = d.from;
    let best = Infinity;
    d.lefts.forEach((left, i) => {
      if (i < firstRef.current) return;
      if (Math.abs(left - at) < best) {
        best = Math.abs(left - at);
        target = i;
      }
    });
    const next = { ...d, id, dx, target };
    dragRef.current = next;
    setDrag(next);
  }

  function lift() {
    const g = gesture.current;
    if (!g) return;
    const list = shownRef.current;
    const from = list.indexOf(g.id);
    if (from < firstRef.current) return (gesture.current = null);
    g.active = true;
    const d: Drag = { id: g.id, from, target: from, dx: 0, lefts: list.map((id) => slides.current.get(id)?.offsetLeft ?? 0) };
    dragRef.current = d;
    setDrag(d);
    navigator.vibrate?.(12);
    // Near an edge, the row scrolls by itself so the card can travel past what is on screen.
    const step = () => {
      const now = gesture.current;
      const el = track.current;
      if (!now?.active || !el) return;
      const r = el.getBoundingClientRect();
      const d = dragRef.current;
      const at = d ? d.lefts[d.from] + d.dx : 0;
      const atStart = !d || at <= d.lefts[firstRef.current] - 24;
      const atEnd = !d || at >= d.lefts[d.lefts.length - 1] + 24;
      const speed = now.x < r.left + EDGE && !atStart ? -12 : now.x > r.right - EDGE && !atEnd ? 12 : 0;
      if (speed) {
        el.scrollLeft += speed;
        measure(now.id, now.x);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function begin(id: string, x: number, y: number, touch: boolean) {
    if (!track.current || id === pinned) return;
    gesture.current = { id, startX: x, startY: y, startScroll: track.current.scrollLeft, x, active: false, timer: null };
    if (touch) gesture.current.timer = window.setTimeout(lift, LONG_PRESS);
  }

  /** Returns true while a card is lifted (the page must not scroll). */
  function follow(x: number, y: number, touch: boolean) {
    const g = gesture.current;
    if (!g) return false;
    g.x = x;
    if (!g.active) {
      const moved = Math.hypot(x - g.startX, y - g.startY);
      if (touch && moved > TOUCH_SLOP) cancel(); // a swipe: the row scrolls as usual
      else if (!touch && Math.abs(x - g.startX) > MOUSE_SLOP) lift();
      return false;
    }
    measure(g.id, x);
    return true;
  }

  function cancel() {
    const g = gesture.current;
    if (g?.timer) clearTimeout(g.timer);
    gesture.current = null;
  }

  function drop() {
    const g = gesture.current;
    const d = dragRef.current;
    cancel();
    if (!g?.active || !d) return;
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 350);
    // Where every card is on screen right now, so they glide from there to their places.
    const list = shownRef.current;
    list.forEach((id, i) => last.current.set(id, d.lefts[i] + (i === d.from ? d.dx : offset(d, i))));
    dragRef.current = null;
    setDrag(null);
    if (d.target === d.from) return;
    const next = [...list];
    next.splice(d.from, 1);
    next.splice(d.target, 0, d.id);
    setOrder(next);
    setProblem(null);
    reorderAccounts(next)
      .then((r) => r.error && setProblem(r.error))
      .catch(() => setProblem("No se pudo guardar el orden. Intenta de nuevo."));
  }

  // Touch: listeners of our own, because a lifted card must stop the page from scrolling, which a
  // React (passive) touch listener cannot do.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const idOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[data-sort-id]")?.dataset.sortId : undefined);
    const start = (e: TouchEvent) => {
      const id = idOf(e.target);
      if (id && e.touches.length === 1 && !(e.target as Element).closest("button")) begin(id, e.touches[0].clientX, e.touches[0].clientY, true);
    };
    const move = (e: TouchEvent) => {
      if (follow(e.touches[0].clientX, e.touches[0].clientY, true) && e.cancelable) e.preventDefault();
    };
    const end = () => drop();
    // The long press must not open the link's menu (Android).
    const menu = (e: Event) => gesture.current && e.preventDefault();
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    el.addEventListener("contextmenu", menu);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      el.removeEventListener("contextmenu", menu);
    };
  });

  // Mouse: press on a card and move it.
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || e.button !== 0 || (e.target as Element).closest("button")) return;
    const id = (e.target as Element).closest<HTMLElement>("[data-sort-id]")?.dataset.sortId;
    if (!id) return;
    begin(id, e.clientX, e.clientY, false);
    const move = (ev: PointerEvent) => follow(ev.clientX, ev.clientY, false);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      drop();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <>
      <Carousel
        label={label}
        dragging={drag !== null}
        trackRef={(el) => {
          track.current = el;
        }}
        trackProps={{
          onPointerDown,
          // A dragged card must not open its account when let go, nor be dragged by the browser.
          onClickCapture: (e) => {
            if (!justDragged.current) return;
            e.preventDefault();
            e.stopPropagation();
          },
          onDragStart: (e) => e.preventDefault(),
        }}
      >
        {shown.map((id, i) => {
          const lifted = drag?.id === id;
          const shift = drag && !lifted ? offset(drag, i) : 0;
          return (
            <li
              key={id}
              data-sort-id={id}
              ref={(el) => {
                if (el) slides.current.set(id, el);
                else slides.current.delete(id);
              }}
              className={`relative select-none [-webkit-touch-callout:none] ${slideClass} ${lifted ? "z-10" : ""}`}
              style={
                lifted
                  ? { transform: `translateX(${drag.dx}px) scale(1.04)`, transition: "transform 0.15s ease-out", cursor: "grabbing" }
                  : drag
                    ? { transform: `translateX(${shift}px)`, transition: `transform 0.25s ${MOVE}` }
                    : undefined
              }
            >
              <div className={`${entered ? "" : "rise"} h-full ${lifted ? "drop-shadow-[0_24px_30px_rgba(30,20,90,0.35)]" : ""}`} style={{ "--i": i } as React.CSSProperties}>
                {byId.get(id)}
              </div>
            </li>
          );
        })}
        {tail}
      </Carousel>
      {problem && (
        <p role="alert" className="alert mt-2">
          {problem}
        </p>
      )}
    </>
  );
}

/** How far a card that is not lifted moves aside to make room for the one being dragged. */
function offset(d: Drag, i: number) {
  if (i === d.from) return 0;
  if (d.from < d.target && i > d.from && i <= d.target) return d.lefts[i - 1] - d.lefts[i];
  if (d.target < d.from && i >= d.target && i < d.from) return d.lefts[i + 1] - d.lefts[i];
  return 0;
}
