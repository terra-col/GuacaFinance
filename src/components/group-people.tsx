import { knownPeople } from "@/lib/contacts";
import { formatCOP } from "@/lib/finance";
import { groupNets, memberOf, type SharedData, type SharedGroup } from "@/lib/shared";
import { Modal } from "./modal";
import { PeopleSection } from "./people-section";
import { RemovePersonForm, RestorePersonButton } from "./remove-forms";
import { AddPersonForm, EditPersonForm, InviteForm } from "./shared-forms";

const SMALL = "text-xs font-semibold text-brand";

/**
 * A group's people and everything done to them: add, invite, edit, take out, bring back. The same
 * in Compartidos and in a house. `paidHere`: who has history that is not an expense of the group.
 */
export function GroupPeople({ group, shared, userId, paidHere }: { group: SharedGroup; shared: SharedData; userId: string; paidHere: Set<string> }) {
  const members = shared.members.filter((m) => m.group_id === group.id);
  const me = memberOf(group.id, shared, userId);
  if (!me) return null;
  // Who was taken out stays only in what already happened.
  const active = members.filter((m) => !m.removed_at);
  const gone = members.filter((m) => m.removed_at);
  const direct = Boolean(group.direct);
  const canManage = direct || group.created_by === null || group.created_by === userId;
  const creator = members.find((m) => m.user_id && m.user_id === group.created_by);
  const nets = groupNets(group.id, shared);
  const entries = shared.entries.filter((e) => e.group_id === group.id);
  const shares = shared.shares.filter((s) => s.group_id === group.id);

  const known = shared.editable ? knownPeople(shared, userId) : null;
  const pending = new Map(shared.requests?.filter((r) => r.group_id === group.id).map((r) => [r.member_id, r.user_id]));
  // Offered to add: whoever is neither in the group nor invited to it.
  const addable = known?.filter(
    (k) =>
      !members.some((m) => (k.userId ? m.user_id === k.userId : k.phone ? m.phone === k.phone : m.name.toLocaleLowerCase("es") === k.name.toLocaleLowerCase("es"))) &&
      !(k.userId && [...pending.values()].includes(k.userId)),
  );

  return (
    <PeopleSection
      people={active.map((m) => ({ id: m.id, name: m.name, me: m.id === me.id }))}
      waiting={active.filter((m) => !m.user_id).length}
      action={
        !direct && (
          <div className="flex flex-col items-start gap-3">
            <Modal label="+ Agregar" title="Agregar persona" buttonClass="btn-quiet h-9 px-3 text-sm">
              <AddPersonForm group={group.id} known={addable ?? null} />
            </Modal>
            {gone.length > 0 && (
              <div className="w-full border-t border-line pt-2" data-gone>
                <p className="eyebrow">Ya no están</p>
                <ul>
                  {gone.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-3">
                      <span className="min-w-0 truncate">{m.name}</span>
                      {pending.has(m.id) ? <span className="shrink-0 text-xs">Invitación enviada</span> : (!m.user_id || canManage) && <RestorePersonButton member={m.id} />}
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
        const inHistory = paidHere.has(m.id) || entries.some((e) => e.paid_by === m.id) || shares.some((s) => s.member_id === m.id);
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
                    allowed={!m.user_id || canManage}
                    creator={creator?.name ?? "quien lo creó"}
                  />
                </Modal>
              )}
            </div>
          </li>
        );
      })}
    </PeopleSection>
  );
}
