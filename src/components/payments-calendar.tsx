"use client";

import { useState } from "react";
import type { CalendarEntry } from "@/lib/calendar";
import { formatCOP, formatCompact, pendingFirst, type ChecklistItem } from "@/lib/finance";
import { ChecklistRow } from "./checklist-row";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const WEEKDAY_FULL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const longDay = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAY_FULL[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
};

/**
 * The legend, by state. An open ring is something still to happen (to pay, or to come in); a
 * filled dot is settled; coral is late. A goal's saving counts as a payment like any other.
 */
const LEGEND = [
  { key: "pending", label: "Pago pendiente", color: "var(--brand)", hollow: true },
  { key: "paid", label: "Pagado", color: "var(--ink-3)", hollow: false },
  { key: "overdue", label: "Vencido", color: "var(--debt)", hollow: false },
  { key: "income", label: "Ingreso", color: "var(--savings)", hollow: true },
] as const;

function tone(entry: CalendarEntry): { color: string; hollow: boolean } {
  const settled = entry.status === "paid" || entry.status === "skipped";
  if (entry.type === "income") return { color: "var(--savings)", hollow: !settled };
  if (settled) return { color: "var(--ink-3)", hollow: false };
  if (entry.status === "overdue") return { color: "var(--debt)", hollow: false };
  return { color: "var(--brand)", hollow: true };
}

function Dot({ color, hollow, onAccent = false }: { color: string; hollow: boolean; onAccent?: boolean }) {
  const c = onAccent ? "#fff" : color;
  return (
    <span
      aria-hidden="true"
      className="size-1.5 shrink-0 rounded-full sm:size-2.5"
      style={hollow ? { boxShadow: `inset 0 0 0 1.75px ${c}` } : { background: c, opacity: onAccent ? 0.8 : 1 }}
    />
  );
}

/**
 * The month's payments and incomes on a calendar. Tapping a day lists what falls on it, with
 * the same rows as the list (tick, undo, skip). Below, what is still coming this month.
 */
