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
