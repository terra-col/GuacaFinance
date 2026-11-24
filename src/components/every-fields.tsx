"use client";

import { useState } from "react";
import { formatDate } from "@/lib/finance";
import {
  EVERY,
  QUINCENAS,
  UNITS,
  cadenceText,
  needsDate,
  nextDates,
  periodOf,
  periodToEvery,
  quincenaFrom,
  quincenaLabel,
  unitName,
  type Every,
  type Unit,
} from "@/lib/recurrence";
import { DateField } from "./date-field";
import { SelectField } from "./pickers";
import { useCustomPeriodsReady, useIncomeRecurrenceReady, useRecurrenceReady } from "./recurrence-ready";

export interface EveryValue {
  every: Every;
  day: number | "";
  start: string;
}

const EXACT_14 = "exact";

/** The usual answers to «¿cada cuánto?»; anything else is «Otro». */
const PRESETS: { key: string; label: string; every: Every }[] = [
  { key: "month", label: "Mensual", every: "monthly" },
  { key: "fortnight", label: "Quincenal", every: "biweekly" },
  { key: "week", label: "Semanal", every: "w1" },
  { key: "year", label: "Anual", every: "y1" },
];
const presetOf = (every: Every) => (every === "monthly" ? "month" : every === "biweekly" || every === "w2" ? "fortnight" : every === "w1" ? "week" : every === "y1" ? "year" : "other");

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white" aria-hidden="true">
      {n}
    </span>
    {children}
  </span>
);

