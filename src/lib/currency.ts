// Other currencies. The peso stays the currency of everything: an amount in USD, EUR or AED is
// turned into pesos with the rate of the day it is written down, and both are kept. Pure, so it is tested.

export type Currency = "COP" | "USD" | "EUR" | "AED";

export const CURRENCIES: { code: Currency; symbol: string; name: string }[] = [
  { code: "COP", symbol: "$", name: "Pesos" },
  { code: "USD", symbol: "US$", name: "Dólares" },
  { code: "EUR", symbol: "€", name: "Euros" },
  { code: "AED", symbol: "AED", name: "Dírhams" },
];

export const isCurrency = (raw: unknown): raw is Currency => CURRENCIES.some((c) => c.code === raw);

/** Pesos for one unit of each, and where they came from. null: not known today. */
export interface Rates {
  USD: number | null;
  EUR: number | null;
  AED: number | null;
  /** 'YYYY-MM-DD' of the official one (TRM), when there is one. */
  date: string | null;
}

export const NO_RATES: Rates = { USD: null, EUR: null, AED: null, date: null };

/**
 * A number as people write it, in hundredths: "12,50", "1.234,5", "1,234.50", "12.5". With both
 * separators the last one is the decimal one; with only a point followed by exactly three digits
 * it groups thousands. null when it is not a number.
 */
export function parseHundredths(raw: string): number | null {
  const clean = raw.replace(/[^\d.,]/g, "");
  if (!/\d/.test(clean)) return null;
  const lastComma = clean.lastIndexOf(",");
  const lastPoint = clean.lastIndexOf(".");
  let whole = clean;
  let decimals = "";
  if (lastComma >= 0 && lastPoint >= 0) {
    const at = Math.max(lastComma, lastPoint);
    [whole, decimals] = [clean.slice(0, at), clean.slice(at + 1)];
  } else if (lastComma >= 0) {
    [whole, decimals] = [clean.slice(0, lastComma), clean.slice(lastComma + 1)];
  } else if (lastPoint >= 0 && !/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    [whole, decimals] = [clean.slice(0, lastPoint), clean.slice(lastPoint + 1)];
  }
  whole = whole.replace(/[.,]/g, "");
  if (decimals.length > 2 || /[.,]/.test(decimals)) return null;
  const value = Number(whole || "0") * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

/** A rate as people write it, to four decimals at most ("3.505,92", "3505.92"). */
export function parseRate(raw: string): number | null {
  const clean = raw.replace(/[^\d.,]/g, "");
  const at = Math.max(clean.lastIndexOf(","), clean.lastIndexOf("."));
  const threeAfterPoint = /^\d{1,3}(\.\d{3})+$/.test(clean);
  const [whole, decimals] = at >= 0 && !threeAfterPoint ? [clean.slice(0, at), clean.slice(at + 1)] : [clean, ""];
  if (decimals.length > 4 || /[.,]/.test(decimals)) return null;
  const value = Number(`${whole.replace(/[.,]/g, "") || "0"}.${decimals || "0"}`);
  return Number.isFinite(value) && value > 0 && value < 1_000_000 ? value : null;
}

/** The pesos of an amount in hundredths at a rate. */
export const toPesos = (hundredths: number, rate: number) => Math.round((hundredths * rate) / 100);

/** "US$ 12,50", "€ 1.234,00". */
export function formatForeign(amount: number, currency: Currency): string {
  const symbol = CURRENCIES.find((c) => c.code === currency)!.symbol;
  return `${symbol} ${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

/** "3.505,92". */
export const formatRate = (rate: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(rate);

/** A fixed bill or an income in another currency: its value there and the rate it was saved at. */
export interface Foreign {
  currency?: string | null;
  original_amount?: number | string | null;
  rate?: number | string | null;
  amount: number | null;
}

/**
 * Bills and incomes in another currency, in pesos at today's rate when it is known; otherwise they
 * keep the pesos of the rate they were saved at. Those in pesos are left as they are.
 */
export function atTodayRate<T extends Foreign>(items: T[], rates: Rates): T[] {
  return items.map((item) => {
    if (!item.currency || item.currency === "COP" || !isCurrency(item.currency) || item.original_amount == null) return item;
    const today = rates[item.currency as Exclude<Currency, "COP">];
    if (!today) return item;
    return { ...item, amount: toPesos(Math.round(Number(item.original_amount) * 100), today), rate: today };
  });
}

/** Whether any of them is in another currency with a value (and so wants today's rates). */
export const needsRates = (items: Foreign[]) => items.some((i) => i.currency && i.currency !== "COP" && i.original_amount != null);

/**
 * The currency totals are shown in (chosen in Ajustes, kept in the profile). The data stays in
 * pesos; totals are turned into it at today's rate. `rate`: pesos per unit (1 for pesos), null when
 * today's is not known, and then totals stay in pesos.
 */
export interface MainCurrency {
  code: Currency;
  rate: number | null;
}

export const PESOS: MainCurrency = { code: "COP", rate: 1 };

/** The main currency saved in the profile; pesos when none or an unknown one. */
export const mainCurrencyCode = (metadata: Record<string, unknown> | null | undefined): Currency =>
  isCurrency(metadata?.main_currency) ? metadata.main_currency : "COP";

/** Whether totals are really shown in another currency (it has a rate today). */
export const showsForeign = (main: MainCurrency) => main.code !== "COP" && Boolean(main.rate);

/** A total in pesos, in the main currency: «$ 8.130.890», or «US$ 2.239,40» at today's rate. */
export function formatMain(pesos: number, main: MainCurrency): string {
  if (!showsForeign(main)) return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(pesos);
  return formatForeign(pesos / main.rate!, main.code);
}
