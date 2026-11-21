// Pure balance logic. No framework imports, so it runs under `node --test`.
// Dates are 'YYYY-MM-DD' strings throughout to stay clear of timezone shifts.

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
}

/** The favourite account for payments, if one is set. */
export const favoriteAccountId = (accounts: Pick<Account, "id" | "kind" | "favorite">[]) =>
  accounts.find((a) => a.favorite && (a.kind === "savings" || a.kind === "cash"))?.id ?? null;

/** Accounts with the favourite first, the rest in their order: for the "pay from" lists. */
export const favoriteFirst = <T extends Pick<Account, "favorite">>(accounts: T[]) =>
  [...accounts].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)));

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
}

/** «Este mes no aplica» for a bill, a debt instalment or an income. */
export interface Skip {
  id: string;
  item_type: "bill" | "debt" | "income" | "goal";
  item_id: string;
  month: string;
  note: string | null;
}

export const KIND_LABEL: Record<AccountKind, string> = {
  savings: "Cuenta bancaria",
  cash: "Efectivo",
  credit_card: "Tarjeta de crédito",
  loan: "Préstamo",
};

/** Category of the movements "Actualizar saldo" records. They reconcile; they are not payments the person made. */
export const ADJUSTMENT = "Ajuste de saldo";

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

/** Balance at the end of `date` (inclusive); with no date, the balance after every movement. */
export function balanceAt(account: Account, txs: Tx[], date?: string): number {
  let balance = account.opening_balance;
  for (const tx of txs) {
    if (date && tx.occurred_on > date) continue;
    balance += effect(account, tx);
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
    if (tx.kind !== "expense" || !tx.occurred_on.startsWith(month)) continue;
    const category = tx.category?.trim() || "Sin categoría";
    sums.set(category, (sums.get(category) ?? 0) + tx.amount);
  }
  return [...sums.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
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

/** As typed in a money field: "$ 1.500.000"; empty when there are no digits. */
export function formatPesosInput(input: string | number | null | undefined): string {
  const digits = String(input ?? "").replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
  return digits ? `$ ${new Intl.NumberFormat("es-CO").format(Number(digits))}` : "";
}

export function formatDate(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/** Today's date in Colombia, where the user's months and due dates are counted. */
export function todayInBogota(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now);
}

/** Parses what a person types as pesos ("1.500.000", "$ 80,000", "25000") into an integer. */
export function parsePesos(input: string): number | null {
  const digits = input.replace(/[^\d]/g, "");
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
}

export interface BillStatus {
  /** The due date that matters now: this month's while unpaid, next month's once paid. */
  date: string;
  paidThisMonth: boolean;
  /** Days until `date`; negative when this month's bill is overdue. */
  days: number;
}

/** A bill counts as paid for the month once a movement dated in that month references it. */
export function billStatus(bill: Bill, txs: Tx[], today: string): BillStatus {
  const month = today.slice(0, 7);
  const paidThisMonth = txs.some((t) => t.bill_id === bill.id && t.occurred_on.startsWith(month));
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
  /** «income» rows come from incomeChecklist: «paid» then means received. */
  type: "bill" | "debt" | "income" | "goal";
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
  /** Enough to record the payment in one tap; null when the amount or the account must be asked. */
  quick: { amount: number; accountId: string | null } | null;
  /** Once paid: the date and the account of the latest payment, to edit it in place. */
  paidOn?: string | null;
  paidFrom?: string | null;
}

/**
 * The month's obligatory payments: every fixed bill, plus every card and loan
 * that owes something. Nothing is stored per month: an item is ticked when a
 * movement dated in that month pays it, so each new month starts unticked.
 */
/** Soonest first; items with no payment day last; then by name. */
export const byDue = (a: ChecklistItem, b: ChecklistItem) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.name.localeCompare(b.name);

export function monthlyChecklist(accounts: Account[], bills: Bill[], txs: Tx[], month: string, today: string, skips: Skip[] = []): ChecklistItem[] {
  const skipOf = (type: Skip["item_type"], id: string) => skips.find((s) => s.item_type === type && s.item_id === id && s.month === month) ?? null;
  const first = `${month}-01`;
  const last = monthEnd(month);
  const inMonth = (t: Tx) => t.occurred_on >= first && t.occurred_on <= last;
  const dueIn = (day: number) => dueDates(day, first, 1)[0];
  const spendable = accounts.filter((a) => a.kind !== "loan");
  // Where a payment comes from by default: the favourite account, else the one used last time.
  const favorite = favoriteAccountId(accounts);
  const items: ChecklistItem[] = [];

  for (const bill of bills) {
    // created_at is a UTC timestamp: read it as a date in Bogotá before comparing months.
    if (bill.created_at && todayInBogota(new Date(bill.created_at)).slice(0, 7) > month) continue;
    const payments = txs.filter((t) => t.bill_id === bill.id && inMonth(t));
    const due = dueIn(bill.due_day);
    const lastUsed = txs.find((t) => t.bill_id === bill.id)?.account_id; // txs come newest first
    const accountId = favorite ?? (accounts.some((a) => a.id === lastUsed) ? lastUsed! : spendable.length === 1 ? spendable[0].id : null);
    items.push({
      type: "bill",
      id: bill.id,
      name: bill.name,
      due,
      expected: bill.amount,
      paid: payments.length > 0,
      paidAmount: payments.reduce((sum, t) => sum + t.amount, 0),
      paidOn: payments[0]?.occurred_on ?? null,
      paidFrom: payments[0]?.account_id ?? null,
      overdue: payments.length === 0 && due < today && !skipOf("bill", bill.id),
      skipped: payments.length === 0 ? skipOf("bill", bill.id) : null,
      quick: bill.amount && accountId ? { amount: bill.amount, accountId } : null,
    });
  }

  for (const account of accounts) {
    if (!isDebt(account) || account.opening_date > last) continue;
    const payments = txs.filter((t) => t.kind === "payment" && t.account_id === account.id && t.category !== ADJUSTMENT && inMonth(t));
    const owedAtStart = balanceAt(account, txs, addDays(first, -1));
    const owedNow = balanceAt(account, txs, last);
    if (payments.length === 0 && Math.max(owedAtStart, owedNow) <= 0) continue;
    const due = account.due_day ? dueIn(account.due_day) : null;
    const lastSource = txs.find((t) => t.kind === "payment" && t.account_id === account.id && t.category !== ADJUSTMENT)?.source_account_id ?? null;
    // Loans have their instalment; cards, the minimum or fixed payment when one is registered.
    const instalment = account.monthly_payment ? Math.min(account.monthly_payment, Math.max(owedNow, 0)) : null;
    items.push({
      type: "debt",
      id: account.id,
      name: account.name,
      due,
      expected: instalment,
      paid: payments.length > 0,
      paidAmount: payments.reduce((sum, t) => sum + t.amount, 0),
      paidOn: payments[0]?.occurred_on ?? null,
      paidFrom: payments[0]?.source_account_id ?? null,
      overdue: payments.length === 0 && due !== null && due < today && !skipOf("debt", account.id),
      skipped: payments.length === 0 ? skipOf("debt", account.id) : null,
      quick: instalment ? { amount: instalment, accountId: favorite ?? (accounts.some((a) => a.id === lastSource) ? lastSource : null) } : null,
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