/**
 * When something repeats, in two steps that are never mixed up: how often (① Cada cuánto) and on
 * which day (② Qué día), with a sentence that says how it ended up. Controlled, so a goal's live
 * preview follows it. Before migration 0022 «Otro» is the fixed list; before 0017, only the day.
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
  const [other, setOther] = useState(presetOf(every) === "other");
  const chosen = other ? "other" : presetOf(every);
  // What is being typed, which may be empty for a moment; null follows the value.
  const [typed, setTyped] = useState<string | null>(null);
  const verb = what === "ingreso" ? "Llega" : what === "abono" ? "Se abona" : "Se paga";

  function pick(next: Every) {
    let nextDay = day;
    if (next === "biweekly") nextDay = day === "" ? 15 : every === next ? day : quincenaFrom(day);
    else if (next === "monthly" && day === "" && start) nextDay = Number(start.slice(8));
    onChange({ every: next, day: nextDay, start: needsDate(next) && !start ? today : start });
  }

  function pickPreset(key: string) {
    setTyped(null);
    if (key === "other") return setOther(true);
    setOther(false);
    const preset = PRESETS.find((p) => p.key === key)!;
    // Without migration 0022 there are no weeks nor years.
    if (!custom && (preset.every === "w1" || preset.every === "y1")) return setOther(true);
    pick(preset.every);
  }

  function pickCount(unit: Unit, count: number) {
    const max = UNITS.find((u) => u.unit === unit)!.max;
    if (Number.isInteger(count) && count >= 1 && count <= max) pick(periodToEvery(unit, count));
  }

  const dated = needsDate(every) && /^\d{4}-\d{2}-\d{2}$/.test(start);
  const upcoming = dated ? nextDates({ every, day: Number(start.slice(8)), start }, start > today ? start : today, 2) : [];
  const fortnight = every === "biweekly" || every === "w2";
  const summary =
    every === "monthly" && day !== ""
      ? `${verb} el ${day === 31 ? "último día" : day} de cada mes`
      : every === "biweekly" && day !== ""
        ? `${verb} cada quincena: el ${quincenaLabel(Number(day))}`
        : dated
          ? `${verb} ${cadenceText({ every, day: Number(start.slice(8)), start })}`
          : null;

  const presets = ready && (
    <div className="flex flex-col gap-2 sm:col-span-2" data-every>
      <Step n={1}>¿Cada cuánto se repite?</Step>
      <input type="hidden" name={names.every} value={every} />
      <div className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-5" role="group" aria-label="Cada cuánto se repite">
        {[...PRESETS, { key: "other", label: "Otro" }].map((p) => (
          <button key={p.key} type="button" className="chip h-11 px-2" aria-pressed={chosen === p.key} data-preset={p.key} onClick={() => pickPreset(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      {chosen === "other" &&
        (custom ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-brand/6 p-3 text-sm">
            <span>Cada</span>
            <span className="w-16">
              <input
                className="input num text-center"
                data-count
                type="number"
                inputMode="numeric"
                min={1}
                max={UNITS.find((u) => u.unit === period.unit)!.max}
                aria-label="Cuántos"
                value={typed ?? period.count}
                onChange={(e) => {
                  setTyped(e.target.value);
                  pickCount(period.unit, Number(e.target.value));
                }}
                required
              />
            </span>
            <span className="flex gap-1" role="group" aria-label="Días, semanas, meses o años">
              {UNITS.map((u) => (
                <button
                  key={u.unit}
                  type="button"
                  className="chip h-9 px-2.5 text-xs"
                  aria-pressed={period.unit === u.unit}
                  data-unit={u.unit}
                  onClick={() => {
                    setTyped(null);
                    pickCount(u.unit, u.unit === period.unit ? period.count : 1);
                  }}
                >
                  {unitName(u.unit, u.unit === period.unit ? period.count : 2)}
                </button>
              ))}
            </span>
          </div>
        ) : (
          <SelectField name="every-legacy" options={EVERY.map((e) => ({ value: e.value, label: e.label }))} value={every} onChange={(v) => pick(v as Every)} />
        ))}
    </div>
  );

  return (
    <>
      {presets}
      <div className="flex flex-col gap-2 sm:col-span-2" data-when>
        {ready && <Step n={2}>{every === "monthly" ? "¿Qué día del mes?" : fortnight ? "¿Qué días?" : what === "ingreso" ? "¿Cuándo llega el próximo?" : editing ? `¿Cuándo fue el primer ${what}?` : `¿Cuándo es el próximo ${what}?`}</Step>}
        {every === "monthly" ? (
          <>
            {!ready && <span className="text-sm font-medium text-ink-2">{what === "pago" ? "Día de pago" : what === "ingreso" ? "Día en que llega" : "Día del mes"}</span>}
            <input type="hidden" name={names.day} value={day} />
            {/* A month as a calendar of days: the day is picked, never confused with how often. */}
            <div className="grid grid-cols-7 gap-0.5 rounded-2xl border border-line bg-surface/60 p-2" role="group" aria-label="Día del mes">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <button
                  key={d}
                  type="button"
                  data-day={d}
                  aria-pressed={day === d}
                  aria-label={d === 31 ? "31 o el último día" : `Día ${d}`}
                  // The same days as the date picker's calendar; today's day of the month is ringed.
                  className={`num flex h-9 items-center justify-center rounded-lg text-sm transition-colors ${
                    day === d ? "bg-brand font-semibold text-white" : Number(today.slice(8)) === d ? "font-semibold text-brand ring-1 ring-brand ring-inset hover:bg-brand/10" : "hover:bg-brand/10"
                  }`}
                  onClick={() => onChange({ ...value, day: d })}
                >
                  {d}
                </button>
              ))}
            </div>
            {day === "" && <span className="text-xs text-ink-3">Toca un día. Si el mes es más corto, cuenta el último día.</span>}
          </>
        ) : fortnight ? (
          <>
            <SelectField
              name="fortnight"
              options={[...QUINCENAS.map((d) => ({ value: String(d), label: quincenaLabel(d) })), ...(custom ? [{ value: EXACT_14, label: "Cada 14 días exactos" }] : [])]}
              value={every === "biweekly" ? String(day) : EXACT_14}
              onChange={(choice) => (choice === EXACT_14 ? onChange({ every: "w2", day, start: every === "w2" && start ? start : today }) : onChange({ every: "biweekly", day: Number(choice), start }))}
            />
            {every === "biweekly" && <input type="hidden" name={names.day} value={day} />}
            {every === "w2" && <DateField name={names.start} value={start} onChange={(date) => onChange({ ...value, start: date })} required />}
          </>
        ) : (
          <DateField name={names.start} value={start} onChange={(date) => onChange({ ...value, start: date })} required />
        )}
      </div>
      {summary && (
        <p className="rounded-2xl bg-brand/8 px-3 py-2.5 text-sm text-ink sm:col-span-2" data-summary>
          <strong>{summary}.</strong>
          {upcoming.length === 2 && (
            <span className="text-ink-2">
              {" "}
              Próximos: {formatDate(upcoming[0])} y {formatDate(upcoming[1])}.
            </span>
          )}
        </p>
      )}
    </>
  );
}
