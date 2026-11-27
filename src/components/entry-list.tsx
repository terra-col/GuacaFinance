import Link from "next/link";
import { Icon, txIconName } from "@/components/icons";
import { Modal } from "@/components/modal";
import { EntrySwipe } from "@/components/entry-swipe";
import { ExpenseForm } from "@/components/expense-form";
import { DeleteEntryForm, RecordForm, SettlementForm, type EditableEntry } from "@/components/shared-forms";
import type { loadData } from "@/lib/data";
import { accountForeign, favoriteAccountId, favoriteFirst, formatCOP, formatDate, holdsMoney } from "@/lib/finance";
import { memberOf, type SharedEntry } from "@/lib/shared";
import { parseSplit, splitTitle } from "@/lib/split";
import { formatForeign, isCurrency } from "@/lib/currency";

const SMALL = "text-xs font-semibold text-brand";

type Data = Pick<Awaited<ReturnType<typeof loadData>>, "supabase" | "shared" | "accounts" | "txs" | "user" | "today">;

/** What one group's entries need to be shown, edited and deleted. */
export interface EntryScope {
  me: string;
  name: Map<string, string>;
  /** Who was taken out: what was done with them stays as it was. */
  gone: Set<string>;
  form: { group: string; members: { id: string; name: string }[]; me: string; favorite: string; today: string };
  payable: { value: string; label: string; star: boolean }[];
  money: { value: string; label: string; star: boolean }[];
  /** Entries someone else also recorded in their own accounts. */
  recordedByOthers: Set<string>;
}

export async function entryScope(groupId: string, { supabase, shared, accounts, user, today }: Data): Promise<EntryScope | null> {
  const me = memberOf(groupId, shared, user.id);
  if (!me) return null;
  const members = shared.members.filter((m) => m.group_id === groupId);
  const option = (a: { id: string; name: string; favorite?: boolean }) => ({ value: a.id, label: a.name, star: Boolean(a.favorite) });
  const favorite = favoriteAccountId(accounts) ?? "";
  // Other people's links are theirs alone, so whether anyone else recorded it is asked to the database.
  const has = shared.entries.some((e) => e.group_id === groupId);
  const { data: recorded } = shared.editable && has ? await supabase.rpc("shared_recorded_by_others", { p_group: groupId }) : { data: null };
  return {
    me: me.id,
    name: new Map(members.map((m) => [m.id, m.name])),
    gone: new Set(members.filter((m) => m.removed_at).map((m) => m.id)),
    form: { group: groupId, members: members.filter((m) => !m.removed_at).map(({ id, name }) => ({ id, name })), me: me.id, favorite, today },
    // In pesos: accounts in another currency are not offered for shared expenses.
    payable: favoriteFirst(accounts.filter((a) => a.kind !== "loan" && !accountForeign(a))).map(option),
    money: favoriteFirst(accounts.filter((a) => holdsMoney(a) && !accountForeign(a))).map(option),
    recordedByOthers: new Set<string>((recorded as string[] | null) ?? []),
  };
}

/**
 * One expense or payment of a group, with Editar, Borrar and «Registrar en mi cuenta». The same
 * in a group and in a person's page. `net`: what it left between one and that person (their page
 * shows it in place of the total); `group`: the group it came from, when it is not their account
 * between two.
 */
