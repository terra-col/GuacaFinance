// Budgets per category, scheduled incomes and the month's free money. Pure, tested under `node --test`.

import { daysInMonth, dueDates, findPlanned, findSkip, foreignOf, monthEnd, paidMonth, shiftMonth, type ChecklistItem, type Planned, type Skip, type Tx } from "./finance.ts";
import { assign, datesIn, nextDates, type Every, type Schedule } from "./recurrence.ts";

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
  /** In another currency (migration 0029): its value there and the rate; `amount` is in pesos. */
  currency?: string | null;
  original_amount?: number | string | null;
  rate?: number | string | null;
  /** How often it arrives; absent (before migration 0019) is monthly. */
  every?: Every;
  starts_on?: string | null;
}

export const incomeSchedule = (income: Pick<Income, "day" | "every" | "starts_on">): Schedule => ({ every: income.every ?? "monthly", day: income.day, start: income.starts_on ?? null });

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

/**
 * The next date an income arrives, from today on (today counts): a monthly one this month or the
 * next, a prima in its next month (June, December), a one-time extra on its month. null when a
 * one-time extra is already behind.
 */
export function nextIncomeDate(income: Pick<Income, "months" | "once_month" | "day" | "every" | "starts_on">, today: string): string | null {
  const schedule = incomeSchedule(income);
  if (schedule.every !== "monthly") return nextDates(schedule, today, 1)[0] ?? null;
  for (let i = 0; i < 24; i++) {
    const month = shiftMonth(today.slice(0, 7), i);
    if (!arrivesIn(income, month)) continue;
    const due = dueDates(income.day, `${month}-01`, 1)[0];
    if (due >= today) return due;
  }
  return null;
}

export interface IncomeItem {
  type: "income";
  id: string;
  name: string;
  due: string;
  expected: number | null;
  received: boolean;
  receivedAmount: number;
  /** The day of the month as set. */
  day?: number;
  /** Once received: the date and account of the latest movement, to edit it in place. */
  receivedOn?: string | null;
  receivedIn?: string | null;
  /** Expected date passed and nothing recorded. */
  late: boolean;
  skipped: Skip | null;
  /** The value set for this month (monthly incomes only): `expected` already is it. */
  planned?: Planned | null;
  /** The usual value, without this month's. */
  usual?: number | null;
  /** In another currency: received in it, with the rate of the day. */
  foreign?: ChecklistItem["foreign"];
  /** Monthly incomes: the months it arrives in, to offer only those for a month's value. */
  arrives?: ChecklistItem["arrives"];
  accountId: string | null;
  /** A one-time extra rather than a recurring income. */
  once: boolean;
  /** Incomes that are not monthly: how often, the date this row ticks, and what ticked it. */
  every?: Every;
  forDate?: string;
  paidIds?: string[];
}

/** The month's scheduled incomes, ticked when a movement with that income_id lands in the month. */
export function incomeChecklist(incomes: Income[], txs: Tx[], month: string, today: string, skips: Skip[] = [], planned: Planned[] = []): IncomeItem[] {
  const byDate: IncomeItem[] = incomes
    .filter((i) => incomeSchedule(i).every !== "monthly")
    .flatMap((i) =>
      assign(datesIn(incomeSchedule(i), month), txs.filter((t) => t.income_id === i.id && paidMonth(t) === month)).map(({ date, payments }) => {
        const received = payments.length > 0;
        const skipped = date && !received ? findSkip(skips, "income", i.id, month, date) : null;
        return {
          type: "income" as const,
          id: i.id,
          name: i.name,
          every: i.every,
          forDate: date ?? undefined,
          paidIds: payments.map((t) => t.id),
          due: date ?? payments[0].occurred_on,
          expected: i.amount,
          received,
          receivedAmount: payments.reduce((sum, t) => sum + t.amount, 0),
          receivedOn: payments[0]?.occurred_on ?? null,
          receivedIn: payments[0]?.account_id ?? null,
          late: !received && !skipped && date !== null && date < today,
          skipped,
          accountId: i.account_id,
          foreign: foreignOf(i),
          once: false,
        };
      }),
    );
  const byMonth: IncomeItem[] = incomes
    .filter(
      (i) =>
        incomeSchedule(i).every === "monthly" &&
        arrivesIn(i, month) &&
        // Monthly again after another periodicity: earlier months show only what arrived.
        (!i.starts_on || month >= i.starts_on.slice(0, 7) || txs.some((t) => t.income_id === i.id && paidMonth(t) === month)),
    )
    .map((i) => {
      const got = txs.filter((t) => t.income_id === i.id && paidMonth(t) === month);
      const due = dueDates(i.day, `${month}-01`, 1)[0];
      const skipped = got.length === 0 ? findSkip(skips, "income", i.id, month) : null;
      const plan = findPlanned(planned, "income", i.id, month);
      return {
        type: "income" as const,
        id: i.id,
        name: i.name,
        due,
        expected: plan?.amount ?? i.amount,
        planned: plan,
        usual: i.amount,
        arrives: { months: i.months, once: i.once_month ?? null },
        foreign: foreignOf(i),
        day: i.day,
        received: got.length > 0,
        receivedAmount: got.reduce((sum, t) => sum + t.amount, 0),
        receivedOn: got[0]?.occurred_on ?? null,
        receivedIn: got[0]?.account_id ?? null,
        late: got.length === 0 && !skipped && due < today,
        skipped,
        accountId: i.account_id,
        once: Boolean(i.once_month),
      };
    });
  return [...byMonth, ...byDate].sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
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
    if (item.paid) {
      obligations += item.paidAmount;
      continue;
    }
    // What one already put of a receipt still open (a house's, paid in parts).
    obligations += item.paidAmount;
    if (item.expected) {
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
    day: i.day,
    every: i.every === "monthly" ? undefined : i.every,
    forDate: i.forDate,
    paidIds: i.paidIds,
    paidOn: i.receivedOn ?? null,
    paidFrom: i.receivedIn ?? null,
    overdue: i.late,
    skipped: i.skipped,
    planned: i.planned,
    usual: i.usual,
    arrives: i.arrives,
    foreign: i.foreign,
    quick: i.expected && i.accountId && (!i.foreign || i.planned) ? { amount: i.expected, accountId: i.accountId } : null,
  };
}

/** Last day of a month, re-exported for callers that only import this module. */
export { monthEnd };
