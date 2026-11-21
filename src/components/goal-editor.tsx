"use client";

import { useActionState, useEffect, useState } from "react";
import { updateGoal, type FormState } from "@/app/actions";
import type { Goal } from "@/lib/goals";
import { DateField } from "./date-field";
import { EmojiPicker } from "./goal-form";
import { GoalPlanFields, type IncomeOption } from "./goal-plan-fields";
import { Icon } from "./icons";
import { MoneyInput } from "./money-input";
import { SubmitButton } from "./submit-button";

/**
 * Editing a goal on its own screen: name, icon, amount, date and, for savings, the plan.
 * Opens from its button or from links ending in #editar.
 */
export function GoalEditor({
  goal,
  achieved,
  today,
  fromMonth,
  incomes,
}: {
  goal: Goal;
  achieved: number;
  today: string;
  fromMonth: string;
  incomes: IncomeOption[];
}) {
  const save = goal.kind === "save";
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [emoji, setEmoji] = useState(goal.emoji ?? (save ? "🎯" : "💳"));
  const [target, setTarget] = useState(goal.target_amount ?? 0);
  const [date, setDate] = useState(goal.target_date);
  const [state, action] = useActionState<FormState, FormData>(async (prev: FormState, form: FormData) => {
    const result = await updateGoal(prev, form);
    if (!result.error) {
      setOpen(false);
      setSaved(true);
    }
    return result;
  }, {});

  useEffect(() => {
    let frame = 0;
    const follow = () => {
      if (window.location.hash === "#editar") frame = requestAnimationFrame(() => setOpen(true));
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", follow);
    };
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="liquid flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold" onClick={() => setOpen(true)}>
          <Icon name="edit" className="size-4" />
          Editar meta
        </button>
        {saved && (
          <p role="status" className="rise text-sm font-medium text-ink-2">
            ✓ Meta actualizada
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} id="editar" className="card rise flex scroll-mt-4 flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="display text-2xl">Editar meta</h2>
        <button type="button" className="liquid flex size-10 shrink-0 items-center justify-center rounded-xl" onClick={() => setOpen(false)} aria-label="Cerrar sin guardar">
          <Icon name="close" className="size-4" />
        </button>
      </div>
      <input type="hidden" name="id" value={goal.id} />
      <input type="hidden" name="emoji" value={emoji} />
      <label className="field">
        Nombre
        <input className="input" name="name" defaultValue={goal.name} required />
      </label>
      {save && <EmojiPicker value={emoji} onChange={setEmoji} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {save && (
          <label className="field">
            ¿Cuánto cuesta?
            <MoneyInput name="target_amount" defaultValue={goal.target_amount} required onValue={setTarget} />
          </label>
        )}
        <label className="field">
          ¿Para cuándo?
          <DateField name="target_date" value={date} onChange={setDate} required />
        </label>
      </div>
      {save && (
        <GoalPlanFields
          target={target}
          achieved={achieved}
          targetDate={date}
          today={today}
          createdOn={goal.created_on}
          fromMonth={fromMonth}
          incomes={incomes}
          initial={{ amount: goal.plan_amount ?? null, day: goal.plan_day ?? null, incomeId: goal.plan_income_id ?? null, once: goal.plan_once }}
        />
      )}
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-quiet h-11" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <SubmitButton className="btn h-11">Guardar cambios</SubmitButton>
      </div>
    </form>
  );
}
