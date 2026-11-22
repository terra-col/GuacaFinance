"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { payHouseBill, recordHousePayment, skipHouseBill, unpayHouseBill, unskipHouseBill, updateHousePayment } from "@/app/house-actions";
import { daysBetween, formatCOP, formatDate, relativeDay, type ChecklistItem } from "@/lib/finance";
import type { HousePaid, HouseReceipt } from "@/lib/house";
import { everyShort } from "@/lib/recurrence";
import { DateField } from "./date-field";
import { Sheet, useCloseModal } from "./modal";
import { MoneyInput } from "./money-input";
import { SelectField } from "./pickers";
import { NO_ACCOUNT, Problem, Send, useSave } from "./shared-forms";
import { SplitPanel, draftShares, draftSplit, newDraft, splitSummary, type SplitDraft } from "./split-panel";

type AccountChoice = { id: string; name: string };

const shortDate = (date: string) => formatDate(date).replace(/ \d{4}$/, "");

/** «Beto», «Beto y tú», «Ana, Beto y tú». */
function payers(receipt: HouseReceipt): string {
  const names = [...new Set(receipt.payments.map((p) => (p.byMe ? "tú" : p.who)))].sort((a, b) => Number(a === "tú") - Number(b === "tú"));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}` : (names[0] ?? "");
}

function paidLine(receipt: HouseReceipt): string {
  const who = payers(receipt);
  const verb = who === "tú" ? "Pagaste" : receipt.payments.some((p) => p.who !== receipt.payments[0].who) ? `Pagaron ${who}` : `Pagó ${who}`;
  return `${verb} el ${shortDate(receipt.payments.at(-1)!.on)}`;
}

/**
 * A receipt of a house as a row. In the person's own list (`own`) it says it is the house's and
 * counts what is theirs; in the house, the whole receipt and whose it is.
 */
export function HouseReceiptRow({
  receipt,
  today,
  editable,
  accounts,
  own,
}: {
  receipt: HouseReceipt;
  today: string;
  editable: boolean;
  accounts: AccountChoice[];
  own?: ChecklistItem;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const done = own ? own.paid : receipt.settled;
  const skipped = !done && Boolean(receipt.skip);
  const late = !done && receipt.overdue;
  const whose = receipt.responsible === receipt.me ? "te toca a ti" : receipt.responsibleName ? `le toca a ${receipt.responsibleName}` : "sin responsable";

  let status: string;
  if (receipt.settled) status = paidLine(receipt);
  else if (own?.paid) status = `Pusiste ${formatCOP(own.paidAmount)}`;
  else if (receipt.skip) status = `Omitido${receipt.skip.note ? `: ${receipt.skip.note}` : ""}`;
  else if (receipt.payments.length) status = `Van ${formatCOP(receipt.total)} de ${payers(receipt)}${receipt.left ? ` · faltan ${formatCOP(receipt.left)}` : ""}`;
  else status = `${shortDate(receipt.due)}, ${relativeDay(daysBetween(today, receipt.due))}`;

  const value = receipt.settled ? (own?.paidAmount || receipt.total) : own?.paid ? own.paidAmount : receipt.payments.length ? receipt.left || receipt.total : receipt.amount;
  const label = `${receipt.name}, de la casa: ${receipt.settled ? "pagado. Ver quién pagó" : skipped ? "omitido" : "marcar quién pagó"}`;

  return (
    <li className="relative -mx-2 rounded-2xl px-2 py-3" data-receipt={receipt.name}>
      <button type="button" className="flex w-full items-center gap-3 text-left" aria-label={label} aria-expanded={open} onClick={() => setOpen(true)}>
        <span aria-hidden="true" className={`check shrink-0 ${done ? "check-on" : skipped ? "check-skip" : late ? "check-late" : ""}`}>
          {done ? (
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : skipped ? (
            "–"
          ) : late ? (
            "!"
          ) : (
            ""
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            <span className={`strike ${done ? "strike-on text-ink-2" : skipped ? "text-ink-3" : ""}`}>{receipt.name}</span>
          </span>
          <span className={`num block text-sm ${done ? "font-medium text-ink-2" : late ? "font-semibold text-ink" : "text-ink-3"}`}>
            {late && <span className="pill pill-urgent mr-1.5">Vencido</span>}
            {status}
            {receipt.every !== "monthly" && <span className="text-ink-3"> · {everyShort(receipt.every)}</span>}
          </span>
          {own ? (
            <span className="block truncate text-xs font-medium text-brand">De la casa · {receipt.groupName}</span>
          ) : (
            !done && !skipped && <span className={`block truncate text-xs ${receipt.responsible === receipt.me ? "font-semibold text-brand" : "text-ink-3"}`}>{whose}</span>
          )}
        </span>
        <span className={`display num shrink-0 text-lg ${done || skipped ? "opacity-50" : ""}`}>{value ? formatCOP(value) : "Variable"}</span>
      </button>
      <Sheet open={open} onClose={close} title={receipt.name}>
        <ReceiptSheet receipt={receipt} today={today} editable={editable} accounts={accounts} />
      </Sheet>
    </li>
  );
}

function ReceiptSheet({ receipt, today, editable, accounts }: { receipt: HouseReceipt; today: string; editable: boolean; accounts: AccountChoice[] }) {
  const [skipping, setSkipping] = useState(false);
  const canPay = editable && receipt.payable && !receipt.settled && !receipt.skip;
  return (
    <div className="flex flex-col gap-4">
      <p className="num text-sm text-ink-2">
        De <Link href={`/pagos/casa/${receipt.group}?mes=${receipt.month}`} className="font-semibold text-brand">{receipt.groupName}</Link> · vence el {shortDate(receipt.due)}
        {receipt.amount ? ` · ${formatCOP(receipt.amount)}` : ""}
        {receipt.responsibleName ? ` · ${receipt.responsible === receipt.me ? "te toca a ti" : `le toca a ${receipt.responsibleName}`}` : ""}
      </p>

      {receipt.payments.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl bg-brand/6 px-3" data-payments>
          {receipt.payments.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} receipt={receipt} today={today} editable={editable} accounts={accounts} />
          ))}
        </ul>
      )}
      {receipt.skip && <Unskip receipt={receipt} editable={editable} />}
      {!editable && receipt.payments.length === 0 && !receipt.skip && (
        <p className="text-sm text-ink-3">{receipt.month > today.slice(0, 7) ? "Lo podrás marcar desde el mes anterior." : "Ese mes quedó sin pago anotado."}</p>
      )}

      {canPay && (skipping ? <SkipForm receipt={receipt} back={() => setSkipping(false)} /> : <PayForm receipt={receipt} today={today} accounts={accounts} onSkip={receipt.payments.length ? undefined : () => setSkipping(true)} />)}
    </div>
  );
}

function PayForm({ receipt, today, accounts, onSkip }: { receipt: HouseReceipt; today: string; accounts: AccountChoice[]; onSkip?: () => void }) {
  const close = useCloseModal();
  const { me, members, left } = receipt;
  const [payer, setPayer] = useState(me);
  const [amount, setAmount] = useState(left || 0);
  // null: what the amount itself says (less than what is left is a part).
  const [part, setPart] = useState<boolean | null>(null);
  const canDivide = members.length > 1;
  const [divide, setDivide] = useState(receipt.split && canDivide);
  const [draft, setDraft] = useState<SplitDraft>(() => newDraft(members, me));
  const [splitting, setSplitting] = useState(false);
  const { pending, error, submit } = useSave(payHouseBill, () => close());

  const less = Boolean(left && amount && amount < left);
  const isPart = part ?? less;
  const current = { ...draft, paidBy: payer };
  const summary = splitSummary(current, amount, members, me);
  const ready = !divide || !amount || draftShares(current, amount) !== null;
  const earliest = `${receipt.month < today.slice(0, 7) ? receipt.month : today.slice(0, 7)}-01`;

  return (
    <form
      onSubmit={submit}
      // Enter inside the split view would mark it paid.
      onKeyDown={(e) => {
        if (splitting && e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      className="flex flex-col gap-4"
      data-pay
    >
      <input type="hidden" name="bill" value={receipt.bill} />
      <input type="hidden" name="month" value={receipt.month} />
      <input type="hidden" name="for_date" value={receipt.date ?? ""} />
      <input type="hidden" name="settles" value={isPart ? "0" : "1"} />
      {divide && <input type="hidden" name="split" value={JSON.stringify(draftSplit(current))} />}
      {splitting && <SplitPanel amount={amount} members={members} me={me} draft={current} onChange={setDraft} onClose={() => setSplitting(false)} fixedPayer />}

      <div hidden={splitting} className="flex flex-col gap-4">
        {receipt.payments.length > 0 && <p className="text-sm font-semibold text-ink">Otro pago de este recibo</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            Quién pagó
            <SelectField name="paid_by" value={payer} onChange={setPayer} options={members.map((m) => ({ value: m.id, label: m.id === me ? `${m.name} (tú)` : m.name }))} />
          </label>
          <label className="field">
            Cuánto pagó
            <MoneyInput name="amount" defaultValue={left || undefined} onValue={setAmount} required />
          </label>
          {payer === me && (
            <label className="field">
              Con qué pagaste
              <SelectField name="account_id" options={[...accounts.map((a) => ({ value: a.id, label: a.name })), NO_ACCOUNT]} defaultValue={accounts[0]?.id ?? ""} />
            </label>
          )}
          <label className="field">
            Fecha
            <DateField name="occurred_on" defaultValue={today} min={earliest} max={today} required />
          </label>
        </div>
        {payer !== me && <p className="text-sm text-ink-2">Solo queda anotado. Tus cuentas no se mueven, y quien pagó lo puede registrar en la suya.</p>}

        {(less || left === null || part) && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cómo queda">
            <button type="button" className="chip" aria-pressed={!isPart} onClick={() => setPart(false)} data-settles="yes">
              Queda pagado
            </button>
            <button type="button" className="chip" aria-pressed={isPart} onClick={() => setPart(true)} data-settles="no">
              Es solo una parte
            </button>
          </div>
        )}

        {canDivide && (
          <>
            <label className="flex items-center gap-2.5 text-sm text-ink-2">
              <input type="checkbox" checked={divide} onChange={(e) => setDivide(e.target.checked)} data-divide />
              Dividir este pago en Compartidos
            </label>
            {divide && (
              <button type="button" data-split-open className="flex w-full items-center gap-3 rounded-2xl bg-brand/8 p-3 text-left" onClick={() => setSplitting(true)}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{summary.title}</span>
                  <span className="num block text-sm text-ink-2" style={summary.style}>
                    {summary.detail}
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-brand">
                  ›
                </span>
              </button>
            )}
          </>
        )}
        <Problem error={error} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Send pending={pending} disabled={!ready}>
            {isPart ? "Anotar la parte" : "Marcar pagado"}
          </Send>
          {onSkip && (
            <button type="button" className="text-sm font-medium text-ink-3 hover:text-ink" onClick={onSkip}>
              Esta vez no aplica
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

function SkipForm({ receipt, back }: { receipt: HouseReceipt; back: () => void }) {
  const close = useCloseModal();
  const { pending, error, submit } = useSave(skipHouseBill, () => close());
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input type="hidden" name="bill" value={receipt.bill} />
      <input type="hidden" name="month" value={receipt.month} />
      <input type="hidden" name="for_date" value={receipt.date ?? ""} />
      <label className="field">
        ¿Por qué no aplica esta vez? (opcional)
        <input className="input" name="note" maxLength={200} autoComplete="off" />
      </label>
      <p className="text-sm text-ink-2">Queda omitido para toda la casa.</p>
      <Problem error={error} />
      <div className="flex gap-2">
        <button type="button" className="btn-quiet" onClick={back}>
          Atrás
        </button>
        <Send pending={pending}>Omitir</Send>
      </div>
    </form>
  );
}

function Unskip({ receipt, editable }: { receipt: HouseReceipt; editable: boolean }) {
  const { pending, error, submit } = useSave(unskipHouseBill);
  return (
    <form onSubmit={submit} className="flex flex-col items-start gap-2 text-sm text-ink-2">
      <input type="hidden" name="skip" value={receipt.skip!.id} />
      <p>No cuenta esta vez{receipt.skip!.note ? `: ${receipt.skip!.note}` : ""}.</p>
      {editable && <Send pending={pending} className="btn-quiet">Volver a incluir</Send>}
      <Problem error={error} />
    </form>
  );
}

function PaymentRow({ payment, receipt, today, editable, accounts }: { payment: HousePaid; receipt: HouseReceipt; today: string; editable: boolean; accounts: AccountChoice[] }) {
  const [view, setView] = useState<"none" | "edit" | "undo" | "record">("none");
  const back = () => setView("none");
  const change = useSave(updateHousePayment, back);
  const undo = useSave(unpayHouseBill, back);
  const record = useSave(recordHousePayment, back);
  const choices = accounts.map((a) => ({ value: a.id, label: a.name }));
  const link = "text-xs font-semibold text-brand";

  return (
    <li className="py-2.5 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-ink-2">
          <strong className="text-ink">{payment.byMe ? "Pagaste tú" : `Pagó ${payment.who}`}</strong> el {shortDate(payment.on)}
          {!payment.settles && " · una parte"}
          {payment.entry && " · dividido"}
        </p>
        <p className="num shrink-0 font-semibold text-ink">{formatCOP(payment.amount)}</p>
      </div>
      {view === "none" && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {payment.byMe && !payment.recorded && accounts.length > 0 && (
            <button type="button" className={link} onClick={() => setView("record")}>
              Registrar en mi cuenta
            </button>
          )}
          {editable &&
            payment.canEdit &&
            (payment.entry ? (
              <Link href={`/compartidos/${receipt.group}`} className={link}>
                Cambiar en Compartidos
              </Link>
            ) : (
              <button type="button" className={link} onClick={() => setView("edit")}>
                Cambiar
              </button>
            ))}
          {editable && payment.canEdit && (
            <button type="button" className="text-xs font-medium text-ink-3 hover:text-debt" onClick={() => setView("undo")}>
              Desmarcar
            </button>
          )}
        </div>
      )}
      {view === "edit" && (
        <form onSubmit={change.submit} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="payment" value={payment.id} />
          <label className="field">
            Cuánto pagó
            <MoneyInput name="amount" defaultValue={payment.amount} required />
          </label>
          <label className="field">
            Fecha
            <DateField name="occurred_on" defaultValue={payment.on} max={today} required />
          </label>
          {payment.byMe && (
            <label className="field">
              Con qué pagaste
              <SelectField name="account_id" options={[{ value: "", label: payment.recorded ? "La misma cuenta" : NO_ACCOUNT.label }, ...choices]} />
            </label>
          )}
          <label className="flex items-center gap-2.5 text-ink-2">
            <input type="checkbox" name="settles" defaultChecked={payment.settles} />
            Con este pago queda pagado
          </label>
          <Problem error={change.error} />
          <div className="flex gap-2">
            <button type="button" className="btn-quiet" onClick={back}>
              Cancelar
            </button>
            <Send pending={change.pending}>Guardar cambios</Send>
          </div>
        </form>
      )}
      {view === "undo" && (
        <form onSubmit={undo.submit} className="mt-2 flex flex-col gap-2 text-ink-2">
          <input type="hidden" name="payment" value={payment.id} />
          <p>
            Se desmarca para toda la casa.{" "}
            {payment.entry ? "También se borra el gasto dividido y lo que movió en tu cuenta." : payment.byMe && payment.recorded ? "También se borra ese movimiento de tu cuenta." : ""}
          </p>
          <Problem error={undo.error} />
          <div className="flex gap-2">
            <button type="button" className="btn-quiet" onClick={back}>
              Cancelar
            </button>
            <Send pending={undo.pending}>Sí, desmarcar</Send>
          </div>
        </form>
      )}
      {view === "record" && (
        <form onSubmit={record.submit} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="payment" value={payment.id} />
          <label className="field">
            Cuenta
            <SelectField name="account_id" options={choices} defaultValue={accounts[0].id} required />
          </label>
          <p className="text-xs text-ink-3">Si ese movimiento ya está en tu cuenta, no lo registres otra vez.</p>
          <Problem error={record.error} />
          <div className="flex gap-2">
            <button type="button" className="btn-quiet" onClick={back}>
              Cancelar
            </button>
            <Send pending={record.pending}>Registrar</Send>
          </div>
        </form>
      )}
    </li>
  );
}
