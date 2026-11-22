"use client";

import { useState } from "react";
import { formatDate } from "@/lib/finance";
import { EVERY, QUINCENAS, UNITS, needsDate, nextDates, periodOf, periodToEvery, quincenaFrom, quincenaLabel, unitName, type Every, type Unit } from "@/lib/recurrence";
import { DateField } from "./date-field";
import { SelectField } from "./pickers";
import { useCustomPeriodsReady, useIncomeRecurrenceReady, useRecurrenceReady } from "./recurrence-ready";

export interface EveryValue {
  every: Every;
  day: number | "";
  start: string;
}

const EXACT_14 = "exact";

/**
 * «Cada cuánto» and what goes with it. The unit (day, week, month, year) and how many of them;
 * two weeks are a quincena, of fixed days (15 y 30) or every 14 days exactly. Controlled, so a
 * goal's live preview follows it. Before migration 0022 it is the fixed list; before 0017, only the day.
 */
export function EveryFields({
  value,
  onChange,
  today,
  names,
  editing,
  what,
}: {
  value: EveryValue;
  onChange: (value: EveryValue) => void;
  today: string;
  names: { every: string; day: string; start: string };
  editing: boolean;
  what: "pago" | "abono" | "ingreso";
}) {
  const general = useRecurrenceReady();
  const forIncomes = useIncomeRecurrenceReady();
  const custom = useCustomPeriodsReady();
  const ready = what === "ingreso" ? forIncomes : general;
  const { every, day, start } = value;
  const period = periodOf(every);
  // What is being typed, which may be empty for a moment; null follows the value.
  const [typed, setTyped] = useState<string | null>(null);

  function pick(next: Every) {
    let nextDay = day;
    if (next === "biweekly") nextDay = day === "" ? 15 : every === next ? day : quincenaFrom(day);
    else if (next === "monthly" && day === "" && start) nextDay = Number(start.slice(8));
    onChange({ every: next, day: nextDay, start: needsDate(next) && !start ? today : start });
  }

  function pickUnit(unit: Unit) {
    setTyped(null);
    pick(periodToEvery(unit, unit === period.unit ? period.count : 1));
  }

  function pickCount(count: number) {
    const max = UNITS.find((u) => u.unit === period.unit)!.max;
    if (Number.isInteger(count) && count >= 1 && count <= max) pick(periodToEvery(period.unit, count));
  }

  function pickQuincena(choice: string) {
    if (choice === EXACT_14) onChange({ every: "w2", day, start: every === "w2" && start ? start : today });
    else onChange({ every: "biweekly", day: Number(choice), start });
  }

  const upcoming =
    needsDate(every) && /^\d{4}-\d{2}-\d{2}$/.test(start) ? nextDates({ every, day: Number(start.slice(8)), start }, start > today ? start : today, 2) : [];
  const fortnight = period.unit === "w" && period.count === 2;
  const step = (by: number) => {
    setTyped(null);
    pickCount(period.count + by);
  };

  return (
    <>
      {ready && custom && (
        <div className="field sm:col-span-2">
          <span>Se repite por</span>
          <input type="hidden" name={names.every} value={every} />
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Se repite por">
            {UNITS.map((u) => (
              <button key={u.unit} type="button" aria-pressed={period.unit === u.unit} data-unit={u.unit} className="chip h-11 px-1" onClick={() => pickUnit(u.unit)}>
                {u.label}
              </button>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="shrink-0">Cada</span>
            <button type="button" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-lg" aria-label="Menos" onClick={() => step(-1)}>
              −
            </button>
            <span className="w-16">
              <input
                className="input num text-center"
                data-count
                type="number"
                inputMode="numeric"
                min={1}
                max={UNITS.find((u) => u.unit === period.unit)!.max}
                aria-label="Cantidad"
                value={typed ?? period.count}
                onChange={(e) => {
                  setTyped(e.target.value);
                  pickCount(Number(e.target.value));
                }}
                required
              />
            </span>
            <button type="button" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-lg" aria-label="Más" onClick={() => step(1)}>
              +
            </button>
            <span className="min-w-0 truncate text-ink">{unitName(period.unit, period.count)}</span>
          </div>
        </div>
      )}
      {ready && !custom && (
        <label className="field">
          Cada cuánto
          <SelectField name={names.every} options={EVERY.map((e) => ({ value: e.value, label: e.label }))} value={every} onChange={(v) => pick(v as Every)} />
        </label>
      )}
      {custom && fortnight && (
        <label className="field" key="fortnight">
          Qué días
          <SelectField
            name="fortnight"
            options={[...QUINCENAS.map((d) => ({ value: String(d), label: quincenaLabel(d) })), { value: EXACT_14, label: "Cada 14 días exactos" }]}
            value={every === "biweekly" ? String(day) : EXACT_14}
            onChange={pickQuincena}
          />
          {every === "biweekly" && <input type="hidden" name={names.day} value={day} />}
        </label>
      )}
      {every === "monthly" ? (
        <label className="field" key="day">
          {what === "pago" ? "Día de pago" : what === "ingreso" ? "Día en que llega" : "Día del mes"}
          <input
            className="input num"
            type="number"
            name={names.day}
            min={1}
            max={31}
            value={day}
            onChange={(e) => onChange({ ...value, day: e.target.value === "" ? "" : Number(e.target.value) })}
            required
          />
        </label>
      ) : every === "biweekly" ? (
        !custom && (
          <label className="field" key="quincena">
            Qué días
            <SelectField
              name={names.day}
              options={QUINCENAS.map((d) => ({ value: String(d), label: quincenaLabel(d) }))}
              value={String(day)}
              onChange={(d) => onChange({ ...value, day: Number(d) })}
              required
            />
          </label>
        )
      ) : (
        <label className="field" key="start">
          {period.unit === "d" ? "Desde" : editing ? `Primer ${what}` : `Próximo ${what}`}
          <DateField name={names.start} value={start} onChange={(date) => onChange({ ...value, start: date })} required />
          {upcoming.length === 2 && (
            <span className="text-xs font-normal text-ink-3">
              Toca el {formatDate(upcoming[0])} y luego el {formatDate(upcoming[1])}.
            </span>
          )}
        </label>
      )}
    </>
  );
}
