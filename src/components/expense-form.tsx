"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { saveSharedExpense, type SharedResult } from "@/app/shared-actions";
import { formatCOP } from "@/lib/finance";
import { splitOf } from "@/lib/split";
import { DateField } from "./date-field";
import { useCloseModal } from "./modal";
import { MoneyInput } from "./money-input";
import { CategoryField, SelectField, type PickOption } from "./pickers";
import { NO_ACCOUNT, Problem, Send, useSave, type EditableEntry } from "./shared-forms";
import { SplitPanel, draftShares, draftSplit, newDraft, splitSummary } from "./split-panel";

/**
 * A group's expense: what it was and how much, then one row with who paid and how it is divided,
 * which opens its own view in the same window. Creates, edits, and divides a movement one already had.
 */
export function ExpenseForm({
  group,
  members,
  me,
  accounts,
  favorite,
  today,
  tx,
  entry,
  action = saveSharedExpense,
  person,
}: {
  /** "" when it is with one person and their account is opened on saving. */
  group: string;
  /** Who to open that account with. */
  person?: string;
  action?: (form: FormData) => Promise<SharedResult>;
  members: { id: string; name: string }[];
  me: string;
  accounts: PickOption[];
  favorite: string;
  today: string;
  entry?: EditableEntry;
  /** A movement the person already had and now divides: its amount and payer are fixed. */
  tx?: { id: string; amount: number; description: string | null; category: string | null; occurred_on: string };
}) {
  const router = useRouter();
  const close = useCloseModal();
  const [amount, setAmount] = useState(tx?.amount ?? entry?.amount ?? 0);
  const [draft, setDraft] = useState(() =>
    newDraft(members, entry?.paidBy ?? me, entry && splitOf(entry.amount, entry.shares, entry.split, members.map((m) => m.id))),
  );
  const [splitting, setSplitting] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const divided = useRef(false);
  useEffect(() => {
    if (splitting) divided.current = true;
    else if (divided.current) opener.current?.focus();
  }, [splitting]);
  const { pending, error, submit } = useSave(action, () => {
    close();
    if (tx) router.replace(`/compartidos/${group}`);
  });

  // Someone else already moved their money with it: who paid and how much stay.
  const fixed = Boolean(entry?.othersRecorded);
  const { paidBy } = draft;
  const summary = splitSummary(draft, amount, members, me);
  const ready = !amount || draftShares(draft, amount) !== null;

  return (
    <form
      onSubmit={submit}
      // Enter inside the split view would send the expense.
      onKeyDown={(e) => {
        if (splitting && e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="group" value={group} />
      {person && <input type="hidden" name="person" value={person} />}
      <input type="hidden" name="paid_by" value={paidBy} />
      <input type="hidden" name="split" value={JSON.stringify(draftSplit(draft))} />
      {entry && <input type="hidden" name="entry" value={entry.id} />}
      {(fixed || tx) && <input type="hidden" name="amount" value={amount} />}
      {tx && <input type="hidden" name="tx" value={tx.id} />}

      {splitting && <SplitPanel amount={amount} members={members} me={me} draft={draft} onChange={setDraft} onClose={() => setSplitting(false)} fixedPayer={fixed || Boolean(tx)} />}

      {/* Stays in the page while dividing, so nothing typed is lost. */}
      <div hidden={splitting} className="flex flex-col gap-4">
        {fixed && (
          <p className="text-sm text-ink-2">
            Son <strong className="num text-ink">{formatCOP(amount)}</strong>. Otra persona ya lo registró en su cuenta, así que el valor y quién pagó no cambian.
          </p>
        )}
        {tx && (
          <p className="text-sm text-ink-2">
            Pagaste <strong className="num text-ink">{formatCOP(tx.amount)}</strong>. El movimiento sigue igual en tu cuenta; como gasto solo contará tu parte.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            Qué fue
            <input className="input" name="description" defaultValue={entry?.description ?? tx?.description ?? ""} placeholder="Cena, arriendo, mercado…" maxLength={120} autoComplete="off" required />
          </label>
          {!tx && !fixed && (
            <label className="field">
              Cuánto fue
              <MoneyInput name="amount" defaultValue={entry?.amount} onValue={setAmount} required />
            </label>
          )}
        </div>

        <button ref={opener} type="button" data-split-open className="flex w-full items-center gap-3 rounded-2xl border border-line-strong bg-brand/8 p-3.5 text-left" onClick={() => setSplitting(true)}>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{summary.title}</span>
            <span className="num block text-sm text-ink-2" style={summary.style}>
              {summary.detail}
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-brand">Cambiar ›</span>
        </button>

        <div className="grid gap-4 sm:grid-cols-2">
          {!tx && paidBy === me && !entry?.ownMovement && (
            <label className="field">
              De qué cuenta salió
              <SelectField name="account_id" options={entry?.account ? accounts : [...accounts, NO_ACCOUNT]} defaultValue={entry ? (entry.account ?? "") : favorite} />
            </label>
          )}
          <label className="field">
            Fecha
            <DateField name="occurred_on" defaultValue={entry?.occurred_on ?? tx?.occurred_on ?? today} max={today} required />
          </label>
          <label className="field">
            Categoría
            <CategoryField name="category" defaultValue={entry ? (entry.category ?? "") : tx ? (tx.category ?? "") : "Otros"} />
          </label>
        </div>

        {entry?.account && paidBy !== me && <p className="text-sm text-ink-2">Como ya no pagaste tú, se borra el movimiento que esto creó en tu cuenta.</p>}
        {entry?.ownMovement && paidBy !== me && <p className="text-sm text-ink-2">Como ya no pagaste tú, tu movimiento se conserva como un gasto normal.</p>}
        {entry?.ownMovement && paidBy === me && amount !== entry.amount && <p className="text-sm text-ink-2">El movimiento de tu cuenta también cambia a {formatCOP(amount)}.</p>}
        <Problem error={error} />
        <Send pending={pending} disabled={!ready}>
          {entry ? "Guardar cambios" : "Dividir"}
        </Send>
      </div>
    </form>
  );
}
