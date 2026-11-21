"use client";

import { useActionState, useState } from "react";
import {
  saveBill,
  saveBudget,
  saveIncome,
  type FormState,
} from "@/app/actions";
import type { Income } from "@/lib/budget";
import type { Bill } from "@/lib/finance";
import { useCloseModal } from "./modal";
import { MoneyInput } from "./money-input";
import { SubmitButton } from "./submit-button";

/** A fixed bill, new or (with `bill`) edited in place. `onDone` runs once it is saved. */
export function BillForm({ bill, onDone }: { bill?: Bill; onDone?: () => void } = {}) {
  const editing = Boolean(bill);
  const [state, action] = useActionState<FormState, FormData>(async (prev: FormState, form: FormData) => {
    const result = await saveBill(prev, form);
    if (!result.error) onDone?.();
    return result;
  }, {});
  return (
    <form action={action} className={editing ? "flex flex-col gap-4" : "card flex flex-col gap-4"}>
      {!editing && <h2 className="display text-2xl">Nuevo pago fijo</h2>}
      {bill && <input type="hidden" name="id" value={bill.id} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="field">
          Nombre
          <input className="input" name="name" defaultValue={bill?.name} placeholder="Internet, arriendo, Netflix…" required />
        </label>
        <label className="field">
          Valor (vacío si cambia cada mes)
          <MoneyInput name="amount" defaultValue={bill?.amount} placeholder="$ 90.000" />
        </label>
        <label className="field">
          Día de pago
          <input className="input" type="number" name="due_day" min={1} max={31} defaultValue={bill?.due_day} required />
        </label>
        <label className="field">
          Categoría
          <input className="input" name="category" defaultValue={bill ? (bill.category ?? "") : "Hogar"} list="categorias" />
        </label>
      </div>
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      {state.message && !editing && (
        <p role="status" className="text-sm text-ink-2">
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {editing && (
          <button type="button" className="btn-quiet" onClick={onDone}>
            Cancelar
          </button>
        )}
        <SubmitButton className="btn">{editing ? "Guardar cambios" : "Guardar"}</SubmitButton>
      </div>
    </form>
  );
}

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * A salary, a prima, a rent received: an income expected on a day, every month, only some months
 * or once. New, or (with `income`) edited in place; `onDone` runs once it is saved.
 */
export function IncomeForm({
  accounts,
  currentMonth,
  income,
  onDone,
}: {
  accounts: { id: string; name: string }[];
  currentMonth: string;
  income?: Income;
  onDone?: () => void;
}) {
  const editing = Boolean(income);
  const [state, action] = useActionState<FormState, FormData>(async (prev: FormState, form: FormData) => {
    const result = await saveIncome(prev, form);
    if (!result.error) onDone?.();
    return result;
  }, {});
  const [repeat, setRepeat] = useState<"monthly" | "some" | "once">(income?.once_month ? "once" : income?.months ? "some" : "monthly");
  return (
    <form action={action} className={editing ? "flex flex-col gap-4" : "card flex flex-col gap-4"}>
      {!editing && <h2 className="display text-2xl">Nuevo ingreso</h2>}
      {income && <input type="hidden" name="id" value={income.id} />}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Cada cuánto llega</legend>
        {(
          [
            ["monthly", "Cada mes"],
            ["some", "Algunos meses"],
            ["once", "Una sola vez"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="month-chip">
            <input type="radio" name="repeat" value={value} checked={repeat === value} onChange={() => setRepeat(value)} className="sr-only" />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="field">
          Nombre
          <input className="input" name="name" defaultValue={income?.name} placeholder={repeat === "once" ? "Horas extra, bono…" : "Salario, prima…"} required />
        </label>
        <label className="field">
          Valor (vacío si cambia)
          <MoneyInput name="amount" defaultValue={income?.amount} placeholder="$ 8.000.000" />
        </label>
        <label className="field">
          Día en que llega
          <input className="input" type="number" name="day" min={1} max={31} defaultValue={income?.day} required />
        </label>
        <label className="field">
          Llega a
          <select className="input" name="account_id" defaultValue={income ? (income.account_id ?? "") : (accounts[0]?.id ?? "")}>
            <option value="">Preguntar cada vez</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {repeat === "once" && (
        <label className="field sm:max-w-60">
          Mes en que llega
          <input className="input" type="month" name="once_month" min={currentMonth} defaultValue={income?.once_month ?? currentMonth} required />
        </label>
      )}
      {repeat === "some" && (
        <fieldset>
          <legend className="text-sm font-medium text-ink-2">Meses en que llega</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MONTHS.map((m, i) => (
              <label key={m} className="month-chip">
                <input type="checkbox" name="months" value={i + 1} defaultChecked={income?.months?.includes(i + 1)} className="sr-only" />
                {m}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      {state.message && !editing && (
        <p role="status" className="text-sm text-ink-2">
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {editing && (
          <button type="button" className="btn-quiet" onClick={onDone}>
            Cancelar
          </button>
        )}
        <SubmitButton className="btn">{editing ? "Guardar cambios" : "Guardar"}</SubmitButton>
      </div>
    </form>
  );
}

/** Sets (or replaces) the monthly ceiling for one category. */
export function BudgetForm({
  categories,
  initial,
}: {
  categories: string[];
  initial?: { category: string; amount: number };
}) {
  const close = useCloseModal();
  const [state, action] = useActionState<FormState, FormData>(
    async (prev: FormState, form: FormData) => {
      const result = await saveBudget(prev, form);
      if (!result.error) close();
      return result;
    },
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Categoría
          <select
            className="input"
            name="category"
            required
            defaultValue={initial?.category ?? categories[0]}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Tope al mes
          <MoneyInput
            name="amount"
            placeholder="$ 500.000"
            defaultValue={initial?.amount}
            required
          />
        </label>
      </div>
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn self-start">{"Guardar presupuesto"}</SubmitButton>
    </form>
  );
}
