"use client";

import { useState } from "react";
import { formatCOP, type CategoryTotal } from "@/lib/finance";

const MAX = 7; // the categorical slots; the rest fold into «Otras»
const R = 46;
const C = 2 * Math.PI * R;
const GAP = 1.6; // the surface gap between slices, in path units

/**
 * Where the month's spending went: a donut of categories (the 7 biggest, the rest in «Otras»)
 * with the total in the middle. Hovering or tapping a slice, or its legend row, shows its amount
 * and share in the middle. The legend always names every slice with its share and amount, so
 * nothing depends on telling colours apart.
 */
export function SpendingDonut({ totals }: { totals: CategoryTotal[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = totals.reduce((sum, t) => sum + t.amount, 0);
  if (total <= 0) return <p className="mt-3 text-sm text-ink-3">Todavía no hay gastos este mes.</p>;

  const head = totals.slice(0, totals.length > MAX ? MAX - 1 : MAX);
  const rest = totals.slice(head.length);
  const slices = [
    ...head.map((t, i) => ({ ...t, color: `var(--cat-${i + 1})` })),
    ...(rest.length ? [{ category: `Otras (${rest.length})`, amount: rest.reduce((s, t) => s + t.amount, 0), color: "var(--cat-other)" }] : []),
  ];
  let start = 0;
  const arcs = slices.map((s) => {
    const len = (s.amount / total) * C;
    const arc = { ...s, len, start };
    start += len;
    return arc;
  });
  const shown = active !== null ? slices[active] : null;
  const pct = (amount: number) => `${Math.round((amount / total) * 100)}%`;

  return (
    <div className="mt-3 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative size-48 shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={`Gastos del mes por categoría, total ${formatCOP(total)}`}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line)" strokeWidth="16" opacity="0.4" />
          {arcs.map((a, i) => (
            <circle
              key={a.category}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={active === i ? 19 : 16}
              strokeDasharray={`${Math.max(0.01, a.len - (arcs.length > 1 ? GAP : 0))} ${C}`}
              strokeDashoffset={-a.start}
              className="donut-slice cursor-pointer"
              style={{ opacity: active === null || active === i ? 1 : 0.35, "--i": i } as React.CSSProperties}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
            >
              <title>{`${a.category}: ${formatCOP(a.amount)} (${pct(a.amount)})`}</title>
            </circle>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center" aria-live="polite">
          <p className="truncate text-xs font-medium text-ink-3">{shown ? shown.category : "Gastado este mes"}</p>
          <p className="display num text-xl leading-tight">{formatCOP(shown ? shown.amount : total)}</p>
          {shown && <p className="text-xs font-semibold text-ink-2">{pct(shown.amount)} del total</p>}
        </div>
      </div>

      <ul className="grid w-full gap-1 text-sm">
        {slices.map((s, i) => (
          <li
            key={s.category}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${active === i ? "bg-brand/8" : ""}`}
          >
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.category}</span>
            <span className="num w-10 shrink-0 text-right text-ink-3">{pct(s.amount)}</span>
            <span className="num w-28 shrink-0 text-right font-semibold">{formatCOP(s.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
