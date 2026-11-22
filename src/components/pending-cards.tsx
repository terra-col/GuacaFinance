"use client";

import { answerPhoneInvite, confirmPhoneInvite, type SharedResult } from "@/app/shared-actions";
import type { Pending } from "@/lib/pending";
import { Problem, RequestCard, Send, useSave } from "./shared-forms";

function Answer({
  action,
  invite,
  yes,
  no,
}: {
  action: (form: FormData) => Promise<SharedResult>;
  invite: string;
  yes: string;
  no: string;
}) {
  const accept = useSave(action);
  const decline = useSave(action);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <form onSubmit={accept.submit}>
          <input type="hidden" name="invite" value={invite} />
          <input type="hidden" name="accept" value="1" />
          <Send pending={accept.pending}>{yes}</Send>
        </form>
        <form onSubmit={decline.submit}>
          <input type="hidden" name="invite" value={invite} />
          <input type="hidden" name="accept" value="0" />
          <Send pending={decline.pending} className="btn-quiet h-full">
            {no}
          </Send>
        </form>
      </div>
      <Problem error={accept.error ?? decline.error} />
    </>
  );
}

/** Everything that waits for the person's answer: in Compartidos and in Avisos. */
export function PendingCards({ pending: { requests, phone, claims } }: { pending: Pending }) {
  if (requests.length + phone.length + claims.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3" aria-label="Invitaciones">
      {claims.map((c) => (
        <li key={c.id} className="card flex flex-col gap-3" data-claim>
          <div>
            <p className="eyebrow">Confirma que sí es {c.member_name}</p>
            <p className="display break-words text-xl">{c.account_name || "Cuenta sin nombre"}</p>
            <p className="break-all text-sm text-ink-2">{c.account_email}</p>
            <p className="mt-1 text-sm text-ink-2">
              Aceptó tu invitación a «{c.group_name}» con el celular que guardaste. Al confirmar verá los gastos de ahí, así que si no la reconoces, pregúntale primero.
            </p>
          </div>
          <Answer action={confirmPhoneInvite} invite={c.id} yes="Sí, confirmar" no="No es" />
        </li>
      ))}
      {requests.map((r) => (
        <RequestCard key={r.member_id} member={r.member_id} group={r.group_name} as={r.member_name} from={r.invited_by_name} />
      ))}
      {phone.map((p) => (
        <li key={p.id} className="card flex flex-col gap-3" data-phone-invite>
          <div>
            <p className="eyebrow">{p.waiting ? "Esperando confirmación" : "Invitación a tu celular"}</p>
            <p className="display break-words text-xl">{p.from_name} te invitó a dividir gastos</p>
            <p className="text-sm text-ink-2">
              {p.waiting
                ? `Le avisamos a ${p.from_name}. Cuando confirme, entras y te llega un aviso.`
                : `Si aceptas, ${p.from_name} ve tu nombre y parte de tu correo para confirmar que eres tú. Al entrar, tu parte de esos gastos cuenta en los tuyos. Nadie ve tus cuentas.`}
            </p>
          </div>
          {!p.waiting && <Answer action={answerPhoneInvite} invite={p.id} yes="Aceptar" no="Ahora no" />}
        </li>
      ))}
    </ul>
  );
}
