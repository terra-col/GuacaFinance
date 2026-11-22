import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, txIconName } from "@/components/icons";
import { Modal } from "@/components/modal";
import { PeopleSection } from "@/components/people-section";
import { RemovePersonForm, RestorePersonButton } from "@/components/remove-forms";
import { ExpenseForm } from "@/components/expense-form";
import { AddPersonForm, DeleteEntryForm, DeleteGroupForm, EditPersonForm, InviteForm, RecordForm, RenameGroupForm, SettlementForm, type EditableEntry } from "@/components/shared-forms";
import { knownPeople } from "@/lib/contacts";
import { loadData } from "@/lib/data";
import { favoriteAccountId, favoriteFirst, formatCOP, formatDate, holdsMoney, isAdjustment } from "@/lib/finance";
import { groupTitle } from "@/lib/people";
import { groupNets, memberOf, settleUp } from "@/lib/shared";
import { parseSplit, splitTitle } from "@/lib/split";

const SMALL = "text-xs font-semibold text-brand";

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dividir?: string }> }) {
  const { id } = await params;
  const { supabase, shared, accounts, txs, user, today } = await loadData();
  const group = shared.groups.find((g) => g.id === id);
  const me = memberOf(id, shared, user.id);
  if (!group || !me) notFound();

  const members = shared.members.filter((m) => m.group_id === id);
  // Who was taken out stays only in what already happened.
  const active = members.filter((m) => !m.removed_at);
  const gone = members.filter((m) => m.removed_at);
  const goneIds = new Set(gone.map((m) => m.id));
  const people = active.map(({ id, name }) => ({ id, name }));
  const name = new Map(members.map((m) => [m.id, m.name]));
  const entries = shared.entries.filter((e) => e.group_id === id);
  const shares = shared.shares.filter((s) => s.group_id === id);
  const nets = groupNets(id, shared);
  const transfers = settleUp(nets);
  const mine = nets.get(me.id) ?? 0;
  const direct = Boolean(group.direct);
  const title = groupTitle(group, shared, user.id);
  const other = direct ? members.find((m) => m.id !== me.id) : undefined;
  const canRemove = direct || group.created_by === null || group.created_by === user.id;
  const creator = members.find((m) => m.user_id && m.user_id === group.created_by);

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

  const known = shared.editable ? knownPeople(shared, user.id) : null;
  const pending = new Map(shared.requests?.filter((r) => r.group_id === id).map((r) => [r.member_id, r.user_id]));
  // Offered to add: whoever is neither in the group nor invited to it.
  const addable = known?.filter(
    (k) =>
      !members.some((m) => (k.userId ? m.user_id === k.userId : k.phone ? m.phone === k.phone : m.name.toLocaleLowerCase("es") === k.name.toLocaleLowerCase("es"))) &&
      !(k.userId && [...pending.values()].includes(k.userId)),
  );
  // Other people's links are theirs alone, so whether anyone else recorded it is asked to the database.
  const { data: recorded } = shared.editable && entries.length ? await supabase.rpc("shared_recorded_by_others", { p_group: id }) : { data: null };
  const recordedByOthers = new Set<string>((recorded as string[] | null) ?? []);

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
            <Modal label="+ Gasto" title="Gasto compartido" buttonClass="btn h-11 rounded-2xl px-4 text-sm">
              <ExpenseForm {...form} accounts={payable} />
            </Modal>
          )}
        </div>
      </div>

      <PeopleSection
        people={active.map((m) => ({ id: m.id, name: m.name, me: m.id === me.id }))}
        waiting={active.filter((m) => !m.user_id).length}
        action={
          !direct && (
            <div className="flex flex-col items-start gap-3">
              <Modal label="+ Agregar" title="Agregar persona" buttonClass="btn-quiet h-9 px-3 text-sm">
                <AddPersonForm group={id} known={addable ?? null} />
              </Modal>
              {gone.length > 0 && (
                <div className="w-full border-t border-line pt-2" data-gone>
                  <p className="eyebrow">Ya no están</p>
                  <ul>
                    {gone.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-3">
                        <span className="min-w-0 truncate">{m.name}</span>
                        {pending.has(m.id) ? (
                          <span className="shrink-0 text-xs">Invitación enviada</span>
                        ) : (
                          (!m.user_id || canRemove) && <RestorePersonButton member={m.id} />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        }
      >
        {[me, ...active.filter((m) => m.id !== me.id)].map((m) => {
          const net = nets.get(m.id) ?? 0;
          const inHistory = entries.some((e) => e.paid_by === m.id) || shares.some((s) => s.member_id === m.id);
          const canQuit = !direct && m.id !== me.id && Boolean(shared.removable);
          // Before migration 0024, only who has no history, from its «Editar».
          const removable = !shared.removable && !direct && !m.user_id && !inHistory;
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {m.name}
                  {m.id === me.id ? " (tú)" : ""}
                </p>
                <p className="num text-xs text-ink-3">
                  {net > 0 ? `le deben ${formatCOP(net)}` : net < 0 ? `debe ${formatCOP(-net)}` : "al día"}
                  {!m.user_id && ` · ${pending.has(m.id) ? "Invitación enviada" : "Sin unirse"}`}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 gap-3">
                {!m.user_id && (
                  <Modal label="Invitar" title={`Invitar a ${m.name}`} buttonClass={SMALL}>
                    <InviteForm member={{ id: m.id, name: m.name }} groupName={group.name} phone={m.phone ?? ""} removable={!known && removable} />
                  </Modal>
                )}
                {known && (
                  <Modal label="Editar" title={m.id === me.id ? "Tu nombre aquí" : `Editar a ${m.name}`} buttonClass={SMALL}>
                    <EditPersonForm
                      member={{ id: m.id, name: m.name, phone: m.phone ?? "" }}
                      who={m.id === me.id ? "me" : m.user_id ? "joined" : "guest"}
                      known={addable ?? []}
                      removable={removable}
                    />
                  </Modal>
                )}
                {canQuit && (
                  <Modal label="Quitar" title={`Quitar a ${m.name}`} buttonClass="text-xs font-medium text-ink-3 hover:text-debt">
                    <RemovePersonForm
                      member={m.id}
                      name={m.name}
                      net={net}
                      hasHistory={inHistory}
                      joined={Boolean(m.user_id)}
                      allowed={!m.user_id || canRemove}
                      creator={creator?.name ?? "quien lo creó"}
                    />
                  </Modal>
                )}
              </div>
            </li>
          );
        })}
      </PeopleSection>

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
              // With someone who left, it stays as it was.
              const frozen = goneIds.has(entry.paid_by) || parts.some((s) => goneIds.has(s.member_id));
              const canDelete = !frozen && (entry.created_by === user.id || (entry.created_by === null && payer));
              const link = shared.links.find((l) => l.entry_id === entry.id);
              const editable: EditableEntry | null =
                known && !frozen && (entry.created_by === user.id || payer)
                  ? {
                      id: entry.id,
                      amount: entry.amount,
                      description: entry.description,
                      category: entry.category,
                      occurred_on: entry.occurred_on,
                      paidBy: entry.paid_by,
                      shares: Object.fromEntries(parts.map((s) => [s.member_id, s.amount])),
                      split: entry.split,
                      account: link && link.created_tx !== false ? (txs.find((t) => t.id === link.tx_id)?.account_id ?? null) : null,
                      ownMovement: link?.created_tx === false,
                      othersRecorded: recordedByOthers.has(entry.id),
                    }
                  : null;
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
                    {!settled && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer py-1 font-medium text-ink-3 hover:text-ink">Ver división</summary>
                        <div className="rounded-xl bg-brand/6 px-2.5 py-2">
                          {parseSplit(entry.split) && <p className="mb-1 text-ink-3">{splitTitle(parseSplit(entry.split)!.mode)}</p>}
                          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-ink-2">
                            {parts.map((part) => (
                              <div key={part.member_id} className="contents">
                                <dt className="break-words">{part.member_id === me.id ? "Tú" : name.get(part.member_id)}</dt>
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
                          <RecordForm entry={entry.id} accounts={settled ? money : payable} favorite={favorite} />
                        </Modal>
                      )}
                      {editable && (
                        <Modal label="Editar" title={settled ? "Editar pago" : "Editar gasto"} buttonClass={SMALL}>
                          {settled ? (
                            <SettlementForm {...form} accounts={money} entry={editable} transfer={{ from: entry.paid_by, to: parts[0]?.member_id, amount: entry.amount }} />
                          ) : (
                            <ExpenseForm {...form} accounts={payable} entry={editable} />
                          )}
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

      <div className="flex justify-center">
        {canRemove ? (
          <Modal label={direct ? "Eliminar esta cuenta" : "Eliminar grupo"} title={direct ? "Eliminar esta cuenta" : "Eliminar grupo"} buttonClass="btn-quiet h-11 gap-2 px-4 text-sm hover:text-debt">
            <DeleteGroupForm
              group={id}
              social={Boolean(shared.social)}
              hasEntries={entries.length > 0}
              others={members.some((m) => m.user_id && m.id !== me.id)}
              settled={[...nets.values()].every((net) => net === 0)}
            />
          </Modal>
        ) : (
          <p className="text-center text-xs text-ink-3">Este grupo lo puede eliminar {creator?.name ?? "quien lo creó"}, que lo creó.</p>
        )}
      </div>
    </>
  );
}
