"use client";

import { useState } from "react";
import { formatCOP, formatDate } from "@/lib/finance";
import { planDates } from "@/lib/goals";
import { needsDate, quincenaFrom, quincenaLabel, type Every } from "@/lib/recurrence";
import { EveryFields, type EveryValue } from "./every-fields";
import { MoneyInput } from "./money-input";
import { SelectField } from "./pickers";

export interface IncomeOption {
  id: string;
  name: string;
  day: number;
  every?: Every;
}

const roundUp = (n: number) => (n <= 0 ? 0 : Math.ceil(n / 1000) * 1000);

/**
 * «¿Cómo vas a ahorrar?»: an amount each time (monthly unless another periodicity is chosen),
 * optionally tied to an income (the day follows it). With a plan the saving shows up in Pagos and
 * the calendar each time it falls.
 * Below, live: whether keeping it arrives on time, and the amount that would.
 */
export function GoalPlanFields({
  target,
  achieved = 0,
  targetDate,
  today,
  createdOn = today,
  fromMonth = today.slice(0, 7),
  incomes,
  initial,
}: {
  /** The goal's amount and date as typed so far (0 / "" while empty). */
  target: number;
  achieved?: number;
  targetDate: string;
  today: string;
  createdOn?: string;
  /** First month that still counts: next month when this month's saving is already in. */
  fromMonth?: string;
  incomes: IncomeOption[];
  initial?: { amount: number | null; day: number | null; incomeId: string | null; once?: boolean; every?: Every; start?: string | null };
}) {
  const [mode, setMode] = useState<"monthly" | "once" | "none">(initial ? (initial.once ? "once" : initial.amount !== null ? "monthly" : "none") : "monthly");
  const on = mode === "monthly";
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [amountKey, setAmountKey] = useState(0);
  const [schedule, setSchedule] = useState<EveryValue>({ every: initial?.every ?? "monthly", day: initial?.day ?? incomes[0]?.day ?? 30, start: initial?.start ?? "" });
  const [incomeId, setIncomeId] = useState(initial?.incomeId ?? "");

  const remaining = Math.max(0, target - achieved);
  const { every } = schedule;
  const monthly = every === "monthly";
  const day = Number(schedule.day);
  const ready =
    remaining > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(targetDate) &&
    targetDate >= today &&
    (needsDate(every) ? /^\d{4}-\d{2}-\d{2}$/.test(schedule.start) : day >= 1 && day <= 31);
  const since = createdOn > today ? createdOn : today;
  const dates = ready
    ? planDates(day, monthly ? fromMonth : today.slice(0, 7), since, targetDate, every, every === "biweekly" ? today : schedule.start)
    : [];
  const suggested = roundUp(remaining / Math.max(1, dates.length));
  const projected = achieved + amount * dates.length;

  function applySuggested() {
    setAmount(suggested);
    setAmountKey((k) => k + 1); // the money field takes the new value on remount
  }

  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-ink">¿Cómo lo vas a juntar?</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cómo lo vas a juntar">
        {(
          [
            ["monthly", "Con abonos"],
            ["once", "En un solo pago"],
            ["none", "Sin plan"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="month-chip">
            <input type="radio" name="plan_mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
      <p className="text-xs text-ink-3">
        {mode === "monthly"
          ? "Cada abono te aparece en Pagos y en el calendario como un compromiso más; al marcarlo se suma a la meta."
          : mode === "once"
            ? `Te aparece una sola vez en Pagos${/^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? `, el ${formatDate(targetDate)},` : " en su fecha"} por lo que falte. Sin abonos mensuales ni avisos de atraso.`
            : "Queda guardada con su fecha y abonas cuando quieras. Sin recordatorios ni avisos de atraso."}
      </p>

      {on && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field">
              {monthly ? "Cuánto al mes" : "Cuánto cada vez"}
              <MoneyInput key={amountKey} name="plan_amount" defaultValue={amount || null} placeholder={suggested ? formatCOP(suggested) : "$ 100.000"} required onValue={setAmount} />
            </label>
            <label className="field">
              De dónde sale (opcional)
              <SelectField
                name="plan_income_id"
                options={[{ value: "", label: "No lo sé / otro" }, ...incomes.map((i) => ({ value: i.id, label: `${i.name} · ${i.every === "biweekly" ? quincenaLabel(i.day) : `día ${i.day}`}` }))]}
                value={incomeId}
                onChange={(id) => {
                  setIncomeId(id);
                  const income = incomes.find((i) => i.id === id);
                  if (income)
                    setSchedule((s) => {
                      const every = income.every === "biweekly" ? "biweekly" : s.every;
                      return { ...s, every, day: every === "biweekly" ? quincenaFrom(income.day) : income.day };
                    });
                }}
              />
            </label>
            <EveryFields value={schedule} onChange={setSchedule} today={today} names={{ every: "plan_every", day: "plan_day", start: "plan_start" }} editing={Boolean(initial?.start)} what="abono" />
          </div>

          {ready && (
            <div className="rounded-xl bg-brand/8 p-3 text-sm">
              {dates.length === 0 ? (
                <p>{monthly ? `No queda ningún día ${day}` : "No cae ningún abono"} antes de la fecha de la meta. Elige una fecha más cercana.</p>
              ) : amount > 0 ? (
                projected >= target ? (
                  <p>
                    <span className="font-semibold text-ink">✓ Llegas a tiempo.</span> Son {dates.length} {dates.length === 1 ? "abono" : "abonos"}, desde el{" "}
                    {formatDate(dates[0])}, y juntas {formatCOP(projected)}.
                  </p>
                ) : (
                  <p>
                    Con {formatCOP(amount)} en {dates.length} {dates.length === 1 ? "abono" : "abonos"} llegas a {formatCOP(projected)}:{" "}
                    <span className="font-semibold text-ink">te faltarían {formatCOP(target - projected)}</span>.
                  </p>
                )
              ) : (
                <p>
                  Para llegar a tiempo necesitas {formatCOP(suggested)} en cada uno de los {dates.length} {dates.length === 1 ? "abono" : "abonos"}, desde el {formatDate(dates[0])}.
                </p>
              )}
              {dates.length > 0 && amount !== suggested && (
                <button type="button" className="mt-2 font-semibold text-brand" onClick={applySuggested}>
                  Usar {formatCOP(suggested)} {monthly ? "al mes" : "cada vez"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
