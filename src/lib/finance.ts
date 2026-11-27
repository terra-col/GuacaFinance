// Pure balance logic. No framework imports, so it runs under `node --test`.
// Dates are 'YYYY-MM-DD' strings throughout to stay clear of timezone shifts.
import { assign, datesIn, nextDates, type Every, type Schedule } from "./recurrence.ts";
import type { HouseReceipt } from "./house.ts";

export type AccountKind = "savings" | "cash" | "credit_card" | "loan";
export type TxKind = "income" | "expense" | "payment";

export interface Account {
  id: string;
  kind: AccountKind;
  name: string;
  institution: string | null;
  opening_balance: number;
  opening_date: string;
  credit_limit: number | null;
  annual_rate: number | null;
  monthly_payment: number | null;
  statement_day: number | null;
  due_day: number | null;
  wallet_card_name: string | null;
  /** Card colour chosen by the user; null = suggested from the bank. */
  color?: string | null;
  last4?: string | null;
  /** Small image uploaded by the user, as a data URL. */
  logo?: string | null;
  /** Loans: the amount originally borrowed, to measure how much is left. */
  original_amount?: number | null;
  /** Loans: how many instalments in total (the new term, if refinanced). */
  term_months?: number | null;
  /** Loans: 'YYYY-MM' of the first instalment; with the term it gives "cuota 14 de 36". */
  first_due_month?: string | null;
  /** Debts: fixed or variable rate, and what a variable one follows (IBR + 6, UVR + 7…). */
  rate_type?: "fixed" | "variable" | null;
  rate_reference?: string | null;
  /** Debts: the bank stretched the term ("rediferido"). */
  refinanced?: boolean;
  /** Savings or cash: the account payments come from by default (one per person). */
  favorite?: boolean;
  /** Place in its carousel, chosen by dragging; null = after the ordered ones, oldest first. */
  position?: number | null;
  /** Its currency (migration 0030); absent or COP is pesos. */
  currency?: string | null;
  /** In another currency: the opening balance in it (`opening_balance` is its pesos that day). */
  opening_original?: number | string | null;
  /** In another currency: pesos per unit today, set when the data is loaded (or the last one known). */
  fx_rate?: number | null;
}

export type ForeignCode = "USD" | "EUR" | "AED";
const FOREIGN: ForeignCode[] = ["USD", "EUR", "AED"];
const isForeignCode = (raw: unknown): raw is ForeignCode => FOREIGN.includes(raw as ForeignCode);

/** The account's currency when it is not pesos; null for pesos. */
export const accountForeign = (account: Pick<Account, "currency">): ForeignCode | null => (isForeignCode(account.currency) ? account.currency : null);

/**
 * Pesos per unit to value an account in another currency: today's (`fx_rate`), else the rate of
 * its latest movement in that currency, else the one of its opening balance. 0 when none is known.
 */
export function valueRate(account: Account, txs: Tx[]): number {
  if (account.fx_rate && account.fx_rate > 0) return account.fx_rate;
  const currency = accountForeign(account);
  let latest: Tx | null = null;
  for (const tx of txs) {
    if ((tx.account_id !== account.id && tx.source_account_id !== account.id) || tx.currency !== currency || !Number(tx.rate)) continue;
    if (!latest || tx.occurred_on > latest.occurred_on) latest = tx;
  }
  if (latest) return Number(latest.rate);
  const original = Number(account.opening_original ?? 0);
  return original > 0 ? account.opening_balance / original : 0;
}

/** The favourite account for payments, if one is set. */
export const favoriteAccountId = (accounts: Pick<Account, "id" | "kind" | "favorite">[]) =>
  accounts.find((a) => a.favorite && (a.kind === "savings" || a.kind === "cash"))?.id ?? null;

/** Accounts with the favourite first, the rest in their order: for the "pay from" lists. */
export const favoriteFirst = <T extends Pick<Account, "favorite">>(accounts: T[]) =>
  [...accounts].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)));

