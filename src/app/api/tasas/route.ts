import { todayRates } from "@/lib/rates";

/** Today's rates, asked by the page only when another currency is chosen. Nothing personal in it. */
export async function GET() {
  return Response.json(await todayRates(), { headers: { "Cache-Control": "private, max-age=3600" } });
}
