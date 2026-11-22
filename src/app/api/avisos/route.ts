import { createClient } from "@/lib/supabase/server";

/** The bell's number. The database answers for whoever is signed in; without a session, nothing. */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shared_pending_count");
  return Response.json(error ? {} : { count: Number(data) || 0 }, { headers: { "Cache-Control": "no-store" } });
}
