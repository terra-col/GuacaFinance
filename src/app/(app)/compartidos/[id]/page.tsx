import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, txIconName } from "@/components/icons";
import { Modal } from "@/components/modal";
import { AddPersonForm, DeleteEntryForm, DeleteGroupForm, ExpenseForm, InviteForm, RecordForm, SettlementForm } from "@/components/shared-forms";
import { loadData } from "@/lib/data";
import { favoriteAccountId, favoriteFirst, formatCOP, formatDate, holdsMoney, isAdjustment } from "@/lib/finance";
import { groupNets, memberOf, settleUp } from "@/lib/shared";

const SMALL = "text-xs font-semibold text-brand";

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dividir?: string }> }) {
  const { id } = await params;
  const { shared, accounts, txs, user, today } = await loadData();
  const group = shared.groups.find((g) => g.id === id);
  const me = memberOf(id, shared, user.id);
  if (!group || !me) notFound();

  const members = shared.members.filter((m) => m.group_id === id);
  const people = members.map(({ id, name }) => ({ id, name }));
  const name = new Map(members.map((m) => [m.id, m.name]));
  const entries = shared.entries.filter((e) => e.group_id === id);
  const shares = shared.shares.filter((s) => s.group_id === id);
  const nets = groupNets(id, shared);
  const transfers = settleUp(nets);
  const mine = nets.get(me.id) ?? 0;

  const option = (a: { id: string; name: string; favorite?: boolean }) => ({ value: a.id, label: a.name, star: Boolean(a.favorite) });
  const payable = favoriteFirst(accounts.filter((a) => a.kind !== "loan")).map(option);
  const money = favoriteFirst(accounts.filter(holdsMoney)).map(option);
  const favorite = favoriteAccountId(accounts) ?? "";
  // Only the links to movements that still exist.
  const linkOf = new Map(shared.links.map((l) => [l.entry_id, l.tx_id]));

  const { dividir } = await searchParams;
  const alreadyLinked = shared.links.some((l) => l.tx_id === dividir);
  const dividing = dividir && !alreadyLinked ? txs.find((t) => t.id === dividir && t.kind === "expense" && !isAdjustment(t)) : undefined;
  const form = { group: id, members: people, me: me.id, favorite, today };

  return (
    <>
      <div className="flex flex-col gap-3 pt-2">
        <Link href="/compartidos" className="text-sm font-medium text-brand">
          ‹ Compartidos
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display text-3xl break-words">{group.name}</h1>
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
            <Modal label="+ Gasto" title="Gasto compartido" buttonClass="btn h-11 rounded-2xl px-4 text-sm">
              <ExpenseForm {...form} accounts={payable} />
            </Modal>
          )}
        </div>
      </div>

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

      <section className="card" aria-labelledby="people-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="people-title" className="display text-2xl">
            Personas
          </h2>
          <Modal label="+ Agregar" title="Agregar persona" buttonClass="btn-quiet h-9 px-3 text-sm">
            <AddPersonForm group={id} />
          </Modal>
        </div>
        <ul className="mt-1 divide-y divide-line">
          {members.map((m) => {
            const net = nets.get(m.id) ?? 0;
            const inHistory = entries.some((e) => e.paid_by === m.id) || shares.some((s) => s.member_id === m.id);
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {m.name}
                    {m.id === me.id ? " (tú)" : ""}
                  </p>
                  {!m.user_id && (
                    <div className="flex flex-wrap gap-x-2 text-xs text-ink-3">
                      Sin cuenta
                      <Modal label="Invitar" title={`Invitar a ${m.name}`} buttonClass={SMALL}>
                        <InviteForm member={{ id: m.id, name: m.name }} groupName={group.name} removable={!inHistory} />
                      </Modal>
                    </div>
                  )}
                </div>
                <p className="shrink-0 text-right">
                  <span className="block text-xs text-ink-3">{net > 0 ? "le deben" : net < 0 ? "debe" : "al día"}</span>
                  {net !== 0 && <span className="num block font-semibold">{formatCOP(Math.abs(net))}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="entries-title">
        <h2 id="entries-title" className="display text-2xl">
          Gastos y pagos
        </h2>
        {entries.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">Todavía no hay nada. Agrega el primero con «+ Gasto».</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {entries.map((entry) => {
              const parts = shares.filter((s) => s.entry_id === entry.id);
              const settled = entry.kind === "settlement";
              const payer = entry.paid_by === me.id;
              const receiver = settled && parts[0]?.member_id === me.id;
              const ownPart = parts.find((s) => s.member_id === me.id)?.amount ?? 0;
              const tx = linkOf.get(entry.id);
              const canDelete = entry.created_by === user.id || (entry.created_by === null && payer);
              return (
                <li key={entry.id} className="flex items-start gap-3 py-3">
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
                    </p>
                    {!settled && <p className="num text-xs text-ink-2">{ownPart ? `Tu parte ${formatCOP(ownPart)}` : "No te toca"}</p>}
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {(payer || receiver) && !tx && (
                        <Modal label="Registrar en mi cuenta" title="Registrar en mi cuenta" buttonClass={SMALL}>
                          <RecordForm entry={entry.id} accounts={settled ? money : payable} favorite={favorite} />
                        </Modal>
                      )}
                      {canDelete && (
                        <Modal label="Borrar" title="Borrar del grupo" buttonClass="text-xs font-medium text-ink-3 hover:text-debt">
                          <DeleteEntryForm entry={entry.id} keepsMovement={Boolean(tx && shared.links.some((l) => l.tx_id === tx && l.created_tx === false))} />
                        </Modal>
                      )}
                    </div>
                  </div>
                  <p className="display num shrink-0 text-lg">{formatCOP(entry.amount)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {entries.length === 0 && group.created_by === user.id && <DeleteGroupForm group={id} />}
    </>
  );
}
