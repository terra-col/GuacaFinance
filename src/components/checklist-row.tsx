"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { deleteBill, deleteIncome, markPaid, skipItem, unmarkPaid, unskipItem, updatePaid, updateRecurring } from "@/app/actions";
import { daysBetween, formatCOP, formatDate, relativeDay, type ChecklistItem } from "@/lib/finance";
import { everyShort } from "@/lib/recurrence";
import { DateField } from "./date-field";
import { HouseReceiptRow } from "./house-receipt";
import { MoneyInput } from "./money-input";
import { SelectField } from "./pickers";

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
 * One row of the month. A house's receipt is the same one its screen has: ticked in either place.
 */
export function ChecklistRow(props: Props) {
  if (props.item.house) return <HouseReceiptRow receipt={props.item.house} own={props.item} today={props.today} editable={props.editable} accounts={props.accounts} />;
  return <OwnRow {...props} />;
}

/**
 * One obligatory payment of the month. Ticking it records the payment at once
 * (the tick shows before the server answers), celebrates briefly, and offers
 * a few seconds to undo. Unticking an older payment asks first, because it
 * deletes the recorded movement.
 */
function OwnRow({ item, month, today, editable, accounts }: Props) {
  const [paid, setOptimisticPaid] = useOptimistic(item.paid);
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"none" | "form" | "edit" | "skip" | "unskip" | "delete" | "recurring">("none");
  const income = item.type === "income";
  // A goal's monthly saving: recorded as a deposit to the goal, no account involved.
  const saving = item.type === "goal";
  const skipped = Boolean(item.skipped) && !paid;
  const when = item.forDate ? "esta vez" : "este mes";
  // What is not monthly is marked, skipped and unticked by its date.
  const occurrence = item.forDate ? (
    <>
      <input type="hidden" name="for_date" value={item.forDate} />
      <input type="hidden" name="paid_ids" value={item.paidIds?.join(",") ?? ""} />
    </>
  ) : null;
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
    form.set("month", month);
    if (item.forDate) form.set("for_date", item.forDate);
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
      if (item.forDate) {
        form.set("for_date", item.forDate);
        form.set("paid_ids", item.paidIds?.join(",") ?? "");
      }
      try {
        const result = await unmarkPaid(form);
        if (result.error) setError(result.error);
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

  // Fixed bills and scheduled incomes can be removed from here; the movements already recorded stay.
  const removable = item.type === "bill" || income;

  /** New name, amount or day for the fixed bill or income itself. */
  function editRecurring(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateRecurring({}, form);
      if (result.error) return setError(result.error);
      setPanel("none");
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("id", item.id);
      try {
        await (income ? deleteIncome : deleteBill)(form);
      } catch {
        setError("No se pudo eliminar. Intenta de nuevo.");
      }
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
      if (item.forDate) form.set("for_date", item.forDate);
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
  // Next month's items are marked ahead of time, with a date from this month.
  const earliest = `${month < today.slice(0, 7) ? month : today.slice(0, 7)}-01`;
  const doneWord = income ? "Recibido" : saving ? "Ahorrado" : "Pagado";
  const status = paid
    ? celebrate
      ? `¡${doneWord}!`
      : `${doneWord}${item.paidAmount ? `: ${formatCOP(item.paidAmount)}` : ""}`
    : skipped
      ? `Omitido ${when}${item.skipped!.note ? `: ${item.skipped!.note}` : ""}`
      : item.due === null
      ? "Sin día de pago"
      : !editable
        ? income
          ? `No se registró (llegaba el ${formatDate(item.due)})`
          : `No se registró pago (vencía el ${formatDate(item.due)})`
        : `${formatDate(item.due)}, ${relativeDay(days!)}`;

  const doneLower = doneWord.toLowerCase();
  const label = skipped
    ? `${item.name}: omitido ${when}. Volver a incluir`
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
            {item.every && <span className="text-ink-3"> · {everyShort(item.every)}</span>}
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
              <input type="hidden" name="month" value={month} />
              {occurrence}
              <label className="field">
                {income ? "Cuánto llegó" : saving ? "Cuánto abonas" : "Cuánto pagaste"}
                <MoneyInput name="amount" defaultValue={item.expected} required autoFocus />
              </label>
              <label className="field" hidden={saving}>
                {item.type === "bill" ? "Con qué" : income ? "Llegó a" : "Sale de"}
                <SelectField
                  name="account_id"
                  options={[...(item.type === "debt" ? [{ value: "", label: "Otra fuente (no registrada)" }] : []), ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
                  defaultValue={item.quick?.accountId ?? (item.type === "debt" ? "" : (accounts[0]?.id ?? ""))}
                  required={item.type !== "debt" && !saving}
                />
              </label>
              <label className="field">
                Fecha
                <DateField name="occurred_on" defaultValue={today} min={earliest} max={today} required />
              </label>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-4 sm:justify-end">
                {removable && (
                  <span className="mr-auto flex flex-wrap gap-x-4 gap-y-1">
                    <button type="button" className="text-sm font-medium text-brand" onClick={() => setPanel("recurring")}>
                      Editar {income ? "ingreso" : "pago fijo"}
                    </button>
                    <button type="button" className="text-sm font-medium text-ink-3 hover:text-ink" onClick={() => setPanel("delete")}>
                      Eliminar
                    </button>
                  </span>
                )}
                <button type="button" className="btn-quiet flex-1 sm:flex-none" onClick={() => setPanel("skip")}>
                  Omitir {when}
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
              {occurrence}
              <label className="field">
                {income ? `¿Por qué no llega ${when}? (opcional)` : `¿Por qué no aplica ${when}? (opcional)`}
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
                <span className="font-semibold">{item.name}</span> no cuenta {when}. ¿Lo vuelves a incluir?
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
          {editable && panel === "recurring" && removable && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                editRecurring(new FormData(e.currentTarget));
              }}
              className="mt-3 grid gap-3 rounded-2xl bg-brand/8 p-3 sm:ml-14 sm:grid-cols-[2fr_1.4fr_0.8fr] sm:items-end"
            >
              <input type="hidden" name="type" value={item.type} />
              <input type="hidden" name="id" value={item.id} />
              <label className="field">
                Nombre
                <input className="input" name="name" defaultValue={item.name} maxLength={80} required autoFocus />
              </label>
              <label className="field">
                Valor (vacío si cambia)
                <MoneyInput name="amount" defaultValue={item.expected} />
              </label>
              {item.every ? (
                <p className="text-xs text-ink-3">Los días y cada cuánto se cambian en Programados.</p>
              ) : (
                <label className="field">
                  Día del mes
                  <input className="input num" type="number" name="day" min={1} max={31} defaultValue={item.day ?? (item.due ? Number(item.due.slice(8)) : "")} required />
                </label>
              )}
              <p className="text-xs text-ink-3 sm:col-span-3">Cambia {income ? "el ingreso" : "el pago fijo"} desde ahora; lo que ya registraste no se toca.</p>
              <div className="flex justify-end gap-2 sm:col-span-3">
                <button type="button" className="btn-quiet" onClick={() => setPanel(paid ? "edit" : "form")}>
                  Cancelar
                </button>
                <button className="btn" disabled={pending}>
                  Guardar
                </button>
              </div>
            </form>
          )}
          {editable && panel === "delete" && removable && (
            <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-debt/10 p-3 sm:ml-14 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                ¿Eliminar <span className="font-semibold">{item.name}</span> de {income ? "tus ingresos programados" : "tus pagos fijos"}? Deja de aparecer desde ahora; lo que ya
                registraste se queda en tus movimientos.
              </p>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="btn-quiet" onClick={() => setPanel(paid ? "edit" : "form")}>
                  Cancelar
                </button>
                <button type="button" className="btn" onClick={remove} disabled={pending}>
                  Eliminar
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
              {occurrence}
              <label className="field">
                {income ? "Cuánto llegó" : saving ? "Cuánto abonaste" : "Cuánto pagaste"}
                <MoneyInput name="amount" defaultValue={item.paidAmount || item.expected} required />
              </label>
              <label className="field" hidden={saving}>
                {item.type === "bill" ? "Con qué" : income ? "Llegó a" : "Salió de"}
                <SelectField
                  name="account_id"
                  options={[...(item.type === "debt" ? [{ value: "", label: "Otra fuente (no registrada)" }] : []), ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
                  defaultValue={item.paidFrom ?? item.quick?.accountId ?? (item.type === "debt" ? "" : (accounts[0]?.id ?? ""))}
                  required={item.type !== "debt" && !saving}
                />
              </label>
              <label className="field">
                Fecha
                <DateField name="occurred_on" defaultValue={item.paidOn ?? today} min={earliest} max={today} required />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  <button type="button" className="text-sm font-medium text-ink-3 hover:text-ink" onClick={unpay} disabled={pending}>
                    Desmarcar (borra {income ? "el ingreso" : saving ? "el abono" : "el pago"})
                  </button>
                  {removable && (
                    <>
                      <button type="button" className="text-sm font-medium text-brand" onClick={() => setPanel("recurring")}>
                        Editar {income ? "ingreso" : "pago fijo"}
                      </button>
                      <button type="button" className="text-sm font-medium text-ink-3 hover:text-ink" onClick={() => setPanel("delete")}>
                        Eliminar
                      </button>
                    </>
                  )}
                </span>
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
