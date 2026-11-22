import Link from "next/link";
import { notFound } from "next/navigation";
import { SharedBeam } from "@/components/balance-beam";
import { Modal } from "@/components/modal";
import { DeleteContactForm } from "@/components/remove-forms";
import { DirectButton } from "@/components/shared-forms";
import { loadData } from "@/lib/data";
import { formatCOP, formatDate } from "@/lib/finance";
import { formatPhone } from "@/lib/phone";
import { movesWith, peopleWith } from "@/lib/people";
import { groupNets } from "@/lib/shared";

/** One person: what is pending with them in all, and where it comes from. */
export default async function PersonPage({ params }: { params: Promise<{ member: string }> }) {
  const { member } = await params;
  const { shared, user } = await loadData();
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

      {shared.social && !person.direct && <DirectButton member={person.member}>+ Gasto solo entre ustedes dos</DirectButton>}

      <section className="card" aria-labelledby="moves-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="moves-title" className="display text-2xl">
            Gastos y pagos
          </h2>
          {person.direct && (
            <Link href={`/compartidos/${person.direct}`} className="btn-quiet h-9 shrink-0 px-3 text-sm">
              + Gasto
            </Link>
          )}
        </div>
        {moves.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">Todavía no hay gastos ni pagos entre ustedes.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line" data-moves>
            {moves.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{m.kind === "settlement" ? "Pago para saldar" : m.description}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {formatDate(m.on)}
                    {!m.group.direct && (
                      <>
                        {" · del grupo "}
                        <Link href={`/compartidos/${m.group.id}`} className="font-semibold text-brand">
                          {m.group.name}
                        </Link>
                      </>
                    )}
                  </span>
                </span>
                {/* Green when they owe it to one; red when one owes it to them. The words say it too. */}
                <span className="shrink-0 text-right" style={{ color: `color-mix(in oklab, var(--${m.net > 0 ? "savings" : "debt"}) ${m.net > 0 ? 55 : 60}%, var(--ink))` }}>
                  <span className="block text-xs font-medium">{m.kind === "settlement" ? (m.net > 0 ? "le pagaste" : "te pagó") : m.net > 0 ? "te debe" : "le debes"}</span>
                  <span className="num block font-semibold">
                    {m.net > 0 ? "+" : "−"}
                    {formatCOP(Math.abs(m.net))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {inGroups.length > 0 && moves.length > 0 && <p className="mt-2 text-xs text-ink-3">En los grupos las deudas se cruzan entre todos, así que el total puede no ser la suma.</p>}
      </section>

      {inGroups.length > 0 && (
        <section className="card" aria-labelledby="common-title">
          <h2 id="common-title" className="display text-2xl">
            En qué grupos están
          </h2>
          <ul className="mt-1 divide-y divide-line">
            {inGroups.map(({ group, net }) => (
              <li key={group.id}>
                <Link href={`/compartidos/${group.id}`} className="flex items-center justify-between gap-3 py-3.5">
                  <span className="min-w-0 truncate font-semibold">{group.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs text-ink-3">{net > 0 ? "te debe" : net < 0 ? "le debes" : "al día"}</span>
                    {net !== 0 && <span className="num block font-semibold">{formatCOP(Math.abs(net))}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
