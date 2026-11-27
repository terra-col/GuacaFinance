"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteTx } from "@/app/actions";
import { accountForeign, formatCOP, formatDate, isAdjustment, isDebt, monthName, relativeDay, daysBetween, type Account, type Tx, type TxKind } from "@/lib/finance";
import type { SharedMark } from "@/lib/shared";
import { Icon, txIconName } from "./icons";
import { formatForeign, isCurrency } from "@/lib/currency";
import { Sheet } from "./modal";
import { TxForm } from "./tx-form";
import { SubmitButton } from "./submit-button";
import { SwipeRow } from "./swipe-row";

type Filter = TxKind | "all" | "adjustment";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "expense", label: "Gastos" },
  { value: "payment", label: "Pagos" },
  { value: "income", label: "Ingresos" },
  { value: "transfer", label: "Traslados" },
  { value: "adjustment", label: "Ajustes" },
];

// An adjustment only corrects a balance, so it looks like neither money in nor money out.
const ADJUSTED = { label: "Ajuste", stripe: "var(--line-strong)", tint: "bg-brand/8" };

// Settling up moves money and is neither spending nor income.
const SETTLED = { label: "Pago compartido", stripe: "var(--brand)", tint: "bg-brand/15" };
const NOTHING_SHARED: Record<string, SharedMark> = {};

// Each kind has its own stripe, tint and word, so it reads without relying on colour alone.
const LOOK: Record<TxKind, { label: string; stripe: string; tint: string; sign: string }> = {
  expense: { label: "Gasto", stripe: "var(--debt)", tint: "bg-debt/15", sign: "−" },
  payment: { label: "Pago a deuda", stripe: "var(--brand)", tint: "bg-brand/15", sign: "−" },
  income: { label: "Ingreso", stripe: "var(--savings)", tint: "bg-savings/15", sign: "+" },
  // Between one's own accounts: neither money in nor money out.
  transfer: { label: "Traslado", stripe: "var(--line-strong)", tint: "bg-brand/8", sign: "" },
};

const PAGE = 60;



/**
 * `showAdjustments`: «Todos» includes them (an account's own history, where they explain its
 * balance). Otherwise they stay apart, under «Ajustes».
 */
