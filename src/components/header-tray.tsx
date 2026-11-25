"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** The tour opens and closes the tray while it points at what is inside (detail: true or false). */
export const TRAY_EVENT = "guaca:tray";

/**
 * The header's options (Asesor, Avisos, the eye, the theme, Más ajustes) folded behind one button.
 * A tap unfolds them to its left, one after the other; a tap outside, Esc or going to another
 * screen folds them again. With something waiting in Avisos, the folded button carries a red dot.
 */
export function HeaderTray({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onTour = (e: Event) => setOpen(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(TRAY_EVENT, onTour);
    return () => window.removeEventListener(TRAY_EVENT, onTour);
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // The tour's card is outside too, but it is the one keeping the tray open.
      if (root.current?.contains(target) || target?.closest?.('[aria-modal="true"]')) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={root} className="tray relative flex items-center" data-open={open ? "" : undefined}>
      <div id="header-tray" className="tray-items" aria-hidden={!open}>
        <div className="tray-row">{children}</div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="header-tray"
        aria-label={open ? "Cerrar opciones" : "Opciones"}
        title={open ? "Cerrar opciones" : "Opciones"}
        data-tour="menu"
        className="tray-toggle liquid relative flex size-10 items-center justify-center rounded-xl"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <path className="tray-icon-open" d="M4 7h10m4 0h2M4 17h2m4 0h10M16 5v4M8 15v4" />
          <path className="tray-icon-close" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
