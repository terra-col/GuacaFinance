import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { REMEMBER_COOKIE, sessionCookieOptions } from "./session-cookies";

export { REMEMBER_COOKIE } from "./session-cookies";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export async function createClient({ remember }: { remember?: boolean } = {}) {
  const cookieStore = await cookies();
  const keep = remember ?? cookieStore.get(REMEMBER_COOKIE)?.value !== "0";
  return createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, sessionCookieOptions(options, keep));
          }
        } catch {
          // Server Components cannot write cookies; the proxy refreshes the session.
        }
      },
    },
  });
}
