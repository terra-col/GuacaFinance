// Entrar con el celular: the server finds the account's email through the database functions of
// migration 0014, which only answer with the server's key (GUACA_LOGIN_KEY, never sent to the
// browser). Without the key, or before the migration runs, Guaca simply asks for the email.
import type { SupabaseClient } from "@supabase/supabase-js";

const loginKey = () => process.env.GUACA_LOGIN_KEY || null;

/** Whether signing in with the phone is set up on this server. */
export const phoneLoginReady = () => Boolean(loginKey());

/** The verified email of the account with this phone, or null (no account, unverified, or not set up). */
export async function emailForPhone(supabase: SupabaseClient, phone: string): Promise<string | null> {
  const key = loginKey();
  if (!key) return null;
  const { data, error } = await supabase.rpc("phone_login_email", { p_phone: phone, p_key: key });
  return error || typeof data !== "string" ? null : data;
}

/** Whether another account already uses this phone. False when it cannot be checked. */
export async function phoneTaken(supabase: SupabaseClient, phone: string, userId: string | null = null): Promise<boolean> {
  const key = loginKey();
  if (!key) return false;
  const { data, error } = await supabase.rpc("phone_in_use", { p_phone: phone, p_key: key, p_user: userId });
  return !error && data === true;
}

export const PHONE_TAKEN = "Ese celular ya está en otra cuenta de Guaca. Usa otro o déjalo vacío.";
