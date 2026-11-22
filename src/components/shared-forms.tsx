"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addMember,
  answerRequest,
  createDirect,
  createGroup,
  deleteGroup,
  deleteSharedEntry,
  editPerson,
  inviteMember,
  joinGroup,
  recordInAccount,
  removeMember,
  renameGroup,
  saveSettlement,
  type SharedResult,
} from "@/app/shared-actions";
import { knownByPhone, whatsappLink, type Known } from "@/lib/contacts";
import { formatCOP } from "@/lib/finance";
import { formatPhone } from "@/lib/phone";
import type { Transfer } from "@/lib/shared";
import { DateField } from "./date-field";
import { useCloseModal } from "./modal";
import { MoneyInput } from "./money-input";
import { PeopleFields } from "./people-fields";
import { SelectField, type PickOption } from "./pickers";
import { useSocialReady } from "./shared-ready";
import { Spinner } from "./submit-button";

type Person = { id: string; name: string };

/**
 * Sends a form without `<form action>`: React would reset it afterwards, and after an error the
 * person would have to write everything again.
 */
export function useSave(action: (form: FormData) => Promise<SharedResult>, done?: (result: SharedResult) => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const result = await action(form);
      // Nothing comes back when the action navigated.
      if (result?.error) setError(result.error);
      else if (result) done?.(result);
    });
  }
  return { pending, error, submit };
}

export function Problem({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="alert">
      {error}
    </p>
  );
}

export function Send({ pending, disabled, className = "btn self-start", children }: { pending: boolean; disabled?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button type="submit" className={`${className} gap-1.5`} disabled={pending || disabled} aria-busy={pending}>
      {pending && <Spinner />}
      {children}
    </button>
  );
}

export const NO_ACCOUNT: PickOption = { value: "", label: "No mover mis cuentas" };

/** An expense or payment already in the group, to edit. */
export interface EditableEntry {
  id: string;
  amount: number;
  description: string;
  category: string | null;
  occurred_on: string;
  paidBy: string;
  shares: Record<string, number>;
  /** How it was divided, as saved (migration 0021). */
  split?: unknown;
  /** The account of the movement the group created for this person. */
  account: string | null;
  /** It is a movement this person already had and divided. */
  ownMovement: boolean;
  /** Someone else recorded it in their account. */
  othersRecorded: boolean;
}

/** `known` is null before migration 0020: then people are only names. */
export function GroupForm({ me, tx, known }: { me: string; tx?: string; known: Known[] | null }) {
  const router = useRouter();
  const close = useCloseModal();
  const [people, setPeople] = useState([""]);
  const { pending, error, submit } = useSave(createGroup, ({ id }) => {
    close();
    router.push(`/compartidos/${id}${tx ? `?dividir=${tx}` : ""}`);
  });
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="field">
        Tu nombre en el grupo
        <input className="input" name="me" defaultValue={me} maxLength={60} autoComplete="given-name" required />
      </label>
      {known ? (
        <PeopleFields known={known} />
      ) : (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-ink-2">Con quién divides</legend>
        {people.map((person, i) => (
          <input
            key={i}
            className="input"
            name="person"
            value={person}
            onChange={(e) => setPeople(people.map((p, j) => (j === i ? e.target.value : p)))}
            placeholder={i === 0 ? "Nombre de la persona" : "Otra persona"}
            aria-label={`Persona ${i + 1}`}
            maxLength={60}
            autoComplete="off"
            required={i === 0}
          />
        ))}
        {people.length < 29 && (
          <button type="button" className="self-start py-1 text-sm font-semibold text-brand" onClick={() => setPeople([...people, ""])}>
            + Agregar otra persona
          </button>
        )}
        <p className="text-xs text-ink-3">No necesitan cuenta. Después le puedes mandar a cada quien un enlace para unirse.</p>
      </fieldset>
      )}
      <label className="field">
        <span>
          Nombre del grupo <span className="font-normal text-ink-3">(opcional si son solo dos)</span>
        </span>
        <input className="input" name="name" placeholder="Apartamento, viaje, cena…" maxLength={60} autoComplete="off" />
      </label>
      <Problem error={error} />
      <Send pending={pending}>Crear</Send>
    </form>
  );
}

