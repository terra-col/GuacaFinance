"use client";

import { useActionState, useState } from "react";
import { adjustBalance, type FormState } from "@/app/actions";
import { formatCOP } from "@/lib/finance";
import { DateField } from "./date-field";
import { Icon } from "./icons";
import { MoneyInput } from "./money-input";
import { SubmitButton } from "./submit-button";

/**
 * "Actualizar saldo": the person types what the bank shows today and the
 * difference is recorded as a movement, so history and balance stay in step.
 */
export function BalanceAdjuster({
  id,
  current,
  debt,
  today,
  defaultOpen = false,
  onCancel,
}: {
  id: string;
  current: number;
  debt: boolean;
  today: string;
  defaultOpen?: boolean;
  /** What «Cancelar» does when the form is all there is (it closes the whole panel). */
  onCancel?: () => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(adjustBalance, {});
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div id="saldo" className="scroll-mt-4">
      {!open ? (
        <button type="button" className="liquid flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold" onClick={() => setOpen(true)}>
          <Icon name="edit" className="size-4 text-brand" />
          Actualizar saldo
        </button>
      ) : (
        <form action={action} className="card rise flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />
          <p className="text-sm text-ink-2">
            Aquí dice <span className="num font-semibold text-ink">{formatCOP(current)}</span>. Escribe {debt ? "lo que debes según el banco" : "el saldo que ves en el banco"} y la
            diferencia queda registrada como un ajuste.
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="field">
              {debt ? "Deuda según el banco" : "Saldo según el banco"}
              <MoneyInput name="balance" required autoFocus />
            </label>
            <label className="field">
              A la fecha
              <DateField name="occurred_on" defaultValue={today} max={today} required />
            </label>
            <div className="flex gap-2">
              <button type="button" className="btn-quiet h-11" onClick={() => (onCancel ? onCancel() : setOpen(false))}>
                Cancelar
              </button>
              <SubmitButton className="btn h-11">Guardar</SubmitButton>
            </div>
          </div>
          {state.error && <p role="alert" className="alert">{state.error}</p>}
          {state.message && <p role="status" className="text-sm font-semibold text-ink">✓ {state.message}</p>}
        </form>
      )}
    </div>
  );
}
