import type { Metadata } from "next";
import Link from "next/link";
import { JoinForm } from "@/components/shared-forms";
import { invitePath } from "@/lib/shared";
import { createClient } from "@/lib/supabase/server";

// The address carries the invitation, so it is never passed on as a referrer.
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let invite: { group_name: string; member_name: string } | undefined;
  if (invitePath(`/unirse/${token}`)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("shared_invite_preview", { p_token: token });
    invite = Array.isArray(data) ? data[0] : undefined;
  }

  return (
    <section className="card mt-4 flex w-full max-w-xl flex-col items-start gap-3 self-center">
      {invite ? (
        <>
          <p className="eyebrow">Te invitaron a dividir gastos</p>
          <h1 className="display text-3xl break-words">{invite.group_name}</h1>
          <p className="text-sm text-ink-2">
            Entrarás como <strong className="text-ink">{invite.member_name}</strong>. Verás los gastos del grupo, y tu parte contará en tus gastos. El grupo no verá tus cuentas, saldos ni otros
            movimientos.
          </p>
          <JoinForm token={token} />
        </>
      ) : (
        <>
          <h1 className="display text-2xl">Este enlace venció o ya se usó</h1>
          <p className="text-sm text-ink-2">Pídele uno nuevo a quien te invitó. Si ya te uniste, el grupo está en Compartidos.</p>
          <Link href="/compartidos" className="btn">
            Ir a Compartidos
          </Link>
        </>
      )}
    </section>
  );
}
