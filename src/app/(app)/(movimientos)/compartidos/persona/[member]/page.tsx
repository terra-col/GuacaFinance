import Link from "next/link";
import { notFound } from "next/navigation";
import { SharedBeam } from "@/components/balance-beam";
import { Modal } from "@/components/modal";
import { DeleteContactForm } from "@/components/remove-forms";
import { ExpenseForm } from "@/components/expense-form";
import { FoldSection, GroupMark } from "@/components/fold-section";
import { savePersonExpense } from "@/app/shared-actions";
import { profileName } from "@/lib/brand";
import { PENDING_ME, PENDING_OTHER } from "@/lib/people";
import { memberOf } from "@/lib/shared";
import { loadData } from "@/lib/data";
import { favoriteAccountId, favoriteFirst, formatCOP } from "@/lib/finance";
import { EntryRow, entryScope } from "@/components/entry-list";
import { formatPhone } from "@/lib/phone";
import { movesWith, peopleWith } from "@/lib/people";
import { groupNets } from "@/lib/shared";

/** One person: what is pending with them in all, and where it comes from. */
export default async function PersonPage({ params }: { params: Promise<{ member: string }> }) {
  const { member } = await params;
  const data = await loadData();
  const { shared, accounts, user, today } = data;
  const person = peopleWith(shared, user.id, { deletedToo: true }).find((p) => p.members.includes(member));
  if (!person) notFound();
  const directs = person.places.filter((p) => p.group.direct).map((p) => p.group.id);
  const account = directs.length
    ? {
        hasEntries: shared.entries.some((e) => directs.includes(e.group_id)),
        others: shared.members.some((m) => directs.includes(m.group_id) && m.user_id && m.user_id !== user.id),
        settled: directs.every((id) => [...groupNets(id, shared).values()].every((net) => net === 0)),
      }
    : null;
  const inGroups = person.places.filter((p) => !p.group.direct);
  const moves = movesWith(shared, user.id, person);
  const groupsOfMoves = [...new Set(moves.map((m) => m.group.id))];
  const scopes = new Map(await Promise.all(groupsOfMoves.map(async (id) => [id, await entryScope(id, data)] as const)));
  // The expense is written here; their account between two is only how it is kept.
  const mine = person.direct ? memberOf(person.direct, shared, user.id) : undefined;
  const two =
    person.direct && mine
      ? { group: person.direct, me: mine.id, members: shared.members.filter((m) => m.group_id === person.direct && !m.removed_at).map(({ id, name }) => ({ id, name })) }
      : { group: "", me: PENDING_ME, members: [{ id: PENDING_ME, name: profileName(user) || "Tú" }, { id: PENDING_OTHER, name: person.name }] };
  const payable = favoriteFirst(accounts.filter((a) => a.kind !== "loan")).map((a) => ({ value: a.id, label: a.name, star: Boolean(a.favorite) }));

  return (
    <>
      <div className="flex flex-col gap-3 pt-2">
        <Link href="/compartidos" className="text-sm font-medium text-brand">
          ‹ Compartidos
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display break-words text-3xl">{person.name}</h1>
            {person.phone && <p className="num text-sm text-ink-3">{formatPhone(person.phone)}</p>}
          </div>
          {shared.removable && (
            <Modal label="Eliminar contacto" title={`Eliminar a ${person.name}`} buttonClass="btn-quiet h-10 px-3 text-sm hover:text-debt">
              <DeleteContactForm
                member={person.member}
                name={person.name}
                pendingIn={inGroups.filter((p) => p.net !== 0).map((p) => ({ name: p.group.name, net: p.net }))}
                groups={inGroups.map((p) => p.group.name)}
                account={account}
              />
            </Modal>
          )}
        </div>
      </div>

      <SharedBeam
        name={person.name}
        owed={person.places.reduce((sum, p) => sum + Math.max(0, p.net), 0)}
        owes={person.places.reduce((sum, p) => sum + Math.max(0, -p.net), 0)}
      />


      <section className="card" aria-labelledby="moves-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="moves-title" className="display text-2xl">
            Gastos y pagos
          </h2>
          {(person.direct || shared.social) && (
            <Modal label="+ Anotar" title={`Anotar con ${person.name}`} buttonClass="btn h-10 shrink-0 rounded-2xl px-4 text-sm">
              <ExpenseForm {...two} person={person.member} accounts={payable} favorite={favoriteAccountId(accounts) ?? ""} today={today} action={savePersonExpense} />
            </Modal>
          )}
        </div>
        {moves.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">Todavía no hay gastos ni pagos entre ustedes.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line" data-moves>
            {/* The same rows as in a group: Editar, Borrar and «Registrar en mi cuenta» right here. */}
            {moves.map((m) => {
              const scope = scopes.get(m.group.id);
              return scope && <EntryRow key={m.id} entry={m.entry} scope={scope} data={data} net={m.net} group={m.group.direct ? undefined : m.group} />;
            })}
          </ul>
        )}
        {inGroups.length > 0 && moves.length > 0 && <p className="mt-2 text-xs text-ink-3">En los grupos las deudas se cruzan entre todos, así que el total puede no ser la suma.</p>}
      </section>

      {inGroups.length > 0 && (
        <FoldSection kind="groups" title="En qué grupos están" count={inGroups.length}>
          <ul className="flex flex-col gap-2" aria-label="Grupos en común">
            {inGroups.map(({ group, net }) => (
              <li key={group.id}>
                <Link href={`/compartidos/${group.id}`} className="flex items-center gap-3 rounded-2xl border border-line-strong px-3 py-2.5 transition-colors hover:border-brand">
                  <GroupMark house={Boolean(group.house)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{group.name}</span>
                    <span className="num block text-xs text-ink-3">{net > 0 ? `te debe ${formatCOP(net)}` : net < 0 ? `le debes ${formatCOP(-net)}` : "al día"}</span>
                  </span>
                  <span className="shrink-0 text-brand" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </FoldSection>
      )}
    </>
  );
}