/** The order of a carousel: the favourite first, then the order the person chose, then the rest as they came. */
export const shelfOrder = <T extends Pick<Account, "favorite" | "position">>(accounts: T[]) =>
  [...accounts].sort(
    (a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
  );

export interface Tx {
  id: string;
  account_id: string;
  source_account_id: string | null;
  kind: TxKind;
  amount: number;
  category: string | null;
  description: string | null;
  occurred_on: string;
  source: string;
  bill_id: string | null;
  /** Set when the movement records a scheduled income as received. */
  income_id?: string | null;
  /** The month it pays in Pagos when that is not the month of its date (next month's rent paid early). */
  for_month?: string | null;
  /** The date it ticks, for what does not repeat monthly (the quincena of the 15th). */
  for_date?: string | null;
  /** When it was written down. */
  created_at?: string;
  /** An adjustment that is a checkpoint: the account's balance at that moment, as the bank showed it. */
  checkpoint?: number | null;
  /** Written in another currency (migration 0026): the original and the rate it became pesos at. */
  currency?: string;
  original_amount?: number | string | null;
  rate?: number | string | null;
}

/** The month a payment ticks in Pagos: the one it was marked for, else the month of its date. */
export const paidMonth = (t: { occurred_on: string; for_month?: string | null }) => t.for_month ?? t.occurred_on.slice(0, 7);

/** «Este mes no aplica» for a bill, a debt instalment or an income. */
export interface Skip {
  id: string;
  item_type: "bill" | "debt" | "income" | "goal";
  item_id: string;
  month: string;
  /** Only that date, for what does not repeat monthly. */
  for_date?: string | null;
  note: string | null;
}

/**
 * «Este mes va a ser tanto» (migration 0027): the card's statement, a utility's receipt or a
 * variable income, set for one month. The usual value stays as it is.
 */
export interface Planned {
  id: string;
  item_type: "bill" | "debt" | "income";
  item_id: string;
  month: string;
  amount: number;
}

export const findPlanned = (planned: Planned[], type: Planned["item_type"], id: string, month: string): Planned | null =>
  planned.find((p) => p.item_type === type && p.item_id === id && p.month === month) ?? null;

/** How far ahead a month's value can be set (the server checks the same): as far as the calendar shows. */
export const PLAN_AHEAD = 12;

/**
 * The months a row's value can be set for: this month and the next twelve, only those an income
 * arrives in. Nothing for what is not monthly (a weekly bill has several dates a month) or for a
 * goal or a house's receipt.
 */
export function planMonths(item: Pick<ChecklistItem, "type" | "forDate" | "every" | "arrives">, today: string): string[] {
  if (item.forDate || item.every || !["bill", "debt", "income"].includes(item.type)) return [];
  const current = today.slice(0, 7);
  const months = Array.from({ length: PLAN_AHEAD + 1 }, (_, i) => shiftMonth(current, i));
  const arrives = item.arrives;
  if (!arrives) return months;
  if (arrives.once) return months.filter((m) => m === arrives.once);
  return arrives.months ? months.filter((m) => arrives.months!.includes(Number(m.slice(5, 7)))) : months;
}

export const KIND_LABEL: Record<AccountKind, string> = {
  savings: "Cuenta bancaria",
  cash: "Efectivo",
  credit_card: "Tarjeta de crédito",
  loan: "Préstamo",
};

/** Category of the movements "Actualizar saldo" records. They reconcile; they are not payments the person made. */
export const ADJUSTMENT = "Ajuste de saldo";

/**
 * An adjustment moves a balance and nothing else: it is never income, spending or a payment.
 * Every total of what came in or went out leaves it out.
 */
export const isAdjustment = (tx: Pick<Tx, "category">) => tx.category === ADJUSTMENT;

export const CATEGORIES = ["Ocio", "Mercado", "Restaurantes", "Transporte", "Hogar", "Salud", "Suscripciones", "Recibos", "Intereses y cargos", "Otros"];

const CATEGORY_ICON: Record<string, string> = {
  ocio: "🎬",
  mercado: "🛒",
  restaurantes: "🍽️",
  transporte: "🚗",
  hogar: "🏠",
  salud: "💊",
  suscripciones: "📺",
  recibos: "🧾",
  "intereses y cargos": "🏦",
  otros: "✨",
};

/**
 * The categories to offer: the app's own first, then the person's own ones (as they wrote them,
 * once each, ignoring case), alphabetically. Balance adjustments are not a category to pick.
 */
export function knownCategories(used: (string | null | undefined)[]): string[] {
  const seen = new Set(CATEGORIES.map((c) => c.toLocaleLowerCase("es")));
  const own: string[] = [];
  for (const raw of used) {
    const c = raw?.trim();
    if (!c || c === ADJUSTMENT || seen.has(c.toLocaleLowerCase("es"))) continue;
    seen.add(c.toLocaleLowerCase("es"));
    own.push(c);
  }
  return [...CATEGORIES, ...own.sort((a, b) => a.localeCompare(b, "es"))];
}

/** An emoji for a movement: by category for expenses, by kind for the rest. */
export function txIcon(tx: Pick<Tx, "kind" | "category">): string {
  if (tx.kind === "income") return "💰";
  if (tx.kind === "payment") return "💳";
  return CATEGORY_ICON[tx.category?.trim().toLowerCase() ?? ""] ?? "🧾";
}

export const isDebt = (account: Pick<Account, "kind">) => account.kind === "credit_card" || account.kind === "loan";

/** Money you hold: savings accounts and cash. They receive income and can fund payments to debts. */
export const holdsMoney = (account: Pick<Account, "kind">) => !isDebt(account);

/** Which movement kinds may be recorded directly on an account of this kind. */
export function allowedTxKinds(kind: AccountKind): TxKind[] {
  return kind === "savings" || kind === "cash" ? ["income", "expense"] : ["expense", "payment"];
}

/**
 * How one movement changes an account's balance. For savings the balance is
 * money held; for cards and loans it is money owed, so a purchase raises it
 * and a payment lowers it.
 */
export function effect(account: Account, tx: Tx): number {
  if (tx.account_id === account.id) {
    if (holdsMoney(account)) {
      if (tx.kind === "income") return tx.amount;
      if (tx.kind === "expense") return -tx.amount;
      return 0;
    }
    if (tx.kind === "expense") return tx.amount;
    if (tx.kind === "payment") return -tx.amount;
    return 0;
  }
  if (tx.source_account_id === account.id && tx.kind === "payment") return -tx.amount;
  return 0;
}

const writtenAt = (tx: Tx) => (tx.created_at ? Date.parse(tx.created_at) : 0);
const isCheckpoint = (tx: Tx) => tx.checkpoint !== null && tx.checkpoint !== undefined;

/** The account's latest checkpoint up to `date`. */
export function lastCheckpoint(account: Pick<Account, "id">, txs: Tx[], date?: string): Tx | null {
  let last: Tx | null = null;
  for (const tx of txs) {
    if (tx.account_id !== account.id || !isCheckpoint(tx) || (date && tx.occurred_on > date)) continue;
    if (!last || tx.occurred_on > last.occurred_on || (tx.occurred_on === last.occurred_on && writtenAt(tx) > writtenAt(last))) last = tx;
  }
  return last;
}

/**
 * Balance at the end of `date` (inclusive); with no date, the balance after every movement.
 *
 * A checkpoint («Actualizar saldo») replaces everything before it: only what came after counts.
 * That is later dates and, when the check was made on its own day, what was written down later
 * that day. A check dated in the past is that day's closing balance, so it includes all of it.
 */
export function balanceAt(account: Account, txs: Tx[], date?: string): number {
  // In another currency: its own balance, valued in pesos at today's rate (or the last one known).
  if (accountForeign(account)) return Math.round((nativeBalance(account, txs, date) / 100) * valueRate(account, txs));
  return running(account, txs, date, false);
}

/**
 * The balance in the account's own currency: pesos for an account in pesos, cents (hundredths)
 * for one in dollars, euros or dirhams. Its checkpoints are in those same units.
 */
export function nativeBalance(account: Account, txs: Tx[], date?: string): number {
  return running(account, txs, date, Boolean(accountForeign(account)));
}

/** What a movement does to an account in another currency, in cents of that currency. */
function nativeEffect(account: Account, tx: Tx): number {
  const pesos = effect(account, tx);
  if (!pesos) return 0;
  if (tx.currency === account.currency && tx.original_amount != null) return Math.sign(pesos) * Math.round(Number(tx.original_amount) * 100);
  // Only an adjustment (its checkpoint is what counts) or a movement from before it had a currency.
  if (isAdjustment(tx)) return 0;
  const rate = Number(tx.rate) || account.fx_rate || 0;
  return rate ? Math.round((pesos / rate) * 100) : 0;
}

function running(account: Account, txs: Tx[], date: string | undefined, native: boolean): number {
  const check = lastCheckpoint(account, txs, date);
  let balance = check ? check.checkpoint! : native ? Math.round(Number(account.opening_original ?? 0) * 100) : account.opening_balance;
  const sameDayCounts = Boolean(check?.created_at && todayInBogota(new Date(check.created_at)) === check.occurred_on);
  const checkedAt = check ? writtenAt(check) : 0;
  for (const tx of txs) {
    if (date && tx.occurred_on > date) continue;
    if (check) {
      if (tx === check || tx.occurred_on < check.occurred_on) continue;
      if (tx.occurred_on === check.occurred_on && !(sameDayCounts && writtenAt(tx) > checkedAt)) continue;
    }
    balance += native ? nativeEffect(account, tx) : effect(account, tx);
  }
  return balance;
}

export interface Totals {
  savings: number;
  debt: number;
  net: number;
}

export function totals(accounts: Account[], txs: Tx[], date?: string): Totals {
  let savings = 0;
  let debt = 0;
  for (const account of accounts) {
    if (date && account.opening_date > date) continue;
    const balance = balanceAt(account, txs, date);
    if (isDebt(account)) debt += balance;
    else savings += balance;
  }
  return { savings, debt, net: savings - debt };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** What one has and owes in one currency, there and in pesos today. */
export interface CurrencyBalance {
  currency: "COP" | ForeignCode;
  /** In that currency (whole pesos, or dollars with decimals). */
  have: number;
  owe: number;
  /** In pesos at today's rate (the same for pesos). */
  haveValue: number;
  oweValue: number;
  /** Pesos per unit it was valued at; null for pesos. */
  rate: number | null;
}

/**
 * The balance split by currency, for the detail behind the total: pesos first, then the others by
 * what they are worth. Only currencies with an account.
 */
export function balanceByCurrency(accounts: Account[], txs: Tx[]): CurrencyBalance[] {
  const groups = new Map<string, CurrencyBalance>();
  for (const account of accounts) {
    const code = accountForeign(account) ?? "COP";
    const group = groups.get(code) ?? { currency: code, have: 0, owe: 0, haveValue: 0, oweValue: 0, rate: code === "COP" ? null : valueRate(account, txs) || null };
    const value = balanceAt(account, txs);
    const own = code === "COP" ? value : nativeBalance(account, txs) / 100;
    if (isDebt(account)) {
      group.owe += own;
      group.oweValue += value;
    } else {
      group.have += own;
      group.haveValue += value;
    }
    groups.set(code, group);
  }
  return [...groups.values()].sort((a, b) => (a.currency === "COP" ? -1 : b.currency === "COP" ? 1 : b.haveValue + b.oweValue - (a.haveValue + a.oweValue)));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-based
}

/** The last `count` months ending at the month of `today`, oldest first, as 'YYYY-MM'. */
export function lastMonths(today: string, count: number): string[] {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.unshift(`${year}-${pad(month)}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

export function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return `${month}-${pad(daysInMonth(year, m))}`;
}

const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;
}

export interface MonthPoint extends Totals {
  month: string;
  label: string;
  /** Balance per account id; null while the account did not exist yet. */
  byAccount: Record<string, number | null>;
}

/**
 * Month-end balances for the last `count` months. The current month is cut at
 * `today`, so its point is the balance as of now, not a projection.
 */
export function monthlySeries(accounts: Account[], txs: Tx[], today: string, count = 12): MonthPoint[] {
  return lastMonths(today, count).map((month) => {
    const end = monthEnd(month);
    const cutoff = end > today ? today : end;
    const byAccount: Record<string, number | null> = {};
    for (const account of accounts) {
      byAccount[account.id] = account.opening_date > cutoff ? null : balanceAt(account, txs, cutoff);
    }
    return { month, label: monthLabel(month), ...totals(accounts, txs, cutoff), byAccount };
  });
}

export interface CategoryTotal {
  category: string;
  amount: number;
}

/** Spending (purchases and expenses, not debt payments) in a 'YYYY-MM' month, largest first. */
export function spendingByCategory(txs: Tx[], month: string): CategoryTotal[] {
  const sums = new Map<string, number>();
  for (const tx of txs) {
    if (tx.kind !== "expense" || isAdjustment(tx) || !tx.occurred_on.startsWith(month)) continue;
    const category = tx.category?.trim() || "Sin categoría";
    sums.set(category, (sums.get(category) ?? 0) + tx.amount);
  }
  return [...sums.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** What came in, was spent and was paid to debts in a 'YYYY-MM' month. */
export function monthFlows(txs: Tx[], month: string): Record<TxKind, number> {
  const flows = { income: 0, expense: 0, payment: 0 };
  for (const tx of txs) if (!isAdjustment(tx) && tx.occurred_on.startsWith(month)) flows[tx.kind] += tx.amount;
  return flows;
}

/** The next `count` dates on or after `today` that fall on `dueDay`, clamped to short months. */
export function dueDates(dueDay: number, today: string, count: number): string[] {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  const out: string[] = [];
  while (out.length < count) {
    const day = Math.min(dueDay, daysInMonth(year, month));
    const candidate = `${year}-${pad(month)}-${pad(day)}`;
    if (candidate >= today) out.push(candidate);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

export const nextDueDate = (dueDay: number, today: string) => dueDates(dueDay, today, 1)[0];

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const copCompact = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });

export const formatCOP = (amount: number) => cop.format(amount);
export const formatCompact = (amount: number) => `$${copCompact.format(amount)}`;

// Cents, as the banks show them: a comma and up to two digits at the end ("1.054.000,00"; three
// digits are thousands: "80,000"), or a point after comma thousands ("1,054,000.00").
const CENTS = /,(\d{0,2})\s*$/;
const CENTS_POINT = /(,\d{3})\.\d{1,2}\s*$/;
const withoutCents = (input: string) => input.replace(CENTS_POINT, "$1").replace(CENTS, "");

/**
 * As typed in a money field: "$ 1.500.000"; empty when there are no digits. Cents stay on screen
 * while they are typed ("$ 1.054.000,00") and parsePesos drops them.
 */
export function formatPesosInput(input: string | number | null | undefined): string {
  const typed = String(input ?? "").replace(CENTS_POINT, "$1");
  const cents = typed.match(CENTS);
  const digits = withoutCents(typed).replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
  return digits ? `$ ${new Intl.NumberFormat("es-CO").format(Number(digits))}${cents ? `,${cents[1]}` : ""}` : "";
}

export function formatDate(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/** Today's date in Colombia, where the user's months and due dates are counted. */
export function todayInBogota(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now);
}

/** Parses what a person types as pesos ("1.500.000", "$ 80,000", "25000", "1.054.000,00") into an integer, without cents. */
export function parsePesos(input: string): number | null {
  const digits = withoutCents(input).replace(/[^\d]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Parses the amount Apple Wallet hands to Shortcuts, whose format follows the
 * phone's region: "85000", "$ 85.000,00", "85,000.00", "85.000". A separator
 * followed by exactly three digits is a thousands separator; a final separator
 * followed by one or two digits is the decimal point. Rounds to whole pesos.
 */
export function parseWalletAmount(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input > 0 ? Math.round(input) : null;
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[^\d.,]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const decimal = cleaned.match(/[.,](\d{1,2})$/);
  const whole = (decimal ? cleaned.slice(0, decimal.index) : cleaned).replace(/[.,]/g, "");
  const value = Math.round(Number(`${whole || "0"}.${decimal ? decimal[1] : "0"}`));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export interface Bill {
  id: string;
  name: string;
  amount: number | null;
  due_day: number;
  category: string | null;
  /** When the bill was registered (ISO timestamp); months before it do not list the bill. */
  created_at?: string;
  /** How often it repeats; absent (before migration 0017) is monthly. */
  every?: Every;
  starts_on?: string | null;
  /** From that month it is a receipt of a house (migration 0025): earlier months keep it. */
  ended_month?: string | null;
  /** The card or loan it is the instalment of (migration 0026): ticking it is a payment to it. */
  pays_account?: string | null;
  /** A one-time payment (migration 0028): only that month, on its day. */
  once_month?: string | null;
  /** In another currency (migration 0029): its value there and the rate; `amount` is in pesos. */
  currency?: string | null;
  original_amount?: number | string | null;
  rate?: number | string | null;
}

/** What a row in another currency needs to be paid in it. */
export interface ForeignValue {
  currency: "USD" | "EUR" | "AED";
  /** Its value in that currency; null when it varies. */
  original: number | null;
}

/** A bill or an income in another currency, as its row shows and pays it; undefined in pesos. */
export function foreignOf(item: { currency?: string | null; original_amount?: number | string | null }): ForeignValue | undefined {
  if (item.currency !== "USD" && item.currency !== "EUR" && item.currency !== "AED") return undefined;
  return { currency: item.currency, original: item.original_amount == null ? null : Number(item.original_amount) };
}

/** The fixed payments still one's own. */
export const currentBills = <T extends Pick<Bill, "ended_month">>(bills: T[]) => bills.filter((b) => !b.ended_month);

export const billSchedule = (bill: Bill): Schedule => ({ every: bill.every ?? "monthly", day: bill.due_day, start: bill.starts_on ?? null });

/** The next date a bill falls on, today included. */
/** The date of a one-time payment: its day in its month. */
export const onceDate = (bill: Pick<Bill, "due_day" | "once_month">) => dueDates(bill.due_day, `${bill.once_month}-01`, 1)[0];

/** The next date a bill falls on, today included; null for a one-time payment already behind. */
export function nextBillDate(bill: Bill, today: string): string | null {
  if (bill.once_month) {
    const date = onceDate(bill);
    return date >= today ? date : null;
  }
  return nextDates(billSchedule(bill), today, 1)[0] ?? null;
}

/**
 * Whether «this time does not apply»: by date for what is not monthly, by month for the rest.
 */
export function findSkip(skips: Skip[], type: Skip["item_type"], id: string, month: string, date?: string | null): Skip | null {
  return skips.find((s) => s.item_type === type && s.item_id === id && (date ? s.for_date === date : !s.for_date && s.month === month)) ?? null;
}

export interface BillStatus {
  /** The due date that matters now: this month's while unpaid, next month's once paid. */
  date: string;
  paidThisMonth: boolean;
  /** Days until `date`; negative when this month's bill is overdue. */
  days: number;
}

/**
 * A monthly bill counts as paid for the month once a movement dated in that month references it
 * (or once it is skipped). The others: their first date still open, from this month on.
 */
export function billStatus(bill: Bill, txs: Tx[], today: string, skips: Skip[] = []): BillStatus {
  const month = today.slice(0, 7);
  const schedule = billSchedule(bill);
  if (bill.once_month) {
    // Only its month counts: before it, nothing to warn about yet; after it, it is the past.
    const date = onceDate(bill);
    const done = bill.once_month !== month || txs.some((t) => t.bill_id === bill.id && paidMonth(t) === month) || findSkip(skips, "bill", bill.id, month) !== null;
    return { date, paidThisMonth: done, days: daysBetween(today, date) };
  }
  if (schedule.every !== "monthly") {
    const own = txs.filter((t) => t.bill_id === bill.id);
    for (let i = 0; i <= 12; i++) {
      const m = shiftMonth(month, i);
      for (const slot of assign(datesIn(schedule, m), own.filter((t) => paidMonth(t) === m))) {
        if (!slot.date || slot.payments.length || findSkip(skips, "bill", bill.id, m, slot.date)) continue;
        return { date: slot.date, paidThisMonth: false, days: daysBetween(today, slot.date) };
      }
    }
    // Nothing open in a year (it starts later): nothing to warn about.
    const date = nextBillDate(bill, today) ?? today;
    return { date, paidThisMonth: true, days: daysBetween(today, date) };
  }
  const paidThisMonth = txs.some((t) => t.bill_id === bill.id && paidMonth(t) === month) || findSkip(skips, "bill", bill.id, month) !== null;
  const [thisMonth, nextMonth] = dueDates(bill.due_day, `${month}-01`, 2);
  const date = paidThisMonth ? nextMonth : thisMonth;
  return { date, paidThisMonth, days: daysBetween(today, date) };
}

export function relativeDay(days: number): string {
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days === -1) return "venció ayer";
  return days > 0 ? `en ${days} días` : `venció hace ${-days} días`;
}

export interface ChecklistItem {
  /** «income» rows come from incomeChecklist: «paid» then means received. «house»: see house.ts. */
  type: "bill" | "debt" | "income" | "goal" | "house";
  /** A fixed bill that is the instalment of this card or loan. */
  paysDebt?: string;
  /** A receipt of a house: all it needs to be shown and paid. */
  house?: HouseReceipt;
  id: string;
  name: string;
  /** Due date inside the month, or null for a debt with no payment day. */
  due: string | null;
  /** What is expected this month; null when it varies (utilities, card payments). */
  expected: number | null;
  paid: boolean;
  paidAmount: number;
  overdue: boolean;
  /** Marked as not applying this month (a rescheduled card, a paused bill). */
  skipped: Skip | null;
  /** The value set for this month (a card's statement): `expected` already is it. Monthly rows only. */
  planned?: Planned | null;
  /** The usual value, without this month's: what comes back when the month's value is removed. */
  usual?: number | null;
  /** Incomes: the months (1–12) it arrives in, or the one month of a one-time extra. */
  arrives?: { months: number[] | null; once: string | null };
  /** A one-time payment rather than a fixed one. */
  once?: boolean;
  /** In another currency: paying it asks the rate of the day (unless a value in pesos was set for the month). */
  foreign?: ForeignValue;
  /** Enough to record the payment in one tap; null when the amount or the account must be asked. */
  quick: { amount: number; accountId: string | null } | null;
  /** Once paid: the date and the account of the latest payment, to edit it in place. */
  paidOn?: string | null;
  paidFrom?: string | null;
  /** Bills and incomes: the day of the month as set (a «31» shows as the 30th in November). */
  day?: number;
  /** Bills and savings that are not monthly: how often, the date this row ticks, and what ticked it. */
  every?: Every;
  forDate?: string;
  paidIds?: string[];
}

/** A row's key: what is not monthly appears several times in one month. */
export const rowKey = (item: Pick<ChecklistItem, "type" | "id" | "forDate">) => `${item.type}-${item.id}${item.forDate ? `-${item.forDate}` : ""}`;

/**
 * The month's obligatory payments: every fixed bill, plus every card and loan
 * that owes something. Nothing is stored per month: an item is ticked when a
 * movement dated in that month pays it, so each new month starts unticked.
 */
/**
 * The list the person works through: what is still pending first (late ones come first by their
 * date), then what was skipped this month, and what is already paid at the end.
 */
export const pendingFirst = <T extends Pick<ChecklistItem, "paid" | "skipped" | "due" | "name">>(a: T, b: T) => {
  const rank = (i: T) => (i.paid ? 2 : i.skipped ? 1 : 0);
  return rank(a) - rank(b) || (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.name.localeCompare(b.name);
};

/** Soonest first; items with no payment day last; then by name. */
export const byDue = (a: ChecklistItem, b: ChecklistItem) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.name.localeCompare(b.name);

export function monthlyChecklist(accounts: Account[], bills: Bill[], txs: Tx[], month: string, today: string, skips: Skip[] = [], planned: Planned[] = []): ChecklistItem[] {
  const skipOf = (type: Skip["item_type"], id: string) => findSkip(skips, type, id, month);
  const first = `${month}-01`;
  const last = monthEnd(month);
  const inMonth = (t: Tx) => paidMonth(t) === month;
  const dueIn = (day: number) => dueDates(day, first, 1)[0];
  const spendable = accounts.filter((a) => a.kind !== "loan");
  // Where a payment comes from by default: the favourite account, else the one used last time.
  const favorite = favoriteAccountId(accounts);
  const items: ChecklistItem[] = [];

  for (const bill of bills) {
    // created_at is a UTC timestamp: read it as a date in Bogotá before comparing months.
    const schedule = billSchedule(bill);
    const monthly = schedule.every === "monthly";
    if (bill.ended_month && month >= bill.ended_month) continue;
    if (monthly && bill.created_at && todayInBogota(new Date(bill.created_at)).slice(0, 7) > month) continue;
    const payments = txs.filter((t) => t.bill_id === bill.id && inMonth(t));
    // A one-time payment: only its month (or where it was paid, if it was marked for another).
    if (bill.once_month && bill.once_month !== month && payments.length === 0) continue;
    // Monthly again after having another periodicity: earlier months show only what was paid.
    if (monthly && payments.length === 0 && schedule.start && month < schedule.start.slice(0, 7)) continue;
    const due = dueIn(bill.due_day);
    const lastUsed = txs.find((t) => t.bill_id === bill.id)?.account_id; // txs come newest first
    // An instalment comes out of savings or cash, never another card.
    const accountId = bill.pays_account ? favorite : favorite ?? (accounts.some((a) => a.id === lastUsed) ? lastUsed! : spendable.length === 1 ? spendable[0].id : null);
    if (!monthly) {
      for (const { date, payments: ticked } of assign(datesIn(schedule, month), payments)) {
        const paid = ticked.length > 0;
        const skip = date && !paid ? findSkip(skips, "bill", bill.id, month, date) : null;
        items.push({
          type: "bill",
          id: bill.id,
          name: bill.name,
          paysDebt: bill.pays_account ?? undefined,
          every: schedule.every,
          forDate: date ?? undefined,
          due: date ?? ticked[0].occurred_on,
          expected: bill.amount,
          paid,
          paidAmount: ticked.reduce((sum, t) => sum + t.amount, 0),
          paidOn: ticked[0]?.occurred_on ?? null,
          paidFrom: ticked[0]?.account_id ?? null,
          paidIds: ticked.map((t) => t.id),
          overdue: !paid && !skip && date !== null && date < today,
          skipped: skip,
          foreign: foreignOf(bill),
          quick: bill.amount && accountId && !foreignOf(bill) ? { amount: bill.amount, accountId } : null,
        });
      }
      continue;
    }
    const plan = findPlanned(planned, "bill", bill.id, month);
    const expected = plan?.amount ?? bill.amount;
    // Its currency stays; a value set for the month is in pesos, so then it is paid in pesos (and in one tap).
    const foreign = foreignOf(bill);
    items.push({
      type: "bill",
      id: bill.id,
      name: bill.name,
      paysDebt: bill.pays_account ?? undefined,
      day: bill.due_day,
      due,
      expected,
      planned: plan,
      usual: bill.amount,
      // A one-time payment: its value can only be set for its month.
      ...(bill.once_month ? { once: true, arrives: { months: null, once: bill.once_month } } : {}),
      paid: payments.length > 0,
      paidAmount: payments.reduce((sum, t) => sum + t.amount, 0),
      paidOn: payments[0]?.occurred_on ?? null,
      paidFrom: payments[0]?.account_id ?? null,
      overdue: payments.length === 0 && due < today && !skipOf("bill", bill.id),
      skipped: payments.length === 0 ? skipOf("bill", bill.id) : null,
      foreign,
      quick: expected && accountId && (!foreign || plan) ? { amount: expected, accountId } : null,
    });
  }

  for (const account of accounts) {
    if (!isDebt(account) || account.opening_date > last) continue;
    // Its instalment is already a fixed bill of the list.
    if (bills.some((b) => b.pays_account === account.id && !(b.ended_month && month >= b.ended_month))) continue;
    const payments = txs.filter((t) => t.kind === "payment" && t.account_id === account.id && t.category !== ADJUSTMENT && inMonth(t));
    const owedAtStart = balanceAt(account, txs, addDays(first, -1));
    const owedNow = balanceAt(account, txs, last);
    if (payments.length === 0 && Math.max(owedAtStart, owedNow) <= 0) continue;
    const due = account.due_day ? dueIn(account.due_day) : null;
    const lastSource = txs.find((t) => t.kind === "payment" && t.account_id === account.id && t.category !== ADJUSTMENT)?.source_account_id ?? null;
    // Loans have their instalment; cards, the minimum or fixed payment when one is registered.
    const instalment = account.monthly_payment ? Math.min(account.monthly_payment, Math.max(owedNow, 0)) : null;
    // The statement says how much: that, even above the usual instalment.
    const plan = findPlanned(planned, "debt", account.id, month);
    const expected = plan?.amount ?? instalment;
    items.push({
      type: "debt",
      id: account.id,
      name: account.name,
      due,
      expected,
      planned: plan,
      usual: instalment,
      paid: payments.length > 0,
      paidAmount: payments.reduce((sum, t) => sum + t.amount, 0),
      paidOn: payments[0]?.occurred_on ?? null,
      paidFrom: payments[0]?.source_account_id ?? null,
      overdue: payments.length === 0 && due !== null && due < today && !skipOf("debt", account.id),
      skipped: payments.length === 0 ? skipOf("debt", account.id) : null,
      quick: expected ? { amount: expected, accountId: favorite ?? (accounts.some((a) => a.id === lastSource) ? lastSource : null) } : null,
    });
  }

  // By due date, paid or not: a ticked row stays where the person tapped it instead of jumping away.
  return items.sort(byDue);
}

/** 'YYYY-MM' shifted by a number of months. */
export function shiftMonth(month: string, by: number): string {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

const MONTH_FULL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthName = (month: string) => MONTH_FULL[Number(month.slice(5, 7)) - 1];
