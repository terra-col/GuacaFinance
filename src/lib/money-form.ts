import { isCurrency, parseHundredths, parseRate, toPesos, type Currency } from "./currency";
import { parsePesos } from "./finance";

export interface Money {
  /** In pesos, what every balance and total adds. */
  amount: number;
  currency: Currency;
  original_amount: number | null;
  rate: number | null;
}

/**
 * The amount a form sends (see AmountField). In another currency the pesos are worked out here
 * from the original and the rate: what the page says in pesos is never taken as given.
 */
export function readAmount(form: FormData, missing: string): { error: string } | Money {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const currency = text("currency") || "COP";
  if (!isCurrency(currency)) return { error: "Esa moneda no está disponible." };
  if (currency === "COP") {
    const amount = parsePesos(text("amount"));
    return amount ? { amount, currency, original_amount: null, rate: null } : { error: missing };
  }
  const hundredths = parseHundredths(text("original"));
  if (!hundredths) return { error: missing };
  const rate = parseRate(text("rate"));
  if (!rate) return { error: "Escribe la tasa: cuántos pesos vale cada unidad." };
  const amount = toPesos(hundredths, rate);
  if (!amount || !Number.isSafeInteger(amount)) return { error: "El valor no es válido." };
  return { amount, currency, original_amount: hundredths / 100, rate };
}

/** The columns of migration 0026, only when the form comes from a page that knows them. */
export const currencyColumns = (form: FormData, money: Money) =>
  form.has("currencies") ? { currency: money.currency, original_amount: money.original_amount, rate: money.rate } : {};

/** A scheduled value (a fixed bill, an income): empty is fine, it varies. */
export interface ScheduledMoney {
  /** In pesos; null when it varies. */
  amount: number | null;
  currency: Currency;
  original_amount: number | null;
  rate: number | null;
}

/**
 * The value of a fixed bill or an income as its form sends it (see AmountField). Empty means it
 * varies, also in another currency: the currency stays, with no value nor rate.
 */
export function readScheduledAmount(form: FormData): { error: string } | ScheduledMoney {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const currency = text("currency") || "COP";
  if (!isCurrency(currency)) return { error: "Esa moneda no está disponible." };
  const typed = currency === "COP" ? text("amount") : text("original");
  if (!typed) return { amount: null, currency, original_amount: null, rate: null };
  return readAmount(form, "El valor no es válido.");
}

/**
 * The columns of migration 0029 for a bill or an income: only when there is another currency now
 * or there was one before, so saving in pesos keeps working before the migration runs.
 */
export const scheduledCurrencyColumns = (money: ScheduledMoney, before?: { currency?: string | null } | null) =>
  money.currency !== "COP" || (before?.currency && before.currency !== "COP") ? { currency: money.currency, original_amount: money.original_amount, rate: money.rate } : {};
