"use client";

import Link from "next/link";
import { useState } from "react";

export type PaymentsView = "lista" | "calendario";
type ViewParts = { top: React.ReactNode; under: React.ReactNode; body: React.ReactNode };

/**
 * Lista | Calendario in Pagos. When both views can show the same month, both come in the same page and
 * switching is instant: only what is visible changes, and the address follows along (without a new
 * request). When the other view needs another month (a calendar a year ahead), its tab is a link.
 */
export function PaymentsViews({
  view: initial,
  hrefs,
  list,
  calendar,
}: {
  view: PaymentsView;
  hrefs: Record<PaymentsView, string>;
  list?: ViewParts;
  calendar?: ViewParts;
}) {
  const [view, setView] = useState(initial);
  // A real navigation (another month, back and forward) brings its own view.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setView(initial);
  }
  const parts: Record<PaymentsView, ViewParts | undefined> = { lista: list, calendario: calendar };
  // While the other view is on its way (a link), the current one stays on screen.
  const shown: PaymentsView = parts[view] ? view : initial;
  const tabs: { key: PaymentsView; label: string }[] = [
    { key: "lista", label: "Lista" },
    { key: "calendario", label: "Calendario" },
  ];

  function choose(e: React.MouseEvent, key: PaymentsView) {
    setView(key);
    if (!parts[key] || e.metaKey || e.ctrlKey || e.shiftKey) return; // a normal link
    e.preventDefault();
    window.history.replaceState(null, "", hrefs[key]);
  }

  const slot = (key: PaymentsView, part: keyof ViewParts) =>
    parts[key] && (
      <div key={key} className={shown === key ? "contents" : "hidden"}>
        {parts[key]![part]}
      </div>
    );

  return (
    <>
      <div className="pt-2">
        {slot("lista", "top")}
        {slot("calendario", "top")}
        <div className="mt-4 flex flex-col items-center gap-2">
          <nav className="segmented" aria-label="Cómo ver los pagos" style={{ "--n": 2, "--i": view === "lista" ? 0 : 1 } as React.CSSProperties}>
            <span aria-hidden="true" className="segmented-thumb" />
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={hrefs[t.key]}
                scroll={false}
                prefetch={parts[t.key] ? false : undefined}
                aria-current={shown === t.key ? "page" : undefined}
                data-on={view === t.key ? "" : undefined}
                onClick={(e) => choose(e, t.key)}
                className="segment"
              >
                {t.label}
              </Link>
            ))}
          </nav>
          {slot("lista", "under")}
          {slot("calendario", "under")}
        </div>
      </div>
      {slot("lista", "body")}
      {slot("calendario", "body")}
    </>
  );
}
