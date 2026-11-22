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
import { SelectField, CategoryField } from "./pickers";
import { MonthField } from "./month-field";
import { todayInBogota } from "@/lib/finance";
import { EveryFields, type EveryValue } from "./every-fields";

/**
 * A fixed bill, new or (with `bill`) edited in place. `onDone` runs once it is saved; `inModal`:
 * inside a Modal, which has its own title and closes on save.
 */
export function BillForm({ bill, onDone, inModal = false }: { bill?: Bill; onDone?: () => void; inModal?: boolean } = {}) {
  const editing = Boolean(bill);
  const bare = editing || inModal;
  const closeModal = useCloseModal();
  const [state, action] = useActionState<FormState, FormData>(async (prev: FormState, form: FormData) => {
    const result = await saveBill(prev, form);
    if (!result.error) {
      onDone?.();
      if (inModal) closeModal();
    }
    return result;
  }, {});
  const [schedule, setSchedule] = useState<EveryValue>({ every: bill?.every ?? "monthly", day: bill?.due_day ?? "", start: bill?.every && bill.every !== "monthly" ? (bill.starts_on ?? "") : "" });
  return (
    <form action={action} className={bare ? "flex flex-col gap-4" : "card flex flex-col gap-4"}>
      {!bare && <h2 className="display text-2xl">Nuevo pago fijo</h2>}
      {bill && <input type="hidden" name="id" value={bill.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Nombre
          <input className="input" name="name" defaultValue={bill?.name} placeholder="Internet, arriendo, Netflix…" required />
        </label>
        <label className="field">
          {schedule.every === "monthly" ? "Valor" : "Valor cada vez"}
          <MoneyInput name="amount" defaultValue={bill?.amount} placeholder="$ 90.000" />
          <span className="text-xs font-normal text-ink-3">Vacío si cambia (servicios).</span>
        </label>
        <EveryFields value={schedule} onChange={setSchedule} today={todayInBogota()} names={{ every: "every", day: "due_day", start: "starts_on" }} editing={editing} what="pago" />
        <label className="field">
          Categoría
          <CategoryField name="category" defaultValue={bill ? (bill.category ?? "") : "Hogar"} />
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
  inModal = false,
}: {
  accounts: { id: string; name: string }[];
  currentMonth: string;
  income?: Income;
  onDone?: () => void;
  inModal?: boolean;
}) {
  const editing = Boolean(income);
  const bare = editing || inModal;
  const closeModal = useCloseModal();
  const [state, action] = useActionState<FormState, FormData>(async (prev: FormState, form: FormData) => {
    const result = await saveIncome(prev, form);
    if (!result.error) {
      onDone?.();
      if (inModal) closeModal();
    }
    return result;
  }, {});
  const [repeat, setRepeat] = useState<"monthly" | "some" | "once">(income?.once_month ? "once" : income?.months ? "some" : "monthly");
  return (
    <form action={action} className={bare ? "flex flex-col gap-4" : "card flex flex-col gap-4"}>
      {!bare && <h2 className="display text-2xl">Nuevo ingreso</h2>}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Nombre
          <input className="input" name="name" defaultValue={income?.name} placeholder={repeat === "once" ? "Horas extra, bono…" : "Salario, prima…"} required />
        </label>
        <label className="field">
          Valor
          <MoneyInput name="amount" defaultValue={income?.amount} placeholder="$ 8.000.000" />
          <span className="text-xs font-normal text-ink-3">Vacío si cambia cada mes.</span>
        </label>
        <label className="field">
          Día en que llega
          <input className="input" type="number" name="day" min={1} max={31} defaultValue={income?.day} required />
        </label>
        <label className="field">
          Llega a
          <SelectField
            name="account_id"
            options={[{ value: "", label: "Preguntar cada vez" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
            defaultValue={income ? (income.account_id ?? "") : (accounts[0]?.id ?? "")}
          />
        </label>
      </div>
      {repeat === "once" && (
        <label className="field sm:max-w-60">
          Mes en que llega
          <MonthField name="once_month" min={currentMonth} defaultValue={income?.once_month ?? currentMonth} required />
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
          <SelectField name="category" options={categories.map((c) => ({ value: c, label: c }))} defaultValue={initial?.category ?? categories[0]} required />
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
