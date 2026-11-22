// The «Mantener la sesión iniciada» choice, shared by the server client and the proxy. No Next
// imports, so the proxy can use it.

/** Cookie with the «Mantener la sesión iniciada» choice: "0" means the session ends with the browser. */
export const REMEMBER_COOKIE = "guaca-recordar";

/**
 * Without «mantener la sesión», the session cookies lose their expiry and become browser-session
 * cookies: closing the browser signs the person out. Otherwise they keep Supabase's long life.
 */
export function sessionCookieOptions<T extends { maxAge?: number; expires?: Date }>(options: T, remember: boolean): T {
  if (remember) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
