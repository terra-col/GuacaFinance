import type { SupabaseClient } from "@supabase/supabase-js";
import { allPages } from "./paging";
import { NO_SHARED, type SharedData, type SharedEntry, type SharedGroup, type SharedLink, type SharedMember, type SharedShare } from "./shared";

/** The table is not there yet: migration 0016 has not run. */
const notMigrated = (error: { code?: string }) => error.code === "42P01" || error.code === "PGRST205";

/**
 * The person's groups (Row Level Security picks them). Before migration 0016 there are none and
 * `ready` is false. Any other failure throws: treated as «no groups» it would silently show
 * everything paid for others as one's own spending.
 */
export async function loadShared(supabase: SupabaseClient): Promise<{ shared: SharedData; ready: boolean }> {
  const groups = await supabase.from("shared_groups").select("*").order("created_at", { ascending: false });
  if (groups.error) {
    if (notMigrated(groups.error)) return { shared: NO_SHARED, ready: false };
    throw new Error(`No se pudieron leer los grupos: ${groups.error.message}`);
  }
  if (groups.data.length === 0) return { shared: NO_SHARED, ready: true };

  const [members, entries, shares, links] = await Promise.all([
    allPages<SharedMember>((from, to) => supabase.from("shared_members").select("*").order("created_at").order("id").range(from, to)),
    allPages<SharedEntry>((from, to) =>
      supabase.from("shared_entries").select("*").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).order("id").range(from, to),
    ),
    allPages<SharedShare>((from, to) => supabase.from("shared_shares").select("*").order("entry_id").order("member_id").range(from, to)),
    allPages<SharedLink>((from, to) => supabase.from("shared_links").select("*").order("tx_id").range(from, to)),
  ]);
  const error = members.error ?? entries.error ?? shares.error ?? links.error;
  if (error) throw new Error(`No se pudieron leer los gastos compartidos: ${error.message}`);
  return {
    ready: true,
    shared: { groups: groups.data as SharedGroup[], members: members.rows, entries: entries.rows, shares: shares.rows, links: links.rows },
  };
}
