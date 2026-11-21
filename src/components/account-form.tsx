"use client";

import { useActionState, useEffect, useState } from "react";
import { saveAccount, type FormState } from "@/app/actions";
import { isDebt, type AccountKind } from "@/lib/finance";
import { DateField } from "./date-field";
import { Icon, KIND_ICON } from "./icons";
import { CreditDetailFields } from "./credit-detail-fields";
import { MoneyInput } from "./money-input";
import { SubmitButton } from "./submit-button";

const KINDS: { kind: AccountKind; tone: string; label: string; hint: string }[] = [
  { kind: "savings", tone: "tone-have", label: "Cuenta bancaria", hint: "Ahorros, nómina o débito" },
  { kind: "cash", tone: "tone-cash", label: "Efectivo", hint: "Billetera o alcancía" },
  { kind: "credit_card", tone: "tone-brand", label: "Tarjeta", hint: "Tarjeta de crédito" },
  { kind: "loan", tone: "tone-owe", label: "Préstamo", hint: "Libre inversión, vehículo, vivienda" },
];

const PLACEHOLDER: Record<AccountKind, string> = {
  savings: "Ahorros nómina",
  cash: "Billetera",
  credit_card: "Visa oro",
  loan: "Libre inversión",
};

/**
 * New account form. In the modal it starts from the kind tiles; `onSaved` closes
 * the modal once the account is stored.
 */
export function AccountForm({ today, onSaved, initialKind = "savings" }: { today: string; onSaved?: () => void; initialKind?: AccountKind }) {
  const [state, action] = useActionState<FormState, FormData>(saveAccount, {});
  const [kind, setKind] = useState<AccountKind>(initialKind);
  const debt = isDebt({ kind });

  useEffect(() => {
    if (state.message) onSaved?.();
  }, [state, onSaved]);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="kind" value={kind} />
      <fieldset>
        <legend className="field mb-2">¿Qué quieres agregar?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              aria-pressed={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className="group flex flex-col items-start gap-1.5 rounded-2xl border border-line p-3 text-left transition hover:border-brand active:scale-[0.97] aria-pressed:border-brand aria-pressed:bg-brand/12 aria-pressed:shadow-[0_8px_24px_-14px_var(--brand)]"
            >
              <span className={`icon-tile ${k.tone}`}>
                <Icon name={KIND_ICON[k.kind]} />
              </span>
              <span className="font-semibold">{k.label}</span>
              <span className="text-xs text-ink-3">{k.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Nombre
          <input className="input" name="name" placeholder={PLACEHOLDER[kind]} required />
        </label>
        {kind !== "cash" && (
          <label className="field">
            Banco o entidad
            <input className="input" name="institution" placeholder="Bancolombia, Nu, Davivienda…" />
          </label>
        )}
        <label className="field">
          {debt ? "Cuánto debes hoy" : kind === "cash" ? "Cuánto efectivo tienes hoy" : "Saldo hoy"}
          <MoneyInput key={kind} name="opening_balance" placeholder="$ 1.500.000" required />
        </label>
        <label className="field">
          Fecha de ese saldo
          <DateField name="opening_date" defaultValue={today} max={today} required />
        </label>
        {kind === "credit_card" && (
          <>
            <label className="field">
              Cupo total
              <MoneyInput name="credit_limit" placeholder="$ 8.000.000" />
            </label>
            <label className="field">
              Día de corte
              <input className="input" type="number" name="statement_day" min={1} max={31} />
            </label>
            <label className="field">
              Pago mínimo o cuota fija (opcional)
              <MoneyInput name="monthly_payment" placeholder="$ 300.000" />
            </label>
          </>
        )}
        {kind === "loan" && (
          <>
            <label className="field">
              Cuota mensual
              <MoneyInput name="monthly_payment" placeholder="$ 780.000" />
            </label>
            <label className="field">
              Monto original del préstamo (opcional)
              <MoneyInput name="original_amount" placeholder="$ 24.000.000" />
            </label>
          </>
        )}
        {debt && (
          <>
            <label className="field">
              Día límite de pago
              <input className="input" type="number" name="due_day" min={1} max={31} />
            </label>
            <label className="field">
              Tasa efectiva anual (%)
              <input className="input" name="annual_rate" inputMode="decimal" placeholder="24,5" />
            </label>
          </>
        )}
      </div>
      {(kind === "credit_card" || kind === "loan") && <CreditDetailFields key={kind} kind={kind} />}
      {state.error && <p role="alert" className="alert">{state.error}</p>}
      <SubmitButton className="btn h-12 text-base">Agregar cuenta</SubmitButton>
    </form>
  );
}