export function SettlementForm({
  group,
  members,
  me,
  accounts,
  favorite,
  today,
  transfer,
  entry,
}: {
  group: string;
  members: Person[];
  me: string;
  /** Savings and cash only. */
  accounts: PickOption[];
  favorite: string;
  today: string;
  transfer: Transfer;
  entry?: EditableEntry;
}) {
  const close = useCloseModal();
  const [amount, setAmount] = useState(transfer.amount);
  const { pending, error, submit } = useSave(saveSettlement, () => close());
  const name = (id: string) => (id === me ? "Tú" : (members.find((m) => m.id === id)?.name ?? ""));
  const involved = transfer.from === me || transfer.to === me;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="group" value={group} />
      {entry && <input type="hidden" name="entry" value={entry.id} />}
      <input type="hidden" name="from" value={transfer.from} />
      <input type="hidden" name="to" value={transfer.to} />
      <p className="text-sm text-ink-2">
        <strong className="text-ink">{name(transfer.from)}</strong> {transfer.from === me ? "le pagas" : "le paga"} a{" "}
        <strong className="text-ink">{transfer.to === me ? "ti" : name(transfer.to)}</strong>. Aquí solo se registra: la plata la envían por fuera (Nequi, banco, efectivo).
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {entry?.othersRecorded ? (
          <p className="text-sm text-ink-2">
            <input type="hidden" name="amount" value={transfer.amount} />
            Son <strong className="num text-ink">{formatCOP(transfer.amount)}</strong>. La otra persona ya lo registró en su cuenta, así que el valor no cambia.
          </p>
        ) : (
          <label className="field">
            Cuánto
            <MoneyInput name="amount" defaultValue={transfer.amount} onValue={setAmount} required />
          </label>
        )}
        <label className="field">
          Fecha
          <DateField name="occurred_on" defaultValue={entry?.occurred_on ?? today} max={today} required />
        </label>
        {involved && (
          <label className="field sm:col-span-2">
            {transfer.from === me ? "De qué cuenta sale" : "A qué cuenta llega"}
            <SelectField name="account_id" options={entry?.account ? accounts : [...accounts, NO_ACCOUNT]} defaultValue={entry ? (entry.account ?? "") : favorite} />
            <span className="text-xs font-normal text-ink-3">Mueve el saldo de esa cuenta, pero no cuenta como gasto ni como ingreso.</span>
          </label>
        )}
      </div>
      {!entry && amount > transfer.amount && <p className="text-sm text-ink-2">Es más de lo pendiente: la diferencia quedará al revés.</p>}
      <Problem error={error} />
      <Send pending={pending} disabled={amount === 0}>
        {entry ? "Guardar cambios" : "Registrar pago"}
      </Send>
    </form>
  );
}

export function RecordForm({ entry, accounts, favorite }: { entry: string; accounts: PickOption[]; favorite: string }) {
  const close = useCloseModal();
  const { pending, error, submit } = useSave(recordInAccount, () => close());
  if (accounts.length === 0) return <p className="text-sm text-ink-2">Primero agrega una cuenta en Inicio.</p>;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="entry" value={entry} />
      <label className="field">
        Cuenta
        <SelectField name="account_id" options={accounts} defaultValue={favorite || accounts[0].value} required />
      </label>
      <p className="text-xs text-ink-3">Si ese movimiento ya está en tu cuenta, no lo registres otra vez.</p>
      <Problem error={error} />
      <Send pending={pending}>Registrar</Send>
    </form>
  );
}

export function AddPersonForm({ group, known }: { group: string; known: Known[] | null }) {
  const close = useCloseModal();
  const { pending, error, submit } = useSave(addMember, () => close());
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="group" value={group} />
      {known ? (
        <PeopleFields known={known} single />
      ) : (
        <label className="field">
          Nombre
          <input className="input" name="name" maxLength={60} autoComplete="off" required />
        </label>
      )}
      <p className="text-xs text-ink-3">Los gastos que ya están no cambian: entra desde el próximo que dividan.</p>
      <Problem error={error} />
      <Send pending={pending}>Agregar</Send>
    </form>
  );
}

/** A friend without an account: their one-use link, and taking them out while they have no history. */
export function InviteForm({ member, groupName, removable, phone = "" }: { member: Person; groupName: string; removable: boolean; phone?: string }) {
  const close = useCloseModal();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const invite = useSave(inviteMember, (result) => setLink(result.link ?? null));
  const remove = useSave(removeMember, () => close());

  const message = `${member.name}, te invito a «${groupName}» en Guaca para dividir gastos:`;
  // Sharing needs a tap of its own: iPhone refuses it after waiting for the server.
  async function share() {
    if (!link) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Guaca", text: message, url: link });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // The field below has it, to copy by hand.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">
        Con el enlace, {member.name} crea su cuenta o entra y queda en este lugar. Verá los gastos del grupo, nunca tus cuentas. Sirve una sola vez y vence en 7 días.
      </p>
      {link ? (
        <>
          <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de invitación" />
          {phone && (
            <a className="btn self-start" href={whatsappLink(phone, `${message} ${link}`)} target="_blank" rel="noopener noreferrer">
              Enviar por WhatsApp al {formatPhone(phone)}
            </a>
          )}
          <button type="button" className={`${phone ? "btn-quiet" : "btn"} self-start`} onClick={share}>
            {copied ? "✓ Copiado" : "Compartir enlace"}
          </button>
        </>
      ) : (
        <form onSubmit={invite.submit}>
          <input type="hidden" name="member" value={member.id} />
          <Send pending={invite.pending}>Crear enlace</Send>
        </form>
      )}
      <Problem error={invite.error ?? remove.error} />
      {removable && (
        <form onSubmit={remove.submit} className="border-t border-line pt-3">
          <input type="hidden" name="member" value={member.id} />
          <Send pending={remove.pending} className="inline-flex items-center text-sm font-medium text-ink-3 hover:text-debt">
            Quitar del grupo
          </Send>
        </form>
      )}
    </div>
  );
}

