"use client";

import { useState } from "react";

/**
 * Presupuestos as bars (each budget against its cap, the default) or as a chart (where the
 * month's spending went). The same segmented pill as Lista | Calendario.
 */
export function BudgetsViewToggle({ bars, chart }: { bars: React.ReactNode; chart: React.ReactNode }) {
  const [view, setView] = useState<"bars" | "chart">("bars");
  const items = [
    ["bars", "Barras"],
    ["chart", "Gráfica"],
  ] as const;
  return (
    <>
      <div className="mt-3 flex justify-center">
        <div className="segmented" role="tablist" aria-label="Cómo ver los presupuestos" style={{ "--n": 2, "--i": view === "bars" ? 0 : 1 } as React.CSSProperties}>
          <span aria-hidden="true" className="segmented-thumb" />
          {items.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={view === value} data-on={view === value ? "" : undefined} className="segment" onClick={() => setView(value)}>
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
