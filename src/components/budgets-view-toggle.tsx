"use client";

import { useState } from "react";

/**
 * Presupuestos as bars (each budget against its cap, the default) or as a chart (where the
 * month's spending went). Small chips, so it never looks like the section switch above.
 */
export function BudgetsViewToggle({ bars, chart }: { bars: React.ReactNode; chart: React.ReactNode }) {
  const [view, setView] = useState<"bars" | "chart">("bars");
  const items = [
    ["bars", "Barras", "M5 20V11M12 20V4M19 20v-6"],
    ["chart", "Gráfica", "M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z"],
  ] as const;
  return (
    <>
      <div className="mt-2">
        <div className="view-chips" role="tablist" aria-label="Cómo ver los presupuestos">
          {items.map(([value, label, icon]) => (
            <button key={value} type="button" role="tab" aria-selected={view === value} className="view-chip" onClick={() => setView(value)}>
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={icon} />
              </svg>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div key={view} className="rise">
        {view === "bars" ? bars : chart}
      </div>
    </>
  );
}
