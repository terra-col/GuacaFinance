import type { SupabaseClient } from "@supabase/supabase-js";
import { allPages } from "./paging";
import { NO_SHARED, type SharedData, type SharedEntry, type SharedGroup, type SharedLink, type SharedMember, type SharedRequest, type SharedShare } from "./shared";

/** The table is not there yet: migration 0016 has not run. */
const notMigrated = (error: { code?: string }) => error.code === "42P01" || error.code === "PGRST205";

/**
 * The person's groups (Row Level Security picks them). Before migration 0016 there are none and
 * `ready` is false. Any other failure throws: treated as «no groups» it would silently show
 * everything paid for others as one's own spending.
 */
export async function loadShared(supabase: SupabaseClient): Promise<{ shared: SharedData; ready: boolean }> {
  const [groups, asked] = await Promise.all([
    supabase.from("shared_groups").select("*").order("created_at", { ascending: false }),
    supabase.from("shared_requests").select("member_id, group_id, user_id"),
  ]);
  if (groups.error) {
    if (notMigrated(groups.error)) return { shared: NO_SHARED, ready: false };
    throw new Error(`No se pudieron leer los grupos: ${groups.error.message}`);
  }
  // Editing and contacts arrived with migration 0020.
  if (asked.error && !notMigrated(asked.error)) throw new Error(`No se pudieron leer las invitaciones: ${asked.error.message}`);
  const editable = !asked.error;
  const requests = (asked.data ?? []) as SharedRequest[];
  if (groups.data.length === 0) return { shared: { ...NO_SHARED, editable, requests }, ready: true };

  const [members, entries, shares, links, contacts] = await Promise.all([
    allPages<SharedMember>((from, to) => supabase.from("shared_members").select("*").order("created_at").order("id").range(from, to)),
    allPages<SharedEntry>((from, to) =>
      supabase.from("shared_entries").select("*").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).order("id").range(from, to),
    ),
    allPages<SharedShare>((from, to) => supabase.from("shared_shares").select("*").order("entry_id").order("member_id").range(from, to)),
    allPages<SharedLink>((from, to) => supabase.from("shared_links").select("*").order("tx_id").range(from, to)),
    editable
      ? allPages<{ member_id: string; name: string | null; phone: string | null }>((from, to) =>
          supabase.from("shared_contacts").select("member_id, name, phone").order("member_id").range(from, to),
        )
      : { rows: [], error: null },
  ]);
  const error = members.error ?? entries.error ?? shares.error ?? links.error ?? contacts.error;
  if (error) throw new Error(`No se pudieron leer los gastos compartidos: ${error.message}`);
  return {
    ready: true,
    shared: {
      editable,
      requests,
      groups: groups.data as SharedGroup[],
      // Each person reads the group with the names they have in their own contacts.
      members: members.rows.map((m) => {
        const contact = contacts.rows.find((c) => c.member_id === m.id);
        return contact ? { ...m, name: contact.name ?? m.name, phone: contact.phone } : m;
      }),
      entries: entries.rows,
      shares: shares.rows,
      links: links.rows,
    },
  };
}
