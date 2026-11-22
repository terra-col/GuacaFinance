// Modo privado: every amount of money on screen becomes "$ •••••", so the app can be shown
// without showing balances. Everything else (percentages, counts, dates, bars) stays.

/** Cookie with the choice: "1" hides amounts. Read by the server so the first paint is already private. */
export const PRIVACY_COOKIE = "guaca-privado";

export const MASK = "$ •••••";

// What formatCOP and formatCompact write: "$ 1.234.567", "-$ 42.000", "+$ 7.000.000", "$8 M", "$85 k", "$-42 k".
// The number ends on a digit, so a comma or full stop after an amount stays in the sentence.
const MONEY = /[-+−]?\$\s?-?\d(?:[\d.,]*\d)?(?:\s?(?:M|k|mil|mil M|B)\b)?/g;

/** The text with its amounts masked, or null when it has none (nothing to change). */
export function maskMoney(text: string): string | null {
  MONEY.lastIndex = 0;
  if (!MONEY.test(text)) return null;
  MONEY.lastIndex = 0;
  return text.replace(MONEY, MASK);
}
