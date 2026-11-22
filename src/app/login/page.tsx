import { cookies } from "next/headers";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { APP_TAGLINE } from "@/lib/brand";
import { phoneLoginReady } from "@/lib/phone-login";
import { INVITE_COOKIE, invitePath } from "@/lib/shared";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ enlace?: string; registro?: string }> }) {
  const { enlace, registro } = await searchParams;
  const toGroup = Boolean(invitePath((await cookies()).get(INVITE_COOKIE)?.value));

  return (
    <AuthShell subtitle={APP_TAGLINE}>
      {isSupabaseConfigured ? (
        <>
          {enlace === "vencido" && (
            <p role="alert" className="alert">
              Ese enlace ya se usó o venció. Entra con tu contraseña o{" "}
              <Link href="/recuperar" className="font-medium underline">
                pide uno nuevo
              </Link>
              .
            </p>
          )}
          {toGroup && !registro && (
            <p role="status" className="card text-sm text-ink-2">
              <span className="font-semibold text-ink">Te invitaron a un grupo para dividir gastos.</span> Entra o crea tu cuenta para unirte. Si confirmas el correo en otro dispositivo, vuelve a
              abrir el enlace de la invitación.
            </p>
          )}
          {registro && (
            <p role="status" className="card text-sm text-ink-2">
              <span className="font-semibold text-ink">Te invitaron a Guaca.</span> Escribe tu nombre, tu correo y una contraseña nueva. Te llegará un correo para confirmar (si no aparece, revisa la carpeta de spam).
            </p>
          )}
          <LoginForm startWithSignup={Boolean(registro)} phoneLogin={phoneLoginReady()} />
          <Link href="/recuperar" className="text-center text-sm font-medium text-brand">
            ¿Olvidaste tu contraseña?
          </Link>
        </>
      ) : (
        <p className="card text-sm text-ink-2">
          Falta conectar Supabase. Copia <code className="num">.env.example</code> a{" "}
          <code className="num">.env.local</code>, pon la URL y la clave de tu proyecto y reinicia el servidor.
        </p>
      )}
    </AuthShell>
  );
}
