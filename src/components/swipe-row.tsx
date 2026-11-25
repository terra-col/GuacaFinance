"use client";

import { useRef, useState } from "react";

const ACTIONS_WIDTH = 152; // two 76 px buttons behind a swiped row

/**
 * A list row that slides left under a finger to reveal its actions, like
 * Mail on iPhone. Vertical scrolling keeps working: the swipe only starts
 * once the finger moves more sideways than up or down. The same in
 * Movimientos and in a group's or a person's expenses.
 */
export function SwipeRow({
  open,
  onOpen,
  onClose,
  actions,
  className = "",
  rowClassName,
  style,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  actions: React.ReactNode;
  /** The list item's own classes, besides what the swipe needs. */
  className?: string;
  /** The sliding row's layout. */
  rowClassName: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; axis: "x" | "y" | null } | null>(null);
  const offset = drag ?? (open ? -ACTIONS_WIDTH : 0);

  function down(e: React.PointerEvent) {
    if (e.pointerType !== "touch") return;
    start.current = { x: e.clientX, y: e.clientY, base: open ? -ACTIONS_WIDTH : 0, axis: null };
  }
  function move(e: React.PointerEvent) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (s.axis === "x") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (s.axis !== "x") return;
    // Rubber band past the actions, none to the right.
    const raw = s.base + dx;
    setDrag(raw < -ACTIONS_WIDTH ? -ACTIONS_WIDTH + (raw + ACTIONS_WIDTH) * 0.25 : Math.min(0, raw));
  }
  function up() {
    const s = start.current;
    start.current = null;
    if (!s || s.axis !== "x" || drag === null) return setDrag(null);
    if (drag < -ACTIONS_WIDTH / 2.5) onOpen();
    else onClose();
    setDrag(null);
  }

  const reveal = Math.min(1, -offset / 60);
  return (
    <li className={`relative overflow-hidden ${className}`} style={style}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_WIDTH, opacity: reveal }} aria-hidden={!open} inert={!open}>
        {actions}
      </div>
      <div
        className={`relative touch-pan-y ${rowClassName} ${offset < 0 ? "bg-surface shadow-lg" : ""} ${drag === null ? "transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1.2)]" : ""}`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          // A tap on a swiped row closes it instead of acting.
          if (open) {
            e.stopPropagation();
            e.preventDefault();
            onClose();
          }
        }}
      >
        {children}
      </div>
    </li>
  );
}
