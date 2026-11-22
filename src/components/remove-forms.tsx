"use client";

import { useState } from "react";
import { deleteContact, leaveGroup, removePerson, restorePerson } from "@/app/shared-actions";
import { formatCOP } from "@/lib/finance";
import { useCloseModal } from "./modal";
import { EndChoice, Problem, Send, useSave, type End } from "./shared-forms";

/** «Quitar», on each person of a group: it does it, or says what is missing first. */
export function RemovePersonForm({
  member,
  name,
  net,
  hasHistory,
  joined,
  allowed,
  creator,
}: {
  member: string;
  name: string;
  /** What is pending with them in the group: only at zero can they leave. */
  net: number;
  hasHistory: boolean;
  joined: boolean;
  /** Who joined with an account, only by who created the group. */
  allowed: boolean;
  creator: string;
}) {
  const close = useCloseModal();
  const { pending, error, submit } = useSave(removePerson, () => close());

  if (!allowed) {
    return (
      <p className="text-sm text-ink-2">
        {name} ya se unió con su cuenta, así que solo {creator}, que creó el grupo, puede sacar a esa persona.
      </p>
    );
  }
  if (net !== 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">
          A {name} todavía {net > 0 ? "le deben" : "le falta pagar"} <strong className="num text-ink">{formatCOP(Math.abs(net))}</strong> en este grupo. Si sale así, esa plata quedaría perdida.
        </p>
        <p className="text-sm text-ink-2">Regístralo con «Saldar» en «Para quedar al día», o borra los gastos que sobren, y vuelve a tocar «Quitar».</p>
        <button type="button" className="btn self-start" onClick={close}>
          Entendido
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="member" value={member} />
      <p className="text-sm text-ink-2">
        {hasHistory
          ? `${name} sale del grupo y no entra en gastos nuevos. Lo que ya pasó se conserva igual, así que los saldos y lo gastado de nadie cambian. Si hace falta, puedes volver a agregar a esa persona.`
          : `${name} sale del grupo. No tiene gastos aquí, así que no cambia nada más.`}
      </p>
      {joined && <p className="text-sm text-ink-2">Le llega un aviso y deja de ver lo que anoten de aquí en adelante.</p>}
      <Problem error={error} />
      <Send pending={pending}>Sí, quitar</Send>
    </form>
  );
}

/** Someone taken out: back in, or invited back when they have their own account. */
export function RestorePersonButton({ member }: { member: string }) {
  const { pending, error, submit } = useSave(restorePerson);
  return (
    <form onSubmit={submit}>
      <input type="hidden" name="member" value={member} />
      <Send pending={pending} className="inline-flex items-center text-xs font-semibold text-brand">
        Volver a agregar
      </Send>
      <Problem error={error} />
    </form>
  );
}

/** A contact leaves one's list, and the account between the two closes. Groups are everybody's: they stay. */
export function DeleteContactForm({
  member,
  name,
  pendingIn,
  groups,
  account,
}: {
  member: string;
  name: string;
  /** The groups where something is pending with them. */
  pendingIn: { name: string; net: number }[];
  /** The groups they go on being in. */
  groups: string[];
  /** The account between the two, when there is one. */
  account: { hasEntries: boolean; others: boolean; settled: boolean } | null;
}) {
  const { pending, error, submit } = useSave(deleteContact);
  const canErase = Boolean(account?.hasEntries && !account.others);
  const [how, setHow] = useState<End | "">(canErase ? "" : "keep");
  const blocked = account?.hasEntries && account.others && !account.settled;

  if (pendingIn.length || blocked) {
    return (
      <div className="flex flex-col gap-3 text-sm text-ink-2">
        <p>Todavía hay plata pendiente con {name}. Sáldala primero, para que no se pierda de vista:</p>
        <ul className="divide-y divide-line">
          {blocked && <li className="py-2 font-semibold text-ink">En la cuenta de ustedes dos</li>}
          {pendingIn.map((p, i) => (
            <li key={i} className="flex justify-between gap-3 py-2">
              <span className="min-w-0 truncate font-semibold text-ink">{p.name}</span>
              <span className="num shrink-0">
                {p.net > 0 ? "te debe" : "le debes"} {formatCOP(Math.abs(p.net))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="member" value={member} />
      <input type="hidden" name="how" value={how} />
      <p className="text-sm text-ink-2">
        {name} sale de tus Personas y de las sugerencias al dividir. Solo cambia para ti.
        {account && " También se cierra la cuenta de ustedes dos."}
      </p>
      {groups.length > 0 && (
        <p className="text-sm text-ink-2">
          Sigue en {groups.map((g) => `«${g}»`).join(", ")}, porque los grupos son de todos. Para sacar a esa persona de ahí, toca «Quitar» dentro del grupo. Si vuelve a quedar algo pendiente entre ustedes, reaparece en tu lista.
        </p>
      )}
      {account?.hasEntries &&
        (canErase ? (
          <EndChoice how={how} onChange={setHow} settled={account.settled} />
        ) : (
          <p className="text-sm text-ink-2">Lo pagado y lo gastado se conserva: los saldos y los totales de nadie cambian.</p>
        ))}
      <Problem error={error} />
      <Send pending={pending} disabled={!how}>
        Sí, eliminar
      </Send>
    </form>
  );
}

/** «Salir»: it does it, or says what is missing first. */
export function LeaveGroupForm({
  group,
  back,
  house,
  net,
  alone,
  handsOver,
}: {
  group: string;
  back: "/compartidos" | "/pagos";
  house: boolean;
  net: number;
  /** Nobody else joined with an account. */
  alone: boolean;
  /** One created it: someone else stays in charge. */
  handsOver: boolean;
}) {
  const { pending, error, submit } = useSave(leaveGroup);
  if (alone) return <p className="text-sm text-ink-2">Nadie más se ha unido con su cuenta, así que no hay a quién dejárselo. En vez de salir, elimínalo con el botón de al lado.</p>;
  if (net !== 0) {
    return (
      <p className="text-sm text-ink-2">
        Todavía {net > 0 ? "te deben" : "debes"} <strong className="num text-ink">{formatCOP(Math.abs(net))}</strong> ahí. Regístralo con «Saldar» en Compartidos y vuelve a salir.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="group" value={group} />
      <input type="hidden" name="back" value={back} />
      <p className="text-sm text-ink-2">
        Dejas de ver lo que anoten de aquí en adelante y a los demás les llega un aviso. Tus movimientos, saldos y lo que ya gastaste no cambian.
        {house && " Sus recibos salen de tu Pagos, y los que tenías a tu cargo quedan sin responsable."}
      </p>
      {handsOver && <p className="text-sm text-ink-2">Como lo creaste tú, queda a cargo la persona con cuenta que lleve más tiempo ahí.</p>}
      <p className="text-sm text-ink-2">Para volver te tienen que invitar.</p>
      <Problem error={error} />
      <Send pending={pending}>Sí, salir</Send>
    </form>
  );
}
