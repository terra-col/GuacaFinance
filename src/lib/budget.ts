// Budgets per category, scheduled incomes and the month's free money. Pure, tested under `node --test`.

import { daysInMonth, dueDates, monthEnd, type ChecklistItem, type Skip, type Tx } from "./finance.ts";

export interface Budget {
  id: string;
  category: string;
  amount: number;
}

export interface Income {
  id: string;
  name: string;
  /** null when the amount changes month to month. */
  amount: number | null;
  day: number;
  /** Months (1–12) when it arrives; null = every month. */
  months: number[] | null;
  /** 'YYYY-MM' for a one-time income (overtime, a bonus); it shows only that month. */
  once_month?: string | null;
  account_id: string | null;
}

export type BudgetStatus = "ok" | "watch" | "over";

export interface BudgetView extends Budget {
  spent: number;
  left: number;
  /** spent / amount, uncapped (1.2 = 20 % over). */
  share: number;
  /** Share of the month already gone, to compare the pace. */
  pace: number;
  status: BudgetStatus;
  /** What can still be spent per remaining day, including today. */
  perDay: number;
}

const inMonth = (month: string) => (t: Tx) => t.occurred_on.slice(0, 7) === month;

/** Spending of the month against each budget. Status «watch» means spending runs ahead of the calendar. */
export function budgetViews(budgets: Budget[], txs: Tx[], month: string, today: string): BudgetView[] {
  const days = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  const current = today.slice(0, 7) === month;
  const past = today.slice(0, 7) > month;
  const elapsedDays = past ? days : current ? Number(today.slice(8, 10)) : 0;
  const pace = elapsedDays / days;
  const daysLeft = past ? 0 : days - elapsedDays + 1;
  const expenses = txs.filter((t) => t.kind === "expense" && inMonth(month)(t));

  return budgets
    .map((b) => {
      const spent = expenses.filter((t) => (t.category ?? "Otros") === b.category).reduce((sum, t) => sum + t.amount, 0);
      const share = spent / b.amount;
      const left = b.amount - spent;
      const status: BudgetStatus = share > 1 ? "over" : share >= 0.9 || (share > pace + 0.15 && share >= 0.5) ? "watch" : "ok";
      return { ...b, spent, left, share, pace, status, perDay: daysLeft > 0 && left > 0 ? Math.floor(left / daysLeft) : 0 };
    })
    .sort((a, b) => b.share - a.share);
}

export const arrivesIn = (income: Pick<Income, "months" | "once_month">, month: string) =>
  income.once_month ? income.once_month === month : !income.months || income.months.includes(Number(month.slice(5, 7)));

export interface IncomeItem {
  type: "income";
  id: string;
  name: string;
  due: string;
  expected: number | null;
  received: boolean;
  receivedAmount: number;
  /** Once received: the date and account of the latest movement, to edit it in place. */
  receivedOn?: string | null;
  receivedIn?: string | null;
  /** Expected date passed and nothing recorded. */
  late: boolean;
  skipped: Skip | null;
  accountId: string | null;
  /** A one-time extra rather than a recurring income. */
  once: boolean;
}

/** The month's scheduled incomes, ticked when a movement with that income_id lands in the month. */
export function incomeChecklist(incomes: Income[], txs: Tx[], month: string, today: string, skips: Skip[] = []): IncomeItem[] {
  return incomes
    .filter((i) => arrivesIn(i, month))
    .map((i) => {
      const got = txs.filter((t) => t.income_id === i.id && inMonth(month)(t));
      const due = dueDates(i.day, `${month}-01`, 1)[0];
      const skipped = got.length === 0 ? (skips.find((s) => s.item_type === "income" && s.item_id === i.id && s.month === month) ?? null) : null;
      return {
        type: "income" as const,
        id: i.id,
        name: i.name,
        due,
        expected: i.amount,
        received: got.length > 0,
        receivedAmount: got.reduce((sum, t) => sum + t.amount, 0),
        receivedOn: got[0]?.occurred_on ?? null,
        receivedIn: got[0]?.account_id ?? null,
        late: got.length === 0 && !skipped && due < today,
        skipped,
        accountId: i.account_id,
        once: Boolean(i.once_month),
      };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
}

export interface MonthPlan {
  /** Incomes expected (received amount when already in, else the scheduled one). */
  income: number;
  /** Income still to arrive this month. */
  incomePending: number;
  /** Obligations: paid amount, or the expected one when still pending. Skipped ones count zero. */
  obligations: number;
  obligationsPending: number;
  /** Obligations whose amount varies and is not yet known. */
  unknownObligations: number;
  budgets: number;
  /** income − obligations − budgets. Negative means the month does not close. */
  free: number;
}

/** Salary − obligations − budgets: how much is left to save, prepay or spend freely. */
export function monthPlan(incomes: IncomeItem[], checklist: ChecklistItem[], budgets: Budget[]): MonthPlan {
  let income = 0;
  let incomePending = 0;
  for (const i of incomes) {
    if (i.skipped) continue;
    const value = i.received ? i.receivedAmount : (i.expected ?? 0);
    income += value;
    if (!i.received) incomePending += value;
  }
  let obligations = 0;
  let obligationsPending = 0;
  let unknownObligations = 0;
  for (const item of checklist) {
    if (item.skipped) continue;
    if (item.paid) obligations += item.paidAmount;
    else if (item.expected) {
      obligations += item.expected;
      obligationsPending += item.expected;
    } else unknownObligations += 1;
  }
  const budgetTotal = budgets.reduce((sum, b) => sum + b.amount, 0);
  return { income, incomePending, obligations, obligationsPending, unknownObligations, budgets: budgetTotal, free: income - obligations - budgetTotal };
}

/** An income as a checklist row, so it ticks with the same component as payments. */
export function incomeRow(i: IncomeItem): ChecklistItem {
  return {
    type: "income",
    id: i.id,
    name: i.name,
    due: i.due,
    expected: i.expected,
    paid: i.received,
    paidAmount: i.receivedAmount,
    paidOn: i.receivedOn ?? null,
    paidFrom: i.receivedIn ?? null,
    overdue: i.late,
    skipped: i.skipped,
    quick: i.expected && i.accountId ? { amount: i.expected, accountId: i.accountId } : null,
  };
}

/** Last day of a month, re-exported for callers that only import this module. */
export { monthEnd };
