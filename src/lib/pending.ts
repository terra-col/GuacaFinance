import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharedData } from "./shared";

export interface Pending {
  /** From someone one already shares a group with (0020): accepting enters at once. */
  requests: { member_id: string; group_name: string; member_name: string; invited_by_name: string | null }[];
  /** To one's phone (0023): accepting asks the inviter to confirm. */
  phone: { id: string; from_name: string; waiting: boolean }[];
  /** Who accepted an invitation of one's, to confirm it is them. */
  claims: { id: string; member_name: string; group_name: string; account_name: string; account_email: string }[];
}

/** What waits for the person's answer. */
export async function loadPending(supabase: SupabaseClient, shared: SharedData, userId: string): Promise<Pending> {
  const none = { data: [], error: null };
  const [requests, phone, claims] = await Promise.all([
    // The names of groups one is not in yet come only through this function.
    shared.requests?.some((r) => r.user_id === userId) ? supabase.rpc("shared_my_requests") : none,
    shared.social ? supabase.rpc("shared_phone_invites") : none,
    shared.social ? supabase.rpc("shared_phone_claims") : none,
  ]);
  const error = requests.error ?? phone.error ?? claims.error;
  if (error) throw new Error(`No se pudieron leer tus invitaciones: ${error.message}`);
  return { requests: requests.data ?? [], phone: phone.data ?? [], claims: claims.data ?? [] };
}

export const pendingCount = ({ requests, phone, claims }: Pending) => requests.length + phone.filter((p) => !p.waiting).length + claims.length;
