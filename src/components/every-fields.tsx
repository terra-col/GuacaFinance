"use client";

import { formatDate } from "@/lib/finance";
import { EVERY, QUINCENAS, needsDate, nextDates, quincenaFrom, quincenaLabel, type Every } from "@/lib/recurrence";
import { DateField } from "./date-field";
import { SelectField } from "./pickers";
import { useIncomeRecurrenceReady, useRecurrenceReady } from "./recurrence-ready";

export interface EveryValue {
  every: Every;
  day: number | "";
  start: string;
}

/**
 * «Cada cuánto» and what goes with it: the day of the month, the two days of the quincena, or a
 * date. Controlled, so a goal's live preview follows it. Before migration 0017 it is only the day.
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
  const ready = what === "ingreso" ? forIncomes : general;
  const { every, day, start } = value;

  function pick(next: Every) {
    let nextDay = day;
    if (next === "biweekly") nextDay = day === "" ? 15 : quincenaFrom(day);
    else if (next === "monthly" && day === "" && start) nextDay = Number(start.slice(8));
    onChange({ every: next, day: nextDay, start: needsDate(next) && !start ? today : start });
  }

  const upcoming =
    needsDate(every) && /^\d{4}-\d{2}-\d{2}$/.test(start) ? nextDates({ every, day: Number(start.slice(8)), start }, start > today ? start : today, 2) : [];

  return (
    <>
      {ready && (
        <label className="field">
          Cada cuánto
          <SelectField name={names.every} options={EVERY.map((e) => ({ value: e.value, label: e.label }))} value={every} onChange={(v) => pick(v as Every)} />
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
      ) : (
        <label className="field" key="start">
          {every === "daily" || every === "every2" ? "Desde" : editing ? `Primer ${what}` : `Próximo ${what}`}
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
