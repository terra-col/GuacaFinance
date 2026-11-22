import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_HOUSE, type HouseBill, type HouseData, type HouseLink, type HousePayment, type HouseSkip } from "./house";
import { allPages } from "./paging";

/**
 * The receipts of the person's houses (Row Level Security picks them). Before migration 0025 there
 * are none and `ready` is false. Any other failure throws: treated as «no receipts» it would show a
 * month with more free money than there is.
 */
export async function loadHouse(supabase: SupabaseClient): Promise<HouseData> {
  const [bills, payments, links, skips] = await Promise.all([
    allPages<HouseBill>((from, to) => supabase.from("house_bills").select("*").order("created_at").order("id").range(from, to)),
    allPages<HousePayment>((from, to) => supabase.from("house_payments").select("*").order("created_at").order("id").range(from, to)),
    allPages<HouseLink>((from, to) => supabase.from("house_links").select("*").order("tx_id").range(from, to)),
    allPages<HouseSkip>((from, to) => supabase.from("house_skips").select("*").order("id").range(from, to)),
  ]);
  if (bills.error?.code === "42P01" || bills.error?.code === "PGRST205") return NO_HOUSE;
  const error = bills.error ?? payments.error ?? links.error ?? skips.error;
  if (error) throw new Error(`No se pudieron leer los recibos de la casa: ${error.message}`);
  return { ready: true, bills: bills.rows, payments: payments.rows, links: links.rows, skips: skips.rows };
}