export function TxList({
  txs,
  accounts,
  today,
  showAdjustments = false,
  shared = NOTHING_SHARED,
}: {
  txs: Tx[];
  accounts: Pick<Account, "id" | "name" | "kind" | "currency">[];
  today: string;
  showAdjustments?: boolean;
  /** The movements that are the money of a shared entry. */
  shared?: Record<string, SharedMark>;
}) {
  const accountNames = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const [editing, setEditing] = useState<Tx | null>(null);
  const router = useRouter();
  // A shared one is edited in its group.
  const edit = (tx: Tx) => (shared[tx.id]?.groupId ? router.push(`/compartidos/${shared[tx.id].groupId}`) : setEditing(tx));
  const closeEditor = useCallback(() => setEditing(null), []);
  // Only one row stays swiped open at a time.
  const [swiped, setSwiped] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  // Deleting asks for a second tap on the same row, which expires after a few seconds.
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const title = (tx: Tx) =>
    tx.checkpoint !== null && tx.checkpoint !== undefined
      ? `Saldo del banco · ${accountNames[tx.account_id] ?? "cuenta"}`
      : isAdjustment(tx)
      ? `Ajuste de saldo · ${accountNames[tx.account_id] ?? "cuenta"}`
      : tx.kind === "payment" ? `Pago a ${accountNames[tx.account_id] ?? "cuenta"}` : tx.kind === "transfer" ? (tx.description ?? `A ${accountNames[tx.account_id] ?? "cuenta"}`) : (tx.description ?? (tx.kind === "income" ? "Ingreso" : (tx.category ?? "Gasto")));
  const detail = (tx: Tx) =>
    isAdjustment(tx) ? (tx.description ?? "") : [
      shared[tx.id]?.kind === "expense" ? `tu parte ${formatCOP(shared[tx.id].mine)}` : null,
      tx.kind === "expense" && tx.description ? tx.category : null,
      tx.kind === "transfer"
        ? `${accountNames[tx.source_account_id ?? ""] ?? "cuenta"} → ${accountNames[tx.account_id] ?? "cuenta"}`
        : tx.kind === "payment" ? (tx.source_account_id ? `desde ${accountNames[tx.source_account_id]}` : null) : accountNames[tx.account_id],
      tx.kind === "payment" ? tx.description : null,
      tx.source === "wallet" ? "Apple Wallet" : null,
      tx.for_month ? `cuenta para ${monthName(tx.for_month)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  // An adjustment's sign says which way the balance moved: on a debt, «+» is owing more.
  const sign = (tx: Tx) => {
    // A checkpoint is the balance itself, not a difference.
    if (tx.checkpoint !== null && tx.checkpoint !== undefined) return "";
    if (!isAdjustment(tx)) return LOOK[tx.kind].sign;
    const account = accounts.find((a) => a.id === tx.account_id);
    return tx.kind === "income" || (tx.kind === "expense" && account && isDebt(account)) ? "+" : "−";
  };
  // An account in another currency keeps the bank's balance in cents of it.
  const checkpointText = (tx: Tx) => {
    if (tx.checkpoint === null || tx.checkpoint === undefined) return null;
    const code = accountForeign(accounts.find((a) => a.id === tx.account_id) ?? {});
    return code ? formatForeign(tx.checkpoint / 100, code) : formatCOP(tx.checkpoint);
  };
  const inFilter = useCallback(
    (tx: Tx, f: Filter) => {
      if (isAdjustment(tx)) return f === "adjustment" || (f === "all" && showAdjustments);
      if (shared[tx.id]?.kind === "settlement") return f === "all";
      return f === "all" || f === tx.kind;
    },
    [showAdjustments, shared],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txs.filter(
      (tx) =>
        inFilter(tx, filter) &&
        (!q || [tx.description, tx.category, accountNames[tx.account_id]].some((field) => field?.toLowerCase().includes(q))),
    );
  }, [txs, filter, query, accountNames, inFilter]);

  const days = useMemo(() => {
    const groups: { date: string; items: Tx[]; out: number; inn: number }[] = [];
    for (const tx of matches.slice(0, limit)) {
      let group = groups[groups.length - 1];
      if (!group || group.date !== tx.occurred_on) groups.push((group = { date: tx.occurred_on, items: [], out: 0, inn: 0 }));
      group.items.push(tx);
      const mark = shared[tx.id];
      if (isAdjustment(tx) || mark?.kind === "settlement") continue;
      if (tx.kind === "income") group.inn += tx.amount;
      else if (tx.kind === "expense") group.out += mark ? mark.mine : tx.amount;
    }
    return groups;
  }, [matches, limit, shared]);

  const dayLabel = (date: string) => {
    const diff = daysBetween(today, date);
    return diff === 0 ? "Hoy" : diff === -1 ? "Ayer" : formatDate(date);
  };

  let position = 0;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filtrar por tipo">
          {FILTERS.map((f) => {
            const count = txs.filter((t) => inFilter(t, f.value)).length;
            if (f.value === "adjustment" && count === 0 && filter !== f.value) return null;
            return (
              <button key={f.value} type="button" className="chip shrink-0" aria-pressed={filter === f.value} onClick={() => { setFilter(f.value); setLimit(PAGE); }}>
                {f.label} <span className="num opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        <input
          className="input min-w-0 sm:max-w-80"
          type="search"
          placeholder="Buscar movimientos"
          aria-label="Buscar movimientos"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
        />
      </div>

      {days.length === 0 ? (
        <p className="card text-sm text-ink-3">{txs.length === 0 ? "Aún no hay movimientos." : "Nada coincide con ese filtro."}</p>
      ) : (
        // Re-keying on the filter replays the entrance animation for the new set.
        <div key={`${filter}|${query}`} className="flex flex-col gap-4">
          <p className="hidden text-xs text-ink-3 [@media(pointer:coarse)]:block">También puedes deslizar un movimiento a la izquierda para editarlo o borrarlo.</p>
          {days.map((day) => (
            <div key={day.date} className="card rise overflow-hidden p-0 sm:p-0" style={{ "--i": position } as React.CSSProperties}>
              <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
                <h3 className="text-sm font-medium" title={relativeDay(daysBetween(today, day.date))}>{dayLabel(day.date)}</h3>
                <p className="flex gap-1.5">
                  {day.inn > 0 && <span className="pill num bg-savings/15">+{formatCOP(day.inn)}</span>}
                  {day.out > 0 && <span className="pill num bg-debt/15">−{formatCOP(day.out)}</span>}
                </p>
              </div>
              <ul>
                {day.items.map((tx) => {
                  const look = isAdjustment(tx) ? ADJUSTED : shared[tx.id]?.kind === "settlement" ? SETTLED : LOOK[tx.kind];
                  // An adjustment's amount belongs to a correction.
                  const locked = isAdjustment(tx);
                  return (
                    <SwipeRow
                      key={tx.id}
                      open={swiped === tx.id}
                      onOpen={() => setSwiped(tx.id)}
                      onClose={() => setSwiped((id) => (id === tx.id ? null : id))}
                      className="rise"
                      style={{ "--i": position++ } as React.CSSProperties}
                      rowClassName="group flex items-center gap-3 py-3 pl-5 pr-2 hover:bg-brand/5 sm:pr-5"
                      actions={
                        <>
                          <button
                            type="button"
                            className="swipe-action bg-brand"
                            disabled={locked}
                            onClick={() => { setSwiped(null); edit(tx); }}
                          >
                            <Icon name="edit" className="size-5" />
                            Editar
                          </button>
                          <form action={deleteTx} className="contents">
                            <input type="hidden" name="id" value={tx.id} />
                            <SubmitButton className="swipe-action bg-debt">
                              <span className="flex flex-col items-center gap-0.5">
                                <Icon name="trash" className="size-5" />
                                Borrar
                              </span>
                            </SubmitButton>
                          </form>
                        </>
                      }
                    >
                      <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-r-full" style={{ background: look.stripe }} />
                      <span className={`badge ${look.tint}`} aria-hidden="true">
                        <Icon name={txIconName(tx)} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{title(tx)}</p>
                        <p className="truncate text-sm text-ink-3">
                          {/* Phones have little room: the stripe, icon and sign already tell the kind there. */}
                          <span className="font-medium text-ink-2 max-sm:sr-only">{look.label}</span>
                          <span className="max-sm:hidden">{detail(tx) ? " · " : ""}</span>
                          {detail(tx)}
                        </p>
                        {/* Touch: the same actions in words, as in a group's entries, for whoever does not know the swipe. */}
                        <span className="mt-0.5 hidden gap-4 [@media(pointer:coarse)]:flex">
                          {!locked && (
                            <button type="button" onClick={() => edit(tx)} className="py-1 text-xs font-semibold text-brand" aria-label={`Editar ${title(tx)} del ${formatDate(tx.occurred_on)}`}>
                              Editar
                            </button>
                          )}
                          {armed === tx.id ? (
                            <form action={deleteTx} className="rise">
                              <input type="hidden" name="id" value={tx.id} />
                              <SubmitButton className="py-1 text-xs font-semibold text-debt" aria-label={`Confirmar: borrar ${title(tx)}`}>
                                Sí, borrar
                              </SubmitButton>
                            </form>
                          ) : (
                            <button type="button" onClick={() => setArmed(tx.id)} className="py-1 text-xs font-medium text-ink-3" aria-label={`Eliminar ${title(tx)} del ${formatDate(tx.occurred_on)}`}>
                              Borrar
                            </button>
                          )}
                        </span>
                      </div>
                      <p className={`display num shrink-0 rounded-xl px-2 py-0.5 text-lg ${isAdjustment(tx) ? "text-ink-3" : tx.kind === "income" ? "bg-savings/15" : ""}`}>
                        {sign(tx)}
                        {checkpointText(tx) ?? formatCOP(tx.amount)}
                        {isCurrency(tx.currency) && tx.currency !== "COP" && tx.original_amount && (
                          <span className="block text-right font-sans text-xs font-medium text-ink-3">{formatForeign(Number(tx.original_amount), tx.currency)}</span>
                        )}
                      </p>
                      {/* Mouse and keyboard: the same actions, shown on hover or focus. Touch uses the swipe. */}
                      <span className="flex shrink-0 gap-0.5 [@media(pointer:coarse)]:hidden">
                        {!locked ? (
                          <button
                            type="button"
                            onClick={() => edit(tx)}
                            className="row-tool"
                            aria-label={`Editar ${title(tx)} del ${formatDate(tx.occurred_on)}`}
                          >
                            <Icon name="edit" className="size-4" />
                          </button>
                        ) : (
                          // Adjustments are not edited, but keep the room so every amount lines up.
                          <span className="row-tool invisible" aria-hidden="true">
                            <Icon name="edit" className="size-4" />
                          </span>
                        )}
                        {armed === tx.id ? (
                          <form action={deleteTx} className="rise">
                            <input type="hidden" name="id" value={tx.id} />
                            <SubmitButton className="pill pill-urgent py-1.5 text-xs" aria-label={`Confirmar: borrar ${title(tx)}`}>
                              Borrar
                            </SubmitButton>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setArmed(tx.id)}
                            className="row-tool"
                            aria-label={`Eliminar ${title(tx)} del ${formatDate(tx.occurred_on)}`}
                          >
                            <Icon name="trash" className="size-4" />
                          </button>
                        )}
                      </span>
                    </SwipeRow>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Sheet open={editing !== null} onClose={closeEditor} title="Editar movimiento">
        {editing && <TxForm key={editing.id} accounts={accounts} today={today} tx={editing} onDone={closeEditor} />}
      </Sheet>

      {matches.length > limit && (
        <button type="button" className="btn-quiet self-center" onClick={() => setLimit(limit + PAGE)}>
          Ver más ({matches.length - limit} restantes)
        </button>
      )}
    </section>
  );
}