export function EntryRow({ entry, scope, data, net, group }: { entry: SharedEntry; scope: EntryScope; data: Data; net?: number; group?: { id: string; name: string } }) {
  const { shared, txs, user } = data;
  const { me, name, gone, form, payable, money } = scope;
  const parts = shared.shares.filter((s) => s.entry_id === entry.id);
  const settled = entry.kind === "settlement";
  const payer = entry.paid_by === me;
  const receiver = settled && parts[0]?.member_id === me;
  const ownPart = parts.find((s) => s.member_id === me)?.amount ?? 0;
  const link = shared.links.find((l) => l.entry_id === entry.id);
  const tx = link?.tx_id;
  const direct = Boolean(shared.groups.find((g) => g.id === entry.group_id)?.direct);
  // With someone who left, it stays as it was.
  const frozen = gone.has(entry.paid_by) || parts.some((s) => gone.has(s.member_id));
  const canDelete = !frozen && (entry.created_by === user.id || (entry.created_by === null && payer));
  const editable: EditableEntry | null =
    shared.editable && !frozen && (entry.created_by === user.id || payer)
      ? {
          id: entry.id,
          amount: entry.amount,
          description: entry.description,
          category: entry.category,
          occurred_on: entry.occurred_on,
          paidBy: entry.paid_by,
          shares: Object.fromEntries(parts.map((s) => [s.member_id, s.amount])),
          split: entry.split,
          currency: entry.currency,
          original: entry.original_amount ? Number(entry.original_amount) : null,
          rate: entry.rate ? Number(entry.rate) : null,
          account: link && link.created_tx !== false ? (txs.find((t) => t.id === link.tx_id)?.account_id ?? null) : null,
          ownMovement: link?.created_tx === false,
          othersRecorded: scope.recordedByOthers.has(entry.id),
        }
      : null;

  return (
    <EntrySwipe canEdit={Boolean(editable)} canDelete={canDelete}>
      <span className={`badge shrink-0 ${settled ? "bg-brand/15" : "bg-debt/15"}`} aria-hidden="true">
        <Icon name={settled ? "payment" : txIconName({ kind: "expense", category: entry.category })} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold break-words">
          {settled ? `${payer ? "Pagaste" : `${name.get(entry.paid_by)} pagó`} a ${receiver ? "ti" : name.get(parts[0]?.member_id)}` : entry.description}
        </p>
        <p className="text-xs text-ink-3">
          {formatDate(entry.occurred_on)}
          {!settled && ` · ${payer ? "pagaste tú" : `pagó ${name.get(entry.paid_by)}`}`}
          {group && (
            <>
              {" · del grupo "}
              <Link href={`/compartidos/${group.id}`} className="font-semibold text-brand">
                {group.name}
              </Link>
            </>
          )}
        </p>
        {!settled && <p className="num text-xs text-ink-2">{ownPart ? `Tu parte ${formatCOP(ownPart)}` : "No te toca"}</p>}
        {!settled && (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer py-1 font-medium text-ink-3 hover:text-ink">Ver división</summary>
            <div className="rounded-xl bg-brand/6 px-2.5 py-2">
              {parseSplit(entry.split) && <p className="mb-1 text-ink-3">{splitTitle(parseSplit(entry.split)!.mode)}</p>}
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-ink-2">
                {parts.map((part) => (
                  <div key={part.member_id} className="contents">
                    <dt className="break-words">{part.member_id === me ? "Tú" : name.get(part.member_id)}</dt>
                    <dd className="num font-medium text-ink">{formatCOP(part.amount)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
        )}
        {frozen && <p className="text-xs text-ink-3">Con alguien que ya no está: queda como fue.</p>}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {(payer || receiver) && !tx && (
            <Modal label="Registrar en mi cuenta" title="Registrar en mi cuenta" buttonClass={SMALL}>
              <RecordForm entry={entry.id} accounts={settled ? money : payable} favorite={form.favorite} />
            </Modal>
          )}
          {editable && (
            <Modal label="Editar" action="edit" title={settled ? "Editar pago" : "Editar gasto"} buttonClass={SMALL}>
              {settled ? (
                <SettlementForm {...form} accounts={money} entry={editable} transfer={{ from: entry.paid_by, to: parts[0]?.member_id, amount: entry.amount }} />
              ) : (
                <ExpenseForm {...form} accounts={payable} entry={editable} />
              )}
            </Modal>
          )}
          {canDelete && (
            <Modal label="Borrar" action="delete" title={direct ? (settled ? "Borrar pago" : "Borrar gasto") : "Borrar del grupo"} buttonClass="text-xs font-medium text-ink-3 hover:text-debt">
              <DeleteEntryForm entry={entry.id} direct={direct} keepsMovement={Boolean(tx && shared.links.some((l) => l.tx_id === tx && l.created_tx === false))} />
            </Modal>
          )}
        </div>
      </div>
      {net === undefined ? (
        <p className="display num shrink-0 text-right text-lg">
          {formatCOP(entry.amount)}
          {isCurrency(entry.currency) && entry.currency !== "COP" && entry.original_amount && (
            <span className="block font-sans text-xs font-medium text-ink-3">{formatForeign(Number(entry.original_amount), entry.currency)}</span>
          )}
        </p>
      ) : (
        // Green when they owe it to one; red when one owes it to them. The words say it too.
        <p className="shrink-0 text-right" style={{ color: `color-mix(in oklab, var(--${net > 0 ? "savings" : "debt"}) ${net > 0 ? 55 : 60}%, var(--ink))` }}>
          <span className="block text-xs font-medium">{settled ? (net > 0 ? "le pagaste" : "te pagó") : net > 0 ? "te debe" : "le debes"}</span>
          <span className="display num block text-lg">
            {net > 0 ? "+" : "−"}
            {formatCOP(Math.abs(net))}
          </span>
        </p>
      )}
    </EntrySwipe>
  );
}

/** For whoever does not know the swipe; only on touch screens. */
export function SwipeHint() {
  return <p className="mt-2 hidden text-xs text-ink-3 [@media(pointer:coarse)]:block">También puedes deslizar un gasto o pago a la izquierda para editarlo o borrarlo.</p>;
}
