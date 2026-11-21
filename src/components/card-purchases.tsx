"use client";

import { useActionState, useEffect, useState } from "react";
import { deletePurchase, savePurchase, type FormState } from "@/app/actions";
import { formatCOP, monthLabel } from "@/lib/finance";
import type { PurchaseView, RateType } from "@/lib/installments";
import { DebtTags, InstallmentMeter } from "./installment-meter";
import { MoneyInput } from "./money-input";
import { SubmitButton } from "./submit-button";
import { CategoryField } from "./pickers";

function PurchaseForm({ accountId, view, onDone }: { accountId: string; view?: PurchaseView; onDone: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(savePurchase, {});
  const p = view?.purchase;
  const [type, setType] = useState<RateType | "">(p?.rate_type ?? "");
  const [count, setCount] = useState(p ? String(p.installments) : "");
  const [paid, setPaid] = useState(view ? String(view.paid) : "0");
  const [record, setRecord] = useState(false);

  useEffect(() => {
    if (state.message) onDone();
  }, [state, onDone]);

  const countN = Number(count);
  const paidN = Number(paid || "0");

  return (
    <form action={action} className="rise flex flex-col gap-4 rounded-2xl border border-line p-4">
      <input type="hidden" name="account_id" value={accountId} />
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field sm:col-span-2">
          ¿Qué compraste?
          <input className="input" name="description" maxLength={80} defaultValue={p?.description} placeholder="Televisor, tiquetes, matrícula…" required autoFocus={!p} />
        </label>
        <label className="field">
          Valor de la compra
          <MoneyInput name="amount" defaultValue={p?.amount} placeholder="$ 2.400.000" required />
        </label>
        <label className="field">
          Número de cuotas
          <input className="input num" type="number" name="installments" min={1} max={120} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} placeholder="12" required />
        </label>
        <label className="field">
          Cuotas ya pagadas
          <input className="input num" type="number" name="installments_paid" min={0} max={countN || 120} inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </label>
        <label className="field">
          Cuota que cobra el banco (opcional)
          <MoneyInput name="monthly_payment" defaultValue={p?.monthly_payment} placeholder="Si la dejas vacía, la calculamos" />
        </label>
        <label className="field">
          Tasa efectiva anual % (opcional)
          <input className="input" name="annual_rate" inputMode="decimal" defaultValue={p?.annual_rate != null ? String(p.annual_rate).replace(".", ",") : ""} placeholder="0 si es sin intereses" />
        </label>
        <div className="flex flex-col gap-2">
          <span className="field">Tipo de tasa</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["", "No sé"],
                ["fixed", "Fija"],
                ["variable", "Variable"],
              ] as const
            ).map(([value, label]) => (
              <label key={value || "none"} className="month-chip">
                <input type="radio" name="rate_type" value={value} checked={type === value} onChange={() => setType(value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
      {Number.isInteger(countN) && countN > 0 && paidN >= 0 && paidN <= countN && (
        <p className="text-xs text-ink-3">{paidN === countN ? "Ya pagaste todas las cuotas de esta compra." : `Vas en la cuota ${paidN + 1} de ${countN}: te faltan ${countN - paidN}.`}</p>
      )}
      <label className="check-row">
        <input type="checkbox" name="refinanced" defaultChecked={p?.refinanced} />
        <span>
          <span className="font-medium text-ink">Está rediferida</span>
          <span className="block text-xs text-ink-3">El banco la pasó a más cuotas de las que elegiste al comprar (ejemplo: de 12 a 36). Pon arriba el número de cuotas nuevo.</span>
        </span>
      </label>
      {!p && (
        <>
          <label className="check-row">
            <input type="checkbox" name="record_expense" checked={record} onChange={(e) => setRecord(e.target.checked)} />
            <span>
              <span className="font-medium text-ink">Es una compra nueva: súmala al saldo de la tarjeta</span>
              <span className="block text-xs text-ink-3">Déjalo sin marcar si la compra ya está incluida en el saldo que registraste.</span>
            </span>
          </label>
          {record && (
            <label className="field">
              Categoría del gasto
              <CategoryField name="category" defaultValue="Otros" />
            </label>
          )}
        </>
      )}
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-quiet h-11" onClick={onDone}>
          Cancelar
        </button>
        <SubmitButton className="btn h-11">{p ? "Guardar cambios" : "Agregar compra"}</SubmitButton>
      </div>
    </form>
  );
}

function PurchaseRow({ view, accountId, index }: { view: PurchaseView; accountId: string; index: number }) {
  const [editing, setEditing] = useState(false);
  const { purchase: p } = view;
  if (editing) return <PurchaseForm accountId={accountId} view={view} onDone={() => setEditing(false)} />;
  return (
    <li className={`rise flex flex-col gap-3 py-4 ${view.done ? "opacity-60" : ""}`} style={{ "--i": index } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{p.description}</p>
          <p className="text-sm text-ink-3">
            {formatCOP(p.amount)} a {p.installments} cuotas{view.done ? "" : ` · termina en ${monthLabel(view.endsMonth)}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num font-semibold">{formatCOP(view.payment)}</p>
          <p className="text-xs text-ink-3">{view.paymentIsEstimate ? "cuota aprox." : "cuota al mes"}</p>
        </div>
      </div>
      <InstallmentMeter paid={view.paid} total={view.total} compact />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DebtTags rateType={p.rate_type} refinanced={p.refinanced} />
        {!view.done && <p className="num text-xs text-ink-3">Te falta pagar {formatCOP(view.remaining)} de capital, aprox.</p>}
      </div>
      <div className="flex gap-4 text-sm">
        <button type="button" className="font-medium text-brand" onClick={() => setEditing(true)}>
          Editar
        </button>
        <form action={deletePurchase}>
          <input type="hidden" name="id" value={p.id} />
          <SubmitButton className="text-ink-3 hover:text-ink">Eliminar</SubmitButton>
        </form>
      </div>
    </li>
  );
}

/** The card's purchases in instalments, with what they add up to each month. */
export function CardPurchases({ accountId, views, ready }: { accountId: string; views: PurchaseView[]; ready: boolean }) {
  const [adding, setAdding] = useState(false);
  const active = views.filter((v) => !v.done);
  const monthly = active.reduce((sum, v) => sum + v.payment, 0);
  const remaining = active.reduce((sum, v) => sum + v.remaining, 0);

  return (
    <section id="compras" className="card flex scroll-mt-4 flex-col gap-4" aria-labelledby="purchases-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="purchases-title" className="display text-2xl">
            Compras a cuotas
          </h2>
          <p className="text-sm text-ink-3">
            {active.length
              ? `${active.length} en curso: ${formatCOP(monthly)} al mes y ${formatCOP(remaining)} de capital por pagar, aprox.`
              : "Lo que difieres a varias cuotas: ves en qué cuota vas y cuándo termina cada compra."}
          </p>
        </div>
        {ready && !adding && (
          <button type="button" className="btn-quiet h-10" onClick={() => setAdding(true)}>
            + Agregar compra
          </button>
        )}
      </div>
      {!ready && <p className="alert">Para registrar compras a cuotas falta ejecutar la migración 0009 en Supabase.</p>}
      {adding && <PurchaseForm accountId={accountId} onDone={() => setAdding(false)} />}
      {views.length > 0 && (
        <ul className="divide-y divide-line">
          {views.map((v, i) => (
            <PurchaseRow key={v.purchase.id} view={v} accountId={accountId} index={i} />
          ))}
        </ul>
      )}
    </section>
  );
}
