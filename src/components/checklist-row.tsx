"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { markPaid, skipItem, unmarkPaid, unskipItem, updatePaid } from "@/app/actions";
import { daysBetween, formatCOP, formatDate, relativeDay, type ChecklistItem } from "@/lib/finance";
import { DateField } from "./date-field";
import { MoneyInput } from "./money-input";

interface Props {
  item: ChecklistItem;
  month: string;
  today: string;
  /** Past months are a record: they can be read but not ticked. */
  editable: boolean;
  /** Accounts the payment can come from: cards and savings for a bill, savings for a debt. */
  accounts: { id: string; name: string }[];
}

const CONFETTI = ["var(--savings)", "var(--brand)", "var(--debt-2)", "var(--savings-2)", "var(--brand-2)", "var(--warn)"];
const UNDO_MS = 6000;

function buzz() {
  try {
    navigator.vibrate?.(18);
  } catch {
    /* not supported */
  }
}

/**
 * One obligatory payment of the month. Ticking it records the payment at once
 * (the tick shows before the server answers), celebrates briefly, and offers
 * a few seconds to undo. Unticking an older payment asks first, because it
 * deletes the recorded movement.
 */
export function ChecklistRow({ item, month, today, editable, accounts }: Props) {
  const [paid, setOptimisticPaid] = useOptimistic(item.paid);
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"none" | "form" | "edit" | "skip" | "unskip">("none");
  const income = item.type === "income";
  // A goal's monthly saving: recorded as a deposit to the goal, no account involved.
  const saving = item.type === "goal";
  const skipped = Boolean(item.skipped) && !paid;
  const [celebrate, setCelebrate] = useState(false);
  const [undoable, setUndoable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(false), 1400);
    return () => clearTimeout(t);
  }, [celebrate]);

  useEffect(() => {
    if (!undoable) return;
    const t = setTimeout(() => setUndoable(false), UNDO_MS);
    return () => clearTimeout(t);
  }, [undoable]);

  function pay(form: FormData) {
    // Urgent updates, outside the transition: they must show now, not when the server answers.
    setError(null);
    setCelebrate(true);
    setPanel("none");
    buzz();
    startTransition(async () => {
      setOptimisticPaid(true);
      const result = await markPaid({}, form);
      if (result.error) {
        setCelebrate(false);
        setError(result.error);
        setPanel("form");
        return;
      }
      setUndoable(true);
    });
  }

  function quickPay() {
    const form = new FormData();
    form.set("type", item.type);
    form.set("id", item.id);
    form.set("amount", String(item.quick!.amount));
    form.set("account_id", item.quick!.accountId ?? "");
    form.set("occurred_on", today);
    pay(form);
  }

  function unpay() {
    setError(null);
    setUndoable(false);
    setPanel("none");
    startTransition(async () => {
      setOptimisticPaid(false);
      const form = new FormData();
      form.set("type", item.type);
      form.set("id", item.id);
      form.set("month", month);
      try {
        await unmarkPaid(form);
      } catch {
        setError("No se pudo desmarcar. Intenta de nuevo.");
      }
    });
  }

  /** A ticked payment with new data (amount, account, date): replaces what was recorded. */
  function edit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updatePaid({}, form);
      if (result.error) return setError(result.error);
      setPanel("none");
    });
  }

  function skip(form: FormData) {
    setError(null);
    setPanel("none");
    startTransition(async () => {
      const result = await skipItem({}, form);
      if (result.error) setError(result.error);
    });
  }

  function unskip() {
    setError(null);
    setPanel("none");
    startTransition(async () => {
      const form = new FormData();
      form.set("id", item.skipped!.id);
      try {
        await unskipItem(form);
      } catch {
        setError("No se pudo volver a incluir. Intenta de nuevo.");
      }
    });
  }

  function onCheck() {
    if (!editable || pending) return;
    if (skipped) return setPanel(panel === "unskip" ? "none" : "unskip");
    if (paid) return setPanel(panel === "edit" ? "none" : "edit");
    if (item.quick) return quickPay();
    setPanel(panel === "form" ? "none" : "form");
  }

  const days = item.due ? daysBetween(today, item.due) : null;
  const doneWord = income ? "Recibido" : saving ? "Ahorrado" : "Pagado";
  const status = paid
    ? celebrate
      ? `¡${doneWord}!`
      : `${doneWord}${item.paidAmount ? `: ${formatCOP(item.paidAmount)}` : ""}`
    : skipped
      ? `Omitido este mes${item.skipped!.note ? `: ${item.skipped!.note}` : ""}`
      : item.due === null
      ? "Sin día de pago"
      : !editable
        ? income
          ? `No se registró (llegaba el ${formatDate(item.due)})`
          : `No se registró pago (vencía el ${formatDate(item.due)})`
        : `${formatDate(item.due)}, ${relativeDay(days!)}`;

  const doneLower = doneWord.toLowerCase();
  const label = skipped
    ? `${item.name}: omitido este mes. Volver a incluir`
    : paid
      ? `${item.name}: ${doneLower}. Editar o desmarcar`
      : item.quick
        ? `Marcar ${item.name} como ${doneLower} por ${formatCOP(item.quick.amount)}`
        : `Marcar ${item.name} como ${doneLower}`;
  const checkClass = paid ? "check-on" : skipped ? "check-skip" : item.overdue ? "check-late" : "";

  return (
    <li className={`relative -mx-2 rounded-2xl px-2 py-3 transition-colors duration-500 ${celebrate ? "bg-savings/12" : ""}`}>
      <div className="flex items-center gap-3">
        <span className="relative shrink-0">
          {editable ? (
            <button
              type="button"
              onClick={onCheck}
              disabled={pending && !paid}
              aria-label={label}
              aria-pressed={paid}
              aria-expanded={panel !== "none"}
              className={`check ${checkClass} ${celebrate ? "check-pop" : ""}`}
            >
              <CheckMark paid={paid} late={item.overdue} skipped={skipped} />
            </button>
          ) : (
            <span className={`check ${checkClass}`} role="img" aria-label={paid ? doneWord : skipped ? "Omitido" : income ? "Sin recibir" : "Sin pagar"}>
              <CheckMark paid={paid} late={item.overdue} skipped={skipped} />
            </span>
          )}
          {celebrate && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-0">
              {CONFETTI.concat(CONFETTI).map((color, i) => {
                const angle = (i / 12) * Math.PI * 2;
                return (
                  <span
                    key={i}
                    className="confetti"
                    style={
                      {
                        background: color,
                        "--dx": `${Math.cos(angle) * 44}px`,
                        "--dy": `${Math.sin(angle) * 44}px`,
                        "--r": `${i * 47}deg`,
                      } as React.CSSProperties
                    }
                  />
                );
              })}
            </span>
          )}
        </span>

        <button type="button" className="min-w-0 flex-1 text-left" onClick={onCheck} disabled={!editable} tabIndex={-1}>
          <p className="truncate font-semibold">
            <span className={`strike ${paid ? "strike-on text-ink-2" : skipped ? "text-ink-3" : ""}`}>{item.name}</span>
          </p>
          <p className={`text-sm ${paid ? "font-medium text-ink-2" : item.overdue ? "font-semibold text-ink" : "text-ink-3"}`}>
            {item.overdue && !paid && <span className="pill pill-urgent mr-1.5">{income ? "Atrasado" : "Vencido"}</span>}
            {status}
          </p>
        </button>

        <div className="shrink-0 text-right">
          <p className={`display num text-lg transition-opacity ${paid || skipped ? "opacity-50" : ""} ${skipped ? "line-through" : ""}`}>
            {income && (paid || item.expected) ? "+" : ""}
            {paid ? formatCOP(item.paidAmount || item.expected || 0) : item.expected ? formatCOP(item.expected) : "Variable"}
          </p>
          {editable && undoable && paid && (
            <button type="button" onClick={unpay} className="rise text-xs font-semibold text-brand">
              Deshacer
            </button>
          )}
          {editable && !paid && !skipped && (
            <button type="button" className="text-xs font-medium text-ink-3 hover:text-ink" onClick={() => setPanel(panel === "form" ? "none" : "form")} aria-expanded={panel === "form"}>
              Opciones
            </button>
          )}
          {editable && paid && !undoable && (
            <button type="button" className="text-xs font-medium text-ink-3 hover:text-ink" onClick={() => setPanel(panel === "edit" ? "none" : "edit")} aria-expanded={panel === "edit"}>
              Editar
            </button>
          )}
        </div>
      </div>

      {/* The panel slides open: a form for a different amount, the edit of a ticked payment, or skipping. */}
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${panel !== "none" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          {editable && panel === "form" && !paid && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                pay(new FormData(e.currentTarget));
              }}
              className="mt-3 grid gap-3 rounded-2xl bg-brand/8 p-3 sm:ml-14 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
            >
              <input type="hidden" name="type" value={item.type} />
              <input type="hidden" name="id" value={item.id} />
              <label className="field">
                {income ? "Cuánto llegó" : saving ? "Cuánto abonas" : "Cuánto pagaste"}
                <MoneyInput name="amount" defaultValue={item.expected} required autoFocus />
              </label>
              <label className="field" hidden={saving}>
                {item.type === "bill" ? "Con qué" : income ? "Llegó a" : "Sale de"}
                <select className="input" name="account_id" defaultValue={item.quick?.accountId ?? ""} required={item.type !== "debt" && !saving}>
                  {item.type === "debt" && <option value="">Otra fuente (no registrada)</option>}
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Fecha
                <DateField name="occurred_on" defaultValue={today} min={`${month}-01`} max={today} required />
              </label>
              <div className="flex gap-2 sm:col-span-4 sm:justify-end">
                <button type="button" className="btn-quiet flex-1 sm:flex-none" onClick={() => setPanel("skip")}>
                  Omitir este mes
                </button>
                <button className="btn flex-1 sm:flex-none" disabled={pending}>
                  Marcar {doneLower}
                </button>
              </div>
            </form>
          )}
          {editable && panel === "skip" && !paid && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                skip(new FormData(e.currentTarget));
              }}
              className="mt-3 grid gap-3 rounded-2xl bg-line/40 p-3 sm:ml-14 sm:grid-cols-[1fr_auto] sm:items-end"
            >
              <input type="hidden" name="type" value={item.type} />
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="month" value={month} />
              <label className="field">
                {income ? "¿Por qué no llega este mes? (opcional)" : "¿Por qué no aplica este mes? (opcional)"}
                <input className="input" name="note" maxLength={200} placeholder={income ? "Vacaciones sin pago" : "Rediferida con el banco"} autoFocus />
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn-quiet flex-1" onClick={() => setPanel("form")}>
                  Volver
                </button>
                <button className="btn flex-1" disabled={pending}>
                  Omitir
                </button>
              </div>
            </form>
          )}
          {editable && panel === "unskip" && skipped && (
            <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-line/40 p-3 sm:ml-14 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                <span className="font-semibold">{item.name}</span> no cuenta este mes. ¿Lo vuelves a incluir?
              </p>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="btn-quiet" onClick={() => setPanel("none")}>
                  Cancelar
                </button>
                <button type="button" className="btn" onClick={unskip} disabled={pending}>
                  Volver a incluir
                </button>
              </div>
            </div>
          )}
          {editable && panel === "edit" && paid && (
            <form
              key={`${item.paidAmount}-${item.paidOn}`}
              onSubmit={(e) => {
                e.preventDefault();
                edit(new FormData(e.currentTarget));
              }}
              className="mt-3 grid gap-3 rounded-2xl bg-savings/10 p-3 sm:ml-14 sm:grid-cols-[1fr_1fr_1fr] sm:items-end"
            >
              <input type="hidden" name="type" value={item.type} />
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="month" value={month} />
              <label className="field">
                {income ? "Cuánto llegó" : saving ? "Cuánto abonaste" : "Cuánto pagaste"}
                <MoneyInput name="amount" defaultValue={item.paidAmount || item.expected} required />
              </label>
              <label className="field" hidden={saving}>
                {item.type === "bill" ? "Con qué" : income ? "Llegó a" : "Salió de"}
                <select className="input" name="account_id" defaultValue={item.paidFrom ?? item.quick?.accountId ?? ""} required={item.type !== "debt" && !saving}>
                  {item.type === "debt" && <option value="">Otra fuente (no registrada)</option>}
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Fecha
                <DateField name="occurred_on" defaultValue={item.paidOn ?? today} min={`${month}-01`} max={today} required />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
                <button type="button" className="text-sm font-medium text-ink-3 hover:text-ink" onClick={unpay} disabled={pending}>
                  Desmarcar (borra {income ? "el ingreso" : saving ? "el abono" : "el pago"})
                </button>
                <div className="flex gap-2">
                  <button type="button" className="btn-quiet" onClick={() => setPanel("none")}>
                    Cancelar
                  </button>
                  <button className="btn" disabled={pending}>
                    Guardar cambios
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
      {error && <p role="alert" className="alert mt-2 sm:ml-14">{error}</p>}
    </li>
  );
}

/** The tick draws itself when the payment is marked; overdue items show "!". */
function CheckMark({ paid, late, skipped }: { paid: boolean; late: boolean; skipped?: boolean }) {
  if (skipped && !paid) return <span aria-hidden="true">–</span>;
  if (paid) {
    return (
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path className="check-draw" d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  }
  return late ? <span aria-hidden="true">!</span> : null;
}