export function PaymentsCalendar({
  weeks,
  byDate,
  rows,
  undated,
  today,
  month,
  editable,
  spendable,
  savings,
}: {
  weeks: (string | null)[][];
  byDate: Record<string, CalendarEntry[]>;
  /** The month's checklist rows (bills, debts, goals, incomes), the same the list shows. */
  rows: ChecklistItem[];
  undated: CalendarEntry[];
  today: string;
  month: string;
  /** Only the current month can be ticked; past ones are a record, future ones have not come. */
  editable: boolean;
  spendable: { id: string; name: string }[];
  savings: { id: string; name: string }[];
}) {
  const days = Object.keys(byDate).sort();
  // Start on today in the current month, otherwise on the first day with something.
  const [selected, setSelected] = useState<string | null>(today.startsWith(month) ? today : (days[0] ?? null));
  const from = today.startsWith(month) ? today : `${month}-01`;
  const upcoming = days.filter((d) => d >= from).flatMap((d) => byDate[d].filter((e) => e.status === "pending" || e.status === "overdue"));
  const overdue = days.filter((d) => d < from).flatMap((d) => byDate[d].filter((e) => e.status === "overdue"));
  const chosen = selected ? rows.filter((r) => r.due === selected).sort(pendingFirst) : [];

  return (
    <>
      <section className="card flex flex-col gap-3" aria-label="Calendario de pagos">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink-3" aria-hidden="true">
          {WEEKDAYS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid">
          {weeks.flat().map((date, i) => {
            if (!date) return <span key={i} aria-hidden="true" />;
            const entries = byDate[date] ?? [];
            const isToday = date === today;
            const isSelected = date === selected;
            const outgoing = entries.filter((e) => e.type !== "income" && (e.status === "pending" || e.status === "overdue")).reduce((sum, e) => sum + (e.amount ?? 0), 0);
            return (
              <button
                key={date}
                type="button"
                role="gridcell"
                aria-selected={isSelected}
                aria-label={`${longDay(date)}: ${entries.length ? `${entries.length} ${entries.length === 1 ? "movimiento" : "movimientos"}` : "nada"}`}
                onClick={() => setSelected(date)}
                className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border text-sm transition-[background,border-color,transform] duration-150 active:scale-90 sm:aspect-auto sm:h-20 sm:gap-1.5 ${
                  isSelected
                    ? "border-transparent bg-brand text-white shadow-[0_8px_20px_-10px_var(--brand)]"
                    : `border-line hover:border-brand/60 ${entries.length ? "bg-surface/70 font-semibold" : "text-ink-3"}`
                } ${isToday && !isSelected ? "border-brand ring-1 ring-brand ring-inset" : ""}`}
              >
                <span className="num leading-none sm:text-base">{Number(date.slice(8))}</span>
                {entries.length > 0 && (
                  <span className="flex items-center gap-0.5 sm:gap-1">
                    {entries.slice(0, 3).map((e) => (
                      <Dot key={`${e.type}-${e.id}`} {...tone(e)} onAccent={isSelected} />
                    ))}
                    {entries.length > 3 && <span className="text-[9px] leading-none sm:text-xs">+{entries.length - 3}</span>}
                  </span>
                )}
                {/* On wider screens there is room for what is still to pay that day. */}
                {outgoing > 0 && (
                  <span className={`num hidden text-[11px] font-medium leading-none sm:block ${isSelected ? "text-white/85" : "text-ink-3"}`}>{formatCompact(outgoing)}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
          {LEGEND.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={l.hollow ? { boxShadow: `inset 0 0 0 1.75px ${l.color}` } : { background: l.color }}
              />
              {l.label}
            </span>
          ))}
        </div>
      </section>

      {selected && (
        <section key={selected} className="card rise" aria-live="polite">
          <h2 className="display text-xl first-letter:uppercase">{longDay(selected)}</h2>
          {chosen.length ? (
            <ul className="mt-1 divide-y divide-line">
              {chosen.map((item) => (
                <ChecklistRow
                  key={`${item.type}-${item.id}`}
                  item={item}
                  month={month}
                  today={today}
                  editable={editable}
                  accounts={item.type === "bill" ? spendable : savings}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-3">Nada programado este día.</p>
          )}
          {!editable && chosen.length > 0 && (
            <p className="mt-2 text-xs text-ink-3">{month > today.slice(0, 7) ? "Podrás marcarlos cuando llegue el mes." : "Mes cerrado: así quedó."}</p>
          )}
        </section>
      )}

      {(upcoming.length > 0 || overdue.length > 0) && (
        <section className="card" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className="display text-xl">
            {today.startsWith(month) ? "Lo que viene este mes" : "Lo que tiene este mes"}
          </h2>
          {overdue.length > 0 && (
            <p className="mt-1 text-sm text-ink-2">
              Tienes {overdue.length} {overdue.length === 1 ? "pendiente atrasado" : "pendientes atrasados"} de días anteriores.
            </p>
          )}
          <ul className="mt-1 divide-y divide-line">
            {[...overdue, ...upcoming].map((e) => {
              const t = tone(e);
              return (
                <li key={`${e.type}-${e.id}`}>
                  <button type="button" className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm transition-colors hover:bg-line/40" onClick={() => setSelected(e.date)}>
                    <span className="num w-12 shrink-0 rounded-lg bg-line/50 py-1 text-center text-xs font-semibold">
                      {Number(e.date.slice(8))} {MONTHS[Number(e.date.slice(5, 7)) - 1].slice(0, 3)}
                    </span>
                    <Dot {...t} />
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    <span className={`num shrink-0 font-semibold ${e.type === "income" ? "text-[var(--savings)]" : ""}`}>
                      {e.amount !== null ? `${e.type === "income" ? "+" : ""}${formatCOP(e.amount)}` : "Variable"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {undated.length > 0 && (
        <p className="text-sm text-ink-3">
          Sin día de pago registrado: {undated.map((e) => e.name).join(", ")}. Agrégalo en Datos de la cuenta para verla en el calendario.
        </p>
      )}
    </>
  );
}
