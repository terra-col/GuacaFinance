"use client";

import { useActionState, useState } from "react";
import { saveTx, type FormState } from "@/app/actions";
import { DateField } from "./date-field";
import { MoneyInput } from "./money-input";
import { CategoryField, SelectField, type PickOption } from "./pickers";
import { SubmitButton } from "./submit-button";
import {
  allowedTxKinds,
  favoriteAccountId,
  favoriteFirst,
  type Account,
  type Tx,
  type TxKind,
} from "@/lib/finance";

const KIND_OPTIONS: { kind: TxKind; label: string }[] = [
  { kind: "expense", label: "Gasto o compra" },
  { kind: "payment", label: "Pago a tarjeta o crédito" },
  { kind: "income", label: "Ingreso" },
];

type AccountOption = Pick<Account, "id" | "name" | "kind" | "favorite">;

const GROUP: Record<Account["kind"], string> = { savings: "Cuentas bancarias", cash: "Efectivo", credit_card: "Tarjetas de crédito", loan: "Préstamos" };
const KIND_ORDER: Account["kind"][] = ["savings", "cash", "credit_card", "loan"];

/** Accounts as picker options: grouped by kind, the favourite first in its group and starred. */
function accountOptions(accounts: AccountOption[]): PickOption[] {
  return KIND_ORDER.flatMap((kind) =>
    favoriteFirst(accounts.filter((a) => a.kind === kind)).map((a) => ({ value: a.id, label: a.name, group: GROUP[kind], star: Boolean(a.favorite) })),
  );
}

/**
 * Records a movement, or edits one when `tx` is given. Editing keeps the
 * movement's link to a fixed payment or an income, and calls `onDone` once saved.
 */
export function TxForm({
  accounts,
  today,
  tx,
  onDone,
}: {
  accounts: AccountOption[];
  today: string;
  tx?: Tx;
  onDone?: (message: string) => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    async (prev: FormState, form: FormData) => {
      const result = await saveTx(prev, form);
      if (!result.error) onDone?.(result.message ?? "Guardado.");
      return result;
    },
    {},
  );
  const [kind, setKind] = useState<TxKind>(tx?.kind ?? "expense");
  const editing = Boolean(tx);
  // Keep the original values when the person flips back to the movement's own kind.
  const own = tx && kind === tx.kind ? tx : undefined;
  // The favourite account first, and already chosen for a new expense or payment.
  const targets = favoriteFirst(accounts.filter((a) => allowedTxKinds(a.kind).includes(kind)));
  const savings = favoriteFirst(accounts.filter((a) => a.kind === "savings" || a.kind === "cash"));
  const favorite = favoriteAccountId(accounts);

  return (
    // Lives inside a sheet (new or edit), so it has no card or title of its own.
    <form action={action} className="flex flex-col gap-4">
      {editing && <input type="hidden" name="id" value={tx!.id} />}
      {editing ? (
        <input type="hidden" name="kind" value={kind} />
      ) : (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Tipo de movimiento</legend>
          {KIND_OPTIONS.map((option) => (
            <label
              key={option.kind}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                kind === option.kind
                  ? "border-transparent bg-brand text-white"
                  : "border-line text-ink-2"
              }`}
            >
              <input
                className="sr-only"
                type="radio"
                name="kind"
                value={option.kind}
                checked={kind === option.kind}
                onChange={() => setKind(option.kind)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      )}

      {targets.length === 0 ? (
        <p className="text-sm text-ink-3">
          No tienes una cuenta a la que aplique este movimiento.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field">
              Monto
              <MoneyInput
                name="amount"
                placeholder="$ 85.000"
                defaultValue={tx?.amount}
                required
              />
            </label>
            <label className="field">
              Fecha
              <DateField name="occurred_on" defaultValue={tx?.occurred_on ?? today} max={today} required />
            </label>
            {/* key: the option list changes with the kind, so the select starts fresh */}
            <label className="field" key={kind}>
              {kind === "payment"
                ? "Deuda que pagas"
                : kind === "income"
                  ? "Cuenta que recibe"
                  : "Con qué pagaste"}
              <SelectField
                name="account_id"
                options={accountOptions(targets)}
                defaultValue={own?.account_id ?? (kind !== "payment" && targets.some((a) => a.id === favorite) ? favorite! : (targets[0]?.id ?? ""))}
                required
              />
            </label>
            {kind === "payment" && (
              <label className="field">
                Sale de
                <SelectField
                  name="source_account_id"
                  options={[{ value: "", label: "Otra fuente (no registrada)" }, ...accountOptions(savings)]}
                  defaultValue={own ? (own.source_account_id ?? "") : (favorite ?? "")}
                />
              </label>
            )}
            {kind === "expense" && (
              <label className="field">
                Categoría
                <CategoryField name="category" defaultValue={own?.category ?? "Ocio"} />
              </label>
            )}
            <label className="field">
              Nota
              <input
                className="input"
                name="description"
                placeholder="Opcional"
                defaultValue={tx?.description ?? ""}
              />
            </label>
          </div>
          {state.error && (
            <p role="alert" className="alert">
              {state.error}
            </p>
          )}
          {state.message && (
            <p role="status" className="text-sm text-ink-2">
              {state.message}
            </p>
          )}
          <SubmitButton className="btn self-start">{editing ? "Guardar cambios" : "Registrar"}</SubmitButton>
        </>
      )}
    </form>
  );
}
