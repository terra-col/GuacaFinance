import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { emailLinkType, safeNext } from "@/lib/auth-links";
import { INVITE_COOKIE, invitePath } from "@/lib/shared";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Where every email link lands (confirm signup, reset password, invite, change
 * email). It opens the session and goes on to `next`.
 *
 * - `token_hash` + `type`: the links in our email templates. They work even
 *   when the email is opened on another device.
 * - `code`: Supabase's default links. They only work in the browser that asked
 *   for the email, because the PKCE verifier lives in its cookies.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured) redirect("/login");
  const params = new URL(request.url).searchParams;
  const next = safeNext(params.get("next"));
  const tokenHash = params.get("token_hash");
  const type = emailLinkType(params.get("type"));
  const code = params.get("code");

  const supabase = await createClient();
  let opened = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    opened = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    opened = !error;
  }

  if (!opened) redirect("/login?enlace=vencido");
  // Signed up from an invitation to a group, in this same browser: back to it.
  const jar = await cookies();
  const invited = next === "/" ? invitePath(jar.get(INVITE_COOKIE)?.value) : null;
  if (invited) jar.delete(INVITE_COOKIE);
  redirect(invited ?? next);
}
