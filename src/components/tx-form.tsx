"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { saveTx, type FormState } from "@/app/actions";
import { divideMovement } from "@/app/shared-actions";
import { contactPhone } from "@/lib/contacts";
import { DateField } from "./date-field";
import { AmountField } from "./amount-field";
import { isCurrency } from "@/lib/currency";
import { CategoryField, SelectField, type PickOption } from "./pickers";
import { useSharedReady } from "./shared-ready";
import { SplitPanel, draftShares, draftSplit } from "./split-panel";
import { SplitWith, type Dividing } from "./split-with";
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
  const sharedReady = useSharedReady();
  const router = useRouter();
  const [split, setSplit] = useState(false);
  const [dividing, setDividing] = useState<Dividing | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [amount, setAmount] = useState(tx?.amount ?? 0);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [kind, setKind] = useState<TxKind>(tx?.kind ?? "expense");
  const divides = !tx && split && kind === "expense";
  const otherPays = Boolean(divides && dividing && dividing.draft.paidBy !== dividing.target.me);
  const [state, action] = useActionState<FormState, FormData>(
    async (prev: FormState, form: FormData) => {
      const chosen = divides ? dividing : null;
      if (chosen && chosen.draft.paidBy !== chosen.target.me) {
        // Not one's money: an expense of theirs, never a movement of one's own.
        const order = new FormData();
        for (const key of ["amount", "occurred_on", "category", "description", "phone", "currency", "original", "rate", "currencies"]) order.set(key, String(form.get(key) ?? ""));
        order.set("name", String(form.get("person") ?? ""));
        order.set("group", chosen.target.group ?? "");
        order.set("person", chosen.target.person ?? "");
        order.set("paid_by", chosen.draft.paidBy);
        order.set("split", JSON.stringify(draftSplit(chosen.draft)));
        const { error } = await divideMovement(order);
        if (error) return { error };
        onDone?.("Anotado. Tus cuentas no se movieron.");
        return {};
      }
      const result = await saveTx(prev, form);
      if (result.error) return result;
      let message = result.message ?? "Guardado.";
      if (chosen && result.id) {
        const order = new FormData();
        order.set("tx", result.id);
        order.set("split", JSON.stringify(draftSplit(chosen.draft)));
        order.set("group", chosen.target.group ?? "");
        order.set("person", chosen.target.person ?? "");
        order.set("name", String(form.get("person") ?? ""));
        order.set("phone", String(form.get("phone") ?? ""));
        let divided = false;
        try {
          divided = !(await divideMovement(order)).error;
        } catch {
          // No connection: the movement is saved all the same.
        }
        message = divided ? "Registrado y dividido." : "Registrado. Falta dividirlo.";
        // It stays saved: what is left is choosing again, never recording it twice.
        if (!divided) router.push(`/compartidos?dividir=${result.id}`);
      }
      onDone?.(message);
      return result;
    },
    {},
  );
  const editing = Boolean(tx);
  // Keep the original values when the person flips back to the movement's own kind.
  const own = tx && kind === tx.kind ? tx : undefined;
  // The favourite account first, and already chosen for a new expense or payment.
  const targets = favoriteFirst(accounts.filter((a) => allowedTxKinds(a.kind).includes(kind)));
  const savings = favoriteFirst(accounts.filter((a) => a.kind === "savings" || a.kind === "cash"));
  const favorite = favoriteAccountId(accounts);

  return (
    // Lives inside a sheet (new or edit), so it has no card or title of its own.
    <form
      action={action}
      // Checked before sending: once sent, React empties the date and the note.
      onSubmit={(e) => {
        let problem: string | null = null;
        if (divides && !dividing) problem = "Elige con quién lo divides.";
        else if (divides && dividing && !dividing.target.group && !dividing.target.person) {
          const typed = new FormData(e.currentTarget);
          if (!String(typed.get("person") ?? "").trim()) problem = "Escribe el nombre de la persona.";
          else if (contactPhone(String(typed.get("phone") ?? "")) === "invalid") problem = "Revisa el celular de la persona.";
        }
        setInvalid(problem);
        if (problem) e.preventDefault();
      }}
      // Enter inside the split view would record the movement.
      onKeyDown={(e) => {
        if (splitting && e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      className="flex flex-col gap-4"
    >
      {splitting && dividing && (
        <SplitPanel
          amount={amount}
          members={dividing.target.members}
          me={dividing.target.me}
          draft={dividing.draft}
          onChange={(draft) => setDividing({ target: dividing.target, draft })}
          onClose={() => setSplitting(false)}
          fixedPayer={false}
        />
      )}
      <div hidden={splitting} className="flex flex-col gap-4">
      {editing && <input type="hidden" name="id" value={tx!.id} />}
      <AmountField
        hero
        label={kind === "income" ? "¿Cuánto llegó?" : kind === "payment" ? "¿Cuánto pagaste?" : "¿Cuánto fue?"}
        defaultValue={tx?.amount}
        currency={isCurrency(tx?.currency) ? tx.currency : "COP"}
        original={tx?.original_amount ? Number(tx.original_amount) : null}
        rate={tx?.rate ? Number(tx.rate) : null}
        onValue={setAmount}
        required
      />
      {editing ? (
        <input type="hidden" name="kind" value={kind} />
      ) : (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Tipo de movimiento</legend>
          {KIND_OPTIONS.map((option) => (
            <label
              key={option.kind}
              className="month-chip px-3.5"
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
              Fecha
              <DateField name="occurred_on" defaultValue={tx?.occurred_on ?? today} max={today} required />
            </label>
            {/* key: the option list changes with the kind, so the select starts fresh */}
            {otherPays && <p className="self-end text-sm text-ink-2">Como pagó otra persona, tus cuentas no se mueven.</p>}
            {!otherPays && (
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
            )}
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
          {sharedReady && kind === "expense" &&
            (editing ? (
              <Link href={`/compartidos?dividir=${tx!.id}`} className="self-start text-sm font-semibold text-brand">
                Dividir este gasto
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  className="chip self-start"
                  aria-pressed={split}
                  onClick={() => {
                    setSplit(!split);
                    setDividing(null);
                  }}
                >
                  {split ? "✓ " : ""}Con alguien más
                </button>
                {split && <SplitWith value={dividing} onChange={setDividing} amount={amount} onOpenSplit={() => setSplitting(true)} />}
              </>
            ))}
          {(invalid ?? state.error) && (
            <p role="alert" className="alert">
              {invalid ?? state.error}
            </p>
          )}
          {state.message && (
            <p role="status" className="text-sm text-ink-2">
              {state.message}
            </p>
          )}
          {divides && dividing && amount > 0 && !draftShares(dividing.draft, amount) ? (
            <p role="alert" className="alert">
              La división no cuadra con el monto: tócala para revisarla.
            </p>
          ) : (
            <SubmitButton className="btn self-start" disabled={divides && !dividing}>{editing ? "Guardar cambios" : divides ? "Registrar y dividir" : "Registrar"}</SubmitButton>
          )}
        </>
      )}
      </div>
    </form>
  );
}
