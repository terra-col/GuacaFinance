import Link from "next/link";
import { notFound } from "next/navigation";
import { Modal } from "@/components/modal";
import { GroupExit } from "@/components/group-exit";
import { GroupPeople } from "@/components/group-people";
import { ExpenseForm } from "@/components/expense-form";
import { EntryRow, entryScope } from "@/components/entry-list";
import { RenameGroupForm, SettlementForm } from "@/components/shared-forms";
import { loadData } from "@/lib/data";
import { formatCOP, isAdjustment } from "@/lib/finance";
import { groupTitle } from "@/lib/people";
import { groupNets, memberOf, settleUp } from "@/lib/shared";

const SMALL = "text-xs font-semibold text-brand";

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dividir?: string }> }) {
  const { id } = await params;
  const data = await loadData();
  const { shared, house, txs, user } = data;
  const group = shared.groups.find((g) => g.id === id);
  const me = memberOf(id, shared, user.id);
  const scope = group && me ? await entryScope(id, data) : null;
  if (!group || !me || !scope) notFound();

  const members = shared.members.filter((m) => m.group_id === id);
  const name = scope.name;
  const entries = shared.entries.filter((e) => e.group_id === id);
  const nets = groupNets(id, shared);
  const transfers = settleUp(nets);
  const mine = nets.get(me.id) ?? 0;
  const direct = Boolean(group.direct);
  const title = groupTitle(group, shared, user.id);
  const other = direct ? members.find((m) => m.id !== me.id) : undefined;
  const housePayments = house.payments.filter((p) => p.group_id === id);
  const { payable, money, form } = scope;

  const { dividir } = await searchParams;
  const alreadyLinked = shared.links.some((l) => l.tx_id === dividir);
  const dividing = dividir && !alreadyLinked ? txs.find((t) => t.id === dividir && t.kind === "expense" && !isAdjustment(t)) : undefined;

  const known = shared.editable;

  return (
    <>
      <div className="flex flex-col gap-3 pt-2">
        <Link href="/compartidos" className="text-sm font-medium text-brand">
          ‹ Compartidos
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display text-3xl break-words">{title}</h1>
            {other && (
              <Link href={`/compartidos/persona/${other.id}`} className={SMALL}>
                Solo ustedes dos · ver todo con {other.name}
              </Link>
            )}
            {group.house && (
              <Link href={`/pagos/casa/${id}`} className={`${SMALL} mr-3`}>
                Ver los recibos de la casa
              </Link>
            )}
            {known && !direct && (
              <Modal label="Editar grupo" title="Editar grupo" buttonClass={SMALL}>
                <RenameGroupForm group={id} name={group.name} />
              </Modal>
            )}
            <p className="text-sm text-ink-2">
              {mine === 0 ? (
                "Estás al día."
              ) : (
                <>
                  {mine > 0 ? "Te deben " : "Debes "}
                  <strong className="num text-ink">{formatCOP(Math.abs(mine))}</strong>
                </>
              )}
            </p>
          </div>
          {!dividing && (
            <Modal label="+ Anotar" title="Anotar" buttonClass="btn h-11 rounded-2xl px-4 text-sm">
              <ExpenseForm {...form} accounts={payable} />
            </Modal>
          )}
        </div>
      </div>

      <GroupPeople group={group} shared={shared} userId={user.id} paidHere={new Set(housePayments.map((p) => p.paid_by))} />

      {dividing && (
        <section className="card flex flex-col gap-4" aria-labelledby="split-title">
          <h2 id="split-title" className="display text-2xl">
            Dividir este gasto
          </h2>
          <ExpenseForm
            key={dividing.id}
            {...form}
            accounts={payable}
            tx={{ id: dividing.id, amount: dividing.amount, description: dividing.description, category: dividing.category, occurred_on: dividing.occurred_on }}
          />
        </section>
      )}

      {transfers.length > 0 && (
        <section className="card" aria-labelledby="settle-title">
          <h2 id="settle-title" className="display text-2xl">
            Para quedar al día
          </h2>
          <ul className="mt-1 divide-y divide-line">
            {transfers.map((t) => (
              <li key={`${t.from}-${t.to}-${t.amount}`} className="flex items-center justify-between gap-3 py-3">
                <p className="min-w-0 text-sm text-ink-2">
                  {t.from === me.id ? (
                    <>
                      Págale a <strong className="text-ink">{name.get(t.to)}</strong>
                    </>
                  ) : t.to === me.id ? (
                    <>
                      <strong className="text-ink">{name.get(t.from)}</strong> te paga
                    </>
                  ) : (
                    <>
                      <strong className="text-ink">{name.get(t.from)}</strong> le paga a <strong className="text-ink">{name.get(t.to)}</strong>
                    </>
                  )}
                  <span className="display num block text-lg text-ink">{formatCOP(t.amount)}</span>
                </p>
                <Modal label="Saldar" title="Registrar un pago" buttonClass="btn-quiet h-10 shrink-0 px-4 text-sm">
                  <SettlementForm {...form} accounts={money} transfer={t} />
                </Modal>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="entries-title">
        <h2 id="entries-title" className="display text-2xl">
          Gastos y pagos
        </h2>
        {entries.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">Todavía no hay nada. Agrega el primero con «+ Anotar».</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} scope={scope} data={data} />
            ))}
          </ul>
        )}
      </section>

      <GroupExit group={group} shared={shared} userId={user.id} hasPayments={housePayments.length > 0} canLeave={house.ready} />
    </>
  );
}
