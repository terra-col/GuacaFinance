"use client";

import { useEffect, useState } from "react";

/**
 * What is already paid (or received), folded under one line at the end of the list. Open or
 * closed is remembered on this device, per list.
 */
export function PaidGroup({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
  const key = `guaca-plegado-${id}`;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this device after hydration
      if (localStorage.getItem(key) === "1") setOpen(false);
    } catch {
      /* storage unavailable: stays open */
    }
  }, [key]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(key, next ? "0" : "1");
    } catch {
      /* not remembered, still toggles */
    }
  }

  if (count === 0) return null;
  return (
    <div className="mt-1 border-t border-line">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 py-3 text-sm font-semibold text-ink-2 hover:text-ink">
        <span>
          {label} <span className="num font-medium text-ink-3">· {count}</span>
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-ink-3">
          {open ? "Ocultar" : "Mostrar"}
          <svg viewBox="0 0 24 24" className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <ul className="divide-y divide-line overflow-hidden" inert={!open}>
          {children}
        </ul>
      </div>
    </div>
  );
}
