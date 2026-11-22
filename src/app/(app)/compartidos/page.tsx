import Link from "next/link";
import { SharedBeam } from "@/components/balance-beam";
import { FoldSection, GroupMark } from "@/components/fold-section";
import { Modal } from "@/components/modal";
import { MovesSwitch } from "@/components/moves-switch";
import { PendingCards } from "@/components/pending-cards";
import { DirectButton, DirectForm, GroupForm } from "@/components/shared-forms";
import { Avatar } from "@/components/split-panel";
import { knownPeople } from "@/lib/contacts";
import { profileName } from "@/lib/brand";
import { loadData } from "@/lib/data";
import { formatCOP, isAdjustment } from "@/lib/finance";
import { loadPending } from "@/lib/pending";
import { peopleWith } from "@/lib/people";
import { profilePhone } from "@/lib/phone";

const ROW = "flex w-full items-center gap-3 py-3 text-left";

function Balance({ net, them = false }: { net: number; them?: boolean }) {
  return (
    <span className="shrink-0 text-right">
      <span className="block text-xs text-ink-3">{net > 0 ? (them ? "te debe" : "te deben") : net < 0 ? (them ? "le debes" : "debes") : "al día"}</span>
      {net !== 0 && <span className="display num block text-lg">{formatCOP(Math.abs(net))}</span>}
    </span>
  );
}

// The list reorders by balance: the colour follows the person, not the row.
const colour = (id: string) => [...id].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) % 9973, 0) % 7;

const Pick = () => <span className="shrink-0 rounded-full bg-brand/12 px-3 py-1.5 text-xs font-semibold text-brand">Dividir aquí ›</span>;

export default async function SharedPage({ searchParams }: { searchParams: Promise<{ dividir?: string }> }) {
  const { supabase, shared, sharedReady, position, txs, user } = await loadData();
  const { dividir } = await searchParams;
  const linked = shared.links.some((l) => l.tx_id === dividir);
  const tx = dividir && !linked ? txs.find((t) => t.id === dividir && t.kind === "expense" && !isAdjustment(t)) : undefined;
  const me = profileName(user);
  const query = tx ? `?dividir=${tx.id}` : "";
  const known = shared.editable ? knownPeople(shared, user.id) : null;

  if (!sharedReady) {
    return (
      <>
        <h1 className="display pt-2 text-3xl">Movimientos</h1>
        <MovesSwitch active="/compartidos" />
        <p className="card text-sm text-ink-2">Los gastos compartidos todavía no están activos.</p>
      </>
    );
  }

  const pending = await loadPending(supabase, shared, user.id);
  // Before migration 0023 every account is a group.
  const people = shared.social ? peopleWith(shared, user.id) : [];
  const groups = shared.groups.filter((g) => !g.direct);
  const empty = shared.groups.length === 0;

  const newPerson = shared.social && (
    <Modal label="+ Persona" title="Cuenta con una persona" buttonClass="btn-quiet h-9 px-3 text-sm">
      <DirectForm known={known ?? []} tx={tx?.id} />
    </Modal>
  );

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-2">
        <h1 className="display text-3xl">Movimientos</h1>
        <Modal label="+ Grupo" title="Nuevo grupo" buttonClass="btn h-11 rounded-2xl px-4 text-sm">
          <GroupForm me={me} tx={tx?.id} known={known} />
        </Modal>
      </div>
      <MovesSwitch active="/compartidos" />

      <PendingCards pending={pending} />

      {tx && (
        <section role="status" className="card flex flex-col gap-1">
          <h2 className="display text-2xl">¿Con quién lo divides?</h2>
          <p className="text-sm text-ink-2">
            Son <strong className="num text-ink">{formatCOP(tx.amount)}</strong>
            {tx.description ? ` de «${tx.description}»` : ""}, ya registrados en tu cuenta. {empty ? "Agrega una persona o crea un grupo." : "Toca una persona o un grupo."}
          </p>
        </section>
      )}

      {!empty && !tx && (
        <SharedBeam owed={position.owedToMe} owes={position.iOwe} />
      )}

      {empty ? (
        <section className="card flex flex-col items-start gap-3">
          <h2 className="display text-2xl">Divide gastos con quien quieras</h2>
          <p className="text-sm text-ink-2">
            Una cena, el arriendo, un viaje. Anota quién pagó y Guaca lleva quién le debe a quién. De lo que pagues por otros, solo tu parte cuenta como gasto.
          </p>
          <p className="text-sm text-ink-3">El grupo ve solo sus gastos: nunca tus cuentas, saldos ni otros movimientos.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Modal label="Empezar" title="Nuevo grupo">
              <GroupForm me={me} tx={tx?.id} known={known} />
            </Modal>
            {newPerson}
          </div>
        </section>
      ) : (
        <>
          {shared.social && (
            <FoldSection kind="people" title="Personas" count={people.length}>
              <div className="flex justify-end">{newPerson}</div>
              <ul className="mt-1 divide-y divide-line" aria-label="Tus personas">
                {people.map((person) => {
                  const row = (
                    <>
                      <Avatar name={person.name} index={colour(person.member)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{person.name}</span>
                        <span className="block truncate text-xs text-ink-3">{person.places.map((p) => (p.group.direct ? "Solo ustedes dos" : p.group.name)).join(", ")}</span>
                      </span>
                      {tx ? <Pick /> : <Balance net={person.total} them />}
                    </>
                  );
                  return (
                    <li key={person.member}>
                      {tx && !person.direct ? (
                        <DirectButton member={person.member} tx={tx.id} className={ROW}>
                          {row}
                        </DirectButton>
                      ) : (
                        <Link href={tx ? `/compartidos/${person.direct}${query}` : `/compartidos/persona/${person.member}`} className={ROW}>
                          {row}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </FoldSection>
          )}
          {groups.length > 0 && (
            <FoldSection kind="groups" title="Grupos" count={groups.length}>
              <ul className="mt-1 divide-y divide-line" aria-label="Tus grupos">
                {groups.map((group) => {
                  const count = shared.members.filter((m) => m.group_id === group.id && !m.removed_at).length;
                  return (
                    <li key={group.id}>
                      <Link href={`/compartidos/${group.id}${query}`} className="flex items-center gap-3 py-4">
                        <GroupMark house={Boolean(group.house)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{group.name}</span>
                          <span className="block text-sm text-ink-3">{group.house ? "Casa · " : ""}{count === 1 ? "Solo tú" : count === 2 ? "Solo ustedes dos" : `${count} personas`}</span>
                        </span>
                        {tx ? <Pick /> : <Balance net={position.byGroup.get(group.id) ?? 0} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </FoldSection>
          )}
        </>
      )}

      {shared.social && !profilePhone(user) && (
        <p className="text-sm text-ink-3">
          Para que te aparezcan aquí las invitaciones que te hagan por celular,{" "}
          <Link href="/ajustes" className="font-semibold text-brand">
            agrega tu número en Ajustes
          </Link>
          .
        </p>
      )}
    </>
  );
}
