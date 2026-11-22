"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A horizontal row that scrolls sideways and snaps card by card. On wide
 * screens two arrow buttons appear when there is more to see.
 */
export function Carousel({
  label,
  children,
  trackRef,
  trackProps,
  dragging = false,
}: {
  label: string;
  children: React.ReactNode;
  /** For a sortable carousel: the row itself, and its pointer and touch handlers. */
  trackRef?: (el: HTMLUListElement | null) => void;
  trackProps?: React.HTMLAttributes<HTMLUListElement>;
  /** While a card is being moved: no snapping, so the row can follow the finger. */
  dragging?: boolean;
}) {
  const track = useRef<HTMLUListElement | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () =>
      setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    // min-w-0: inside a flex column, the row of slides must not widen its container.
    // A scrolling row clips what spills out of it: the extra padding (given back with negative
    // margins) leaves room for the cards' shadow and their lift on hover.
    <div className="relative min-w-0">
      <ul
        {...trackProps}
        ref={(el) => {
          track.current = el;
          trackRef?.(el);
        }}
        aria-label={label}
        // Where more cards wait, the edge fades instead of cutting the next card and its shadow.
        style={{ maskImage: fade(edges), WebkitMaskImage: fade(edges) }}
        className={`-mx-4 -mb-6 -mt-2 flex ${dragging ? "" : "snap-x snap-mandatory"} gap-4 overflow-x-auto scroll-px-4 px-4 pb-10 pt-3 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden`}
      >
        {children}
      </ul>
      {!edges.start && (
        <button type="button" onClick={() => go(-1)} aria-label="Ver anteriores" className="liquid absolute -left-3 top-[62%] hidden size-11 -translate-y-1/2 items-center justify-center rounded-full text-xl sm:flex">
          ‹
        </button>
      )}
      {!edges.end && (
        <button type="button" onClick={() => go(1)} aria-label="Ver siguientes" className="liquid absolute -right-3 top-[62%] hidden size-11 -translate-y-1/2 items-center justify-center rounded-full text-xl sm:flex">
          ›
        </button>
      )}
    </div>
  );
}

const EDGE = "24px";
const fade = ({ start, end }: { start: boolean; end: boolean }) =>
  start && end ? undefined : `linear-gradient(to right, ${start ? "#000" : "transparent"}, #000 ${EDGE}, #000 calc(100% - ${EDGE}), ${end ? "#000" : "transparent"})`;

/** One slide: about one card wide on phones, a fixed width on larger screens. */
export function Slide({ children, index = 0 }: { children: React.ReactNode; index?: number }) {
  return (
    <li className="rise w-[82%] shrink-0 snap-start sm:w-80" style={{ "--i": index } as React.CSSProperties}>
      {children}
    </li>
  );
}
