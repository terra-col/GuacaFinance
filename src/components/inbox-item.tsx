"use client";

import { useActionState } from "react";
import { discardInbox, resolveInbox, type FormState } from "@/app/actions";
import type { InboxItem as Item } from "@/lib/data";
import { formatDate } from "@/lib/finance";
import { MoneyInput } from "./money-input";
import { SubmitButton } from "./submit-button";
import { SelectField, CategoryField } from "./pickers";

export function InboxItem({ item, accounts }: { item: Item; accounts: { id: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(resolveInbox, {});
  return (
    <li className="flex flex-col gap-3 py-4">
      <p className="text-sm text-ink-2">
        <span className="font-medium text-ink">{item.merchant ?? "Comercio sin nombre"}</span> · {formatDate(item.occurred_on)}
        {item.card ? ` · tarjeta «${item.card}»` : ""}
      </p>
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="id" value={item.id} />
        <label className="field">
          Monto
          <MoneyInput name="amount" defaultValue={item.amount} required />
        </label>
        <label className="field">
          Cuenta o tarjeta
          <SelectField name="account_id" options={accounts.map((a) => ({ value: a.id, label: a.name }))} placeholder="Elegir…" required />
        </label>
        <label className="field">
          Categoría
          <CategoryField name="category" />
        </label>
        <SubmitButton className="btn">Registrar</SubmitButton>
        {item.card && (
          <label className="flex items-center gap-2 text-sm text-ink-2 sm:col-span-4">
            <input type="checkbox" name="remember" defaultChecked />
            Recordar que «{item.card}» es esta cuenta, para registrar sola la próxima vez
          </label>
        )}
      </form>
      {state.error && <p role="alert" className="alert">{state.error}</p>}
      <form action={discardInbox}>
        <input type="hidden" name="id" value={item.id} />
        <SubmitButton className="text-sm text-ink-3 underline-offset-2 hover:text-ink hover:underline">Descartar</SubmitButton>
      </form>
    </li>
  );
}
