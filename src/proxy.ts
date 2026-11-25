import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE, invitePath } from "@/lib/shared";
import { REMEMBER_COOKIE, sessionCookieOptions } from "@/lib/supabase/session-cookies";

export async function proxy(request: NextRequest) {
  // The Wallet and calendar endpoints authenticate with their own tokens, not the session.
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const path = request.nextUrl.pathname;
  const isLogin = path === "/login";
  // Reachable without a session: asking for the reset link, and the email links that open one.
  const isPublic = isLogin || path === "/recuperar" || path.startsWith("/auth/");

  const toLogin = () => {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    const redirected = NextResponse.redirect(target);
    // An invitation to a group survives signing in or signing up; nothing else is remembered.
    const invited = invitePath(path);
    if (invited) redirected.cookies.set(INVITE_COOKIE, invited, { path: "/", maxAge: 60 * 60 * 24, sameSite: "lax", httpOnly: true, secure: true });
    return redirected;
  };

  // Without Supabase credentials only the login page (which explains the setup) is reachable.
  if (!url || !key) return isPublic ? NextResponse.next() : toLogin();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        // Refreshed session cookies keep the «mantener la sesión» choice made when signing in.
        const keep = request.cookies.get(REMEMBER_COOKIE)?.value !== "0";
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, sessionCookieOptions(options, keep));
        }
        for (const [name, value] of Object.entries(headers ?? {})) {
          response.headers.set(name, value);
        }
      },
    },
  });

  // getClaims() refreshes the session when it expired and checks the token's signature against the
  // project's public keys, kept in memory: no trip to Supabase on each screen. (With a project still
  // on the old shared secret it asks Supabase, like getUser() did.) The pages ask Supabase themselves.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims.sub ? data.claims : null;

  if (!user && !isPublic) return toLogin();
  if (user && isLogin) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    return NextResponse.redirect(home);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
