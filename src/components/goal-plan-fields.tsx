"use client";

import { useState } from "react";
import { formatCOP, formatDate } from "@/lib/finance";
import { planDates } from "@/lib/goals";
import { MoneyInput } from "./money-input";
import { SelectField } from "./pickers";

export interface IncomeOption {
  id: string;
  name: string;
  day: number;
}

const roundUp = (n: number) => (n <= 0 ? 0 : Math.ceil(n / 1000) * 1000);

/**
 * «¿Cómo vas a ahorrar?»: a monthly amount on a day of the month, optionally tied to an income
 * (the day follows it). With a plan the saving shows up every month in Pagos and the calendar.
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
  initial?: { amount: number | null; day: number | null; incomeId: string | null; once?: boolean };
}) {
  const [mode, setMode] = useState<"monthly" | "once" | "none">(initial ? (initial.once ? "once" : initial.amount !== null ? "monthly" : "none") : "monthly");
  const on = mode === "monthly";
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [amountKey, setAmountKey] = useState(0);
  const [day, setDay] = useState(initial?.day ?? incomes[0]?.day ?? 30);
  const [incomeId, setIncomeId] = useState(initial?.incomeId ?? "");

  const remaining = Math.max(0, target - achieved);
  const ready = remaining > 0 && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) && targetDate >= today && day >= 1 && day <= 31;
  const dates = ready ? planDates(day, fromMonth, createdOn > today ? createdOn : today, targetDate) : [];
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
            ["monthly", "Abonos cada mes"],
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
          ? "Cada mes te aparece en Pagos y en el calendario como un compromiso más; al marcarlo se suma a la meta."
          : mode === "once"
            ? `Te aparece una sola vez en Pagos${/^d{4}-d{2}-d{2}$/.test(targetDate) ? `, el ${formatDate(targetDate)},` : " en su fecha"} por lo que falte. Sin abonos mensuales ni avisos de atraso.`
            : "Queda guardada con su fecha y abonas cuando quieras. Sin recordatorios ni avisos de atraso."}
      </p>

      {on && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="field">
              Cuánto al mes
              <MoneyInput key={amountKey} name="plan_amount" defaultValue={amount || null} placeholder={suggested ? formatCOP(suggested) : "$ 100.000"} required onValue={setAmount} />
            </label>
            <label className="field">
              De dónde sale (opcional)
              <SelectField
                name="plan_income_id"
                options={[{ value: "", label: "No lo sé / otro" }, ...incomes.map((i) => ({ value: i.id, label: `${i.name} · día ${i.day}` }))]}
                value={incomeId}
                onChange={(id) => {
                  setIncomeId(id);
                  const income = incomes.find((i) => i.id === id);
                  if (income) setDay(income.day);
                }}
              />
            </label>
            <label className="field">
              Día del mes
              <input className="input num" type="number" name="plan_day" min={1} max={31} value={day} onChange={(e) => setDay(Number(e.target.value))} required />
            </label>
          </div>

          {ready && (
            <div className="rounded-xl bg-brand/8 p-3 text-sm">
              {dates.length === 0 ? (
                <p>No queda ningún día {day} antes de la fecha de la meta. Elige un día más cercano.</p>
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
                  Usar {formatCOP(suggested)} al mes
                </button>
              )}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
