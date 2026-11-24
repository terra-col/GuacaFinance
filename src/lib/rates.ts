import { NO_RATES, type Rates } from "./currency";

// The dollar is the official TRM (Superfinanciera, published on datos.gov.co). The euro is crossed
// with it through a daily reference (open.er-api.com, no key); the dirham is pegged to the dollar.
// Only rates are asked for: nothing of the person ever goes out.
//
// Kept in this server's memory for six hours, not in Next's data cache: every save revalidates the
// whole app, and the rates would be asked for again on each one.
const TRM = "https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC";
const CROSS = "https://open.er-api.com/v6/latest/USD";
const AED_PER_USD = 3.6725;
const SIX_HOURS = 6 * 60 * 60 * 1000;
const RETRY = 10 * 60 * 1000;

let kept: { rates: Rates; until: number } | null = null;
let asking: Promise<Rates> | null = null;

async function json(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

async function ask(): Promise<Rates> {
  const [trm, cross] = await Promise.allSettled([json(TRM), json(CROSS)]);
  const official = trm.status === "fulfilled" ? (trm.value as { valor?: string; vigenciadesde?: string }[])[0] : undefined;
  const others = cross.status === "fulfilled" ? (cross.value as { rates?: Record<string, number> }).rates : undefined;
  const fromTrm = Number(official?.valor);
  const usd = fromTrm > 0 ? fromTrm : others?.COP && others.COP > 0 ? others.COP : null;
  if (!usd) return NO_RATES;
  return {
    USD: round(usd),
    EUR: others?.EUR && others.EUR > 0 ? round(usd / others.EUR) : null,
    AED: round(usd / AED_PER_USD),
    date: fromTrm > 0 ? (official?.vigenciadesde ?? "").slice(0, 10) || null : null,
  };
}

/** Today's rates; any that cannot be read stays null and is typed by hand. */
export async function todayRates(): Promise<Rates> {
  if (kept && kept.until > Date.now()) return kept.rates;
  asking ??= ask()
    .then((rates) => {
      // What failed is asked again sooner.
      kept = { rates, until: Date.now() + (rates.USD && rates.EUR ? SIX_HOURS : RETRY) };
      return rates;
    })
    .finally(() => {
      asking = null;
    });
  return asking;
}
