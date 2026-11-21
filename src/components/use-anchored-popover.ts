"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// A mouse or trackpad: there the browser's own pickers cannot be styled, so Guaca draws its own.
// Phones keep their native ones (wheels and sheets that already speak the phone's language).
const finePointerQuery = (onChange: () => void) => {
  const query = window.matchMedia("(pointer: fine)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
export const useFinePointer = () => useSyncExternalStore(finePointerQuery, () => window.matchMedia("(pointer: fine)").matches, () => false);

/**
 * A popup anchored to a field (date picker, account picker, category list). It goes to the
 * browser's top layer (popover API), above everything and clipped by nothing: not a card, not a
 * sliding panel, not a modal dialog. It is placed inside the open <dialog> when the field is in
 * one (outside it, a modal dialog makes everything inert), else on <body>, and positioned on the
 * screen on the side with room, never past an edge. Esc closes only the popup.
 */
export function useAnchoredPopover({ open, onClose, width = 304 }: { open: boolean; onClose: () => void; width?: number | "anchor" }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [place, setPlace] = useState<React.CSSProperties>({});
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  // The latest onClose, without making the listeners below start over on every render.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  const popRef = (el: HTMLDivElement | null) => {
    pop.current = el;
    if (el && typeof el.showPopover === "function" && !el.matches(":popover-open")) el.showPopover();
  };

  useEffect(() => {
    if (!open) return;
    setHost(box.current?.closest<HTMLElement>("dialog[open]") ?? document.body);
    const position = () => {
      const rect = box.current?.getBoundingClientRect();
      if (!rect) return;
      const height = pop.current?.offsetHeight || 320;
      const w = Math.min(width === "anchor" ? Math.max(rect.width, 220) : width, window.innerWidth - 16);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - w - 8);
      const below = window.innerHeight - rect.bottom;
      const goBelow = below >= height + 16 || below >= rect.top;
      const wanted = goBelow ? rect.bottom + 6 : rect.top - height - 6;
      const top = Math.min(Math.max(8, wanted), window.innerHeight - height - 8);
      setPlace({ left, width: w, top });
    };
    position();
    // Once drawn, its real height decides the side.
    const frame = requestAnimationFrame(position);
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!box.current?.contains(target) && !pop.current?.contains(target)) close.current();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Close only the popup, not the dialog it may be in.
      e.preventDefault();
      e.stopPropagation();
      close.current();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    // Follows the field when the page or a scrolling panel moves.
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [open, width]);

  return { box, popRef, host, place };
}
