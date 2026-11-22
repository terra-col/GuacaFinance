import { groupNets, memberOf, type SharedData, type SharedGroup } from "@/lib/shared";
import { Modal } from "./modal";
import { LeaveGroupForm } from "./remove-forms";
import { DeleteGroupForm } from "./shared-forms";

const QUIET = "btn-quiet h-11 gap-2 px-4 text-sm hover:text-debt";

/** At the foot of a group or house: leave it, or delete it. `house` when it is seen as one. */
export function GroupExit({
  group,
  shared,
  userId,
  hasPayments,
  canLeave,
  house = false,
}: {
  group: SharedGroup;
  shared: SharedData;
  userId: string;
  hasPayments: boolean;
  /** Migration 0025. */
  canLeave: boolean;
  house?: boolean;
}) {
  const me = memberOf(group.id, shared, userId);
  if (!me) return null;
  const members = shared.members.filter((m) => m.group_id === group.id);
  const direct = Boolean(group.direct);
  const mayDelete = direct || group.created_by === null || group.created_by === userId;
  const creator = members.find((m) => m.user_id && m.user_id === group.created_by);
  const nets = groupNets(group.id, shared);
  const what = house ? "esta casa" : direct ? "esta cuenta" : "grupo";
  const back = house ? "/pagos" : "/compartidos";

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {canLeave && !direct && (
        <Modal label={house ? "Salir de esta casa" : "Salir del grupo"} title={house ? "Salir de esta casa" : "Salir del grupo"} buttonClass={QUIET}>
          <LeaveGroupForm
            group={group.id}
            back={back}
            house={Boolean(group.house)}
            net={nets.get(me.id) ?? 0}
            alone={!members.some((m) => m.user_id && m.id !== me.id && !m.removed_at)}
            handsOver={group.created_by === userId}
          />
        </Modal>
      )}
      {mayDelete ? (
        <Modal label={`Eliminar ${what}`} title={`Eliminar ${what}`} buttonClass={QUIET}>
          <DeleteGroupForm
            group={group.id}
            back={back}
            social={Boolean(shared.social)}
            hasEntries={hasPayments || shared.entries.some((e) => e.group_id === group.id)}
            others={members.some((m) => m.user_id && m.id !== me.id)}
            settled={[...nets.values()].every((net) => net === 0)}
          />
        </Modal>
      ) : (
        <p className="w-full text-center text-xs text-ink-3">{house ? "Esta casa la" : "Este grupo lo"} puede eliminar {creator?.name ?? "quien lo creó"}, que lo creó.</p>
      )}
    </div>
  );
}