export function DeleteEntryForm({ entry, keepsMovement }: { entry: string; keepsMovement: boolean }) {
  const close = useCloseModal();
  const { pending, error, submit } = useSave(deleteSharedEntry, () => close());
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="entry" value={entry} />
      <p className="text-sm text-ink-2">
        Se borra para todo el grupo.{" "}
        {keepsMovement ? "El movimiento que ya tenías se conserva como un gasto normal." : "Si se registró en una cuenta tuya, ese movimiento también se borra."}
      </p>
      <Problem error={error} />
      <Send pending={pending}>Sí, borrar</Send>
    </form>
  );
}

export function DeleteGroupForm({
  group,
  social,
  hasEntries,
  others,
  settled,
}: {
  group: string;
  /** Migration 0023: otherwise only an empty one can go. */
  social: boolean;
  hasEntries: boolean;
  /** Someone else entered with their account. */
  others: boolean;
  settled: boolean;
}) {
  const { pending, error, submit } = useSave(deleteGroup);
  const canErase = hasEntries && !others;
  const [how, setHow] = useState<"keep" | "erase" | "">(canErase ? "" : "keep");

  if (hasEntries && (!social || (others && !settled))) {
    return (
      <p className="text-sm text-ink-2">
        {social
          ? "Todavía hay saldos pendientes con personas que ya se unieron. Usen «Saldar» en «Para quedar al día» (o borra los gastos que sobren) y vuelve aquí."
          : "Por ahora solo se puede eliminar sin gastos: bórralos primero."}
      </p>
    );
  }
  const options = [
    { value: "keep", title: "Ya terminó", text: "Sale de tus pantallas. Lo pagado y lo gastado se conserva: tus saldos y tus totales no cambian." },
    { value: "erase", title: "Fue una prueba", text: "Borra todo, también los movimientos que se crearon en tus cuentas desde aquí: esos saldos vuelven a como estaban." },
  ] as const;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="group" value={group} />
      {social && <input type="hidden" name="how" value={how} />}
      {canErase ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-ink-2">¿Qué pasa con lo que tiene?</legend>
          {options.map((o) => (
            <label key={o.value} data-how={o.value} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${how === o.value ? "border-brand bg-brand/8" : "border-line-strong"}`}>
              <input type="radio" className="mt-1" checked={how === o.value} onChange={() => setHow(o.value)} />
              <span>
                <span className="block text-sm font-semibold text-ink">{o.title}</span>
                <span className="block text-sm text-ink-2">{o.text}</span>
              </span>
            </label>
          ))}
          {!settled && how === "keep" && <p className="text-sm text-ink-2">Lo que quedó pendiente dejará de aparecer en «Te deben» y «Debes».</p>}
        </fieldset>
      ) : (
        <p className="text-sm text-ink-2">
          {hasEntries ? "Sale de la pantalla de todos. Lo pagado y lo gastado se conserva: los saldos y los totales no cambian." : "Está vacío: se borra para todos."}
        </p>
      )}
      <Problem error={error} />
      <Send pending={pending} disabled={!how}>
        Sí, eliminar
      </Send>
    </form>
  );
}

/** An account between two, with someone new or someone one already divides with. */
export function DirectForm({ known, tx }: { known: Known[]; tx?: string }) {
  const router = useRouter();
  const close = useCloseModal();
  const { pending, error, submit } = useSave(createDirect, ({ id }) => {
    close();
    router.push(`/compartidos/${id}${tx ? `?dividir=${tx}` : ""}`);
  });
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">Para dividir solo entre ustedes dos, sin armar un grupo.</p>
      <PeopleFields known={known} single />
      <Problem error={error} />
      <Send pending={pending}>Crear</Send>
    </form>
  );
}

/** Goes to the account between two with someone, creating it the first time. */
export function DirectButton({ member, tx, className = "btn h-11 self-start px-4 text-sm", children }: { member: string; tx?: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const { pending, error, submit } = useSave(createDirect, ({ id }) => router.push(`/compartidos/${id}${tx ? `?dividir=${tx}` : ""}`));
  return (
    <form onSubmit={submit}>
      <input type="hidden" name="member" value={member} />
      <Send pending={pending} className={className}>
        {children}
      </Send>
      <Problem error={error} />
    </form>
  );
}

export function RenameGroupForm({ group, name }: { group: string; name: string }) {
  const close = useCloseModal();
  const { pending, error, submit } = useSave(renameGroup, () => close());
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="group" value={group} />
      <label className="field">
        Nombre del grupo
        <input className="input" name="name" defaultValue={name} maxLength={60} autoComplete="off" required />
      </label>
      <p className="text-xs text-ink-3">Cambia para todos. A las personas las editas en «Personas».</p>
      <Problem error={error} />
      <Send pending={pending}>Guardar cambios</Send>
    </form>
  );
}

export function EditPersonForm({
  member,
  who,
  known,
  removable,
}: {
  member: { id: string; name: string; phone: string };
  /** Oneself, someone with their own account, or someone without one. */
  who: "me" | "joined" | "guest";
  known: Known[];
  removable: boolean;
}) {
  const close = useCloseModal();
  const [phone, setPhone] = useState(formatPhone(member.phone));
  const { pending, error, submit } = useSave(editPerson, () => close());
  const remove = useSave(removeMember, () => close());
  const account = who === "guest" ? knownByPhone(known, phone) : undefined;
  const social = useSocialReady();
  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input type="hidden" name="member" value={member.id} />
        <input type="hidden" name="known" value={account?.member ?? ""} />
        <label className="field">
          Nombre
          <input className="input" name="name" defaultValue={member.name} maxLength={60} autoComplete="off" required />
          <span className="text-xs font-normal text-ink-3">
            {who === "me" ? "Así te ve el grupo." : who === "joined" ? "Solo tú lo ves así: como lo tengas en tus contactos." : "Cambia para todo el grupo."}
          </span>
        </label>
        {who !== "me" && (
          <label className="field">
            Celular
            <input className="input num" type="tel" inputMode="tel" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={22} autoComplete="off" placeholder="300 123 4567" />
            <span className="text-xs font-normal text-ink-3">{account
                ? "Ya está en Guaca: al guardar le llega la invitación en la app."
                : social && who === "guest"
                  ? "Solo lo ves tú. Al guardar, si tiene ese celular en su perfil de Guaca le aparece la invitación, y tú confirmas antes de que entre."
                  : "Solo lo ves tú."}</span>
          </label>
        )}
        <Problem error={error} />
        <Send pending={pending}>Guardar cambios</Send>
      </form>
      {removable && (
        <form onSubmit={remove.submit} className="flex flex-col gap-2 border-t border-line pt-3">
          <input type="hidden" name="member" value={member.id} />
          <Send pending={remove.pending} className="inline-flex items-center self-start text-sm font-medium text-ink-3 hover:text-debt">
            Quitar del grupo
          </Send>
          <Problem error={remove.error} />
        </form>
      )}
    </div>
  );
}

/** An invitation inside Guaca, to accept or not. */
export function RequestCard({ member, group, as, from }: { member: string; group: string; as: string; from: string | null }) {
  const accept = useSave(answerRequest);
  const decline = useSave(answerRequest);
  return (
    <li className="card flex flex-col gap-3">
      <div>
        <p className="eyebrow">{from ? `${from} te invitó` : "Te invitaron"}</p>
        <p className="display text-xl break-words">{group}</p>
        <p className="text-sm text-ink-2">Entrarías como {as}. Tu parte de sus gastos contará en los tuyos; el grupo no ve tus cuentas.</p>
      </div>
      <div className="flex gap-2">
        <form onSubmit={accept.submit}>
          <input type="hidden" name="member" value={member} />
          <input type="hidden" name="accept" value="1" />
          <Send pending={accept.pending}>Aceptar</Send>
        </form>
        <form onSubmit={decline.submit}>
          <input type="hidden" name="member" value={member} />
          <input type="hidden" name="accept" value="0" />
          <Send pending={decline.pending} className="btn-quiet h-full">
            Ahora no
          </Send>
        </form>
      </div>
      <Problem error={accept.error ?? decline.error} />
    </li>
  );
}

export function JoinForm({ token }: { token: string }) {
  const { pending, error, submit } = useSave(joinGroup);
  return (
    <form onSubmit={submit} className="flex flex-col items-start gap-3">
      <input type="hidden" name="token" value={token} />
      <Problem error={error} />
      <Send pending={pending}>Unirme al grupo</Send>
    </form>
  );
}
