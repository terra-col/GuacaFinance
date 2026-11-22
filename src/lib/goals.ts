// Goals: save an amount by a date, or clear a debt by a date. Pure, so it is tested.
import { monthlyRate } from "./advice.ts";
import { balanceAt, daysBetween, dueDates, findSkip, paidMonth, shiftMonth, type Account, type ChecklistItem, type Skip, type Tx } from "./finance.ts";
import { assign, datesIn, type Every, type Schedule } from "./recurrence.ts";

export type GoalKind = "save" | "payoff";

export interface Goal {
  id: string;
  kind: GoalKind;
  name: string;
  emoji: string | null;
  target_amount: number | null;
  target_date: string;
  account_id: string | null;
  start_balance: number | null;
  created_on: string;
  /** Savings plan: what is set aside each time (monthly unless plan_every says otherwise), on which day, and (optionally) from which income. */
  plan_amount?: number | null;
  plan_day?: number | null;
  plan_income_id?: string | null;
  plan_every?: Every;
  plan_start?: string | null;
  /** Saved or paid in one go on its date (no monthly plan): shows up once in Pagos, never "behind". */
  plan_once?: boolean;
}

export interface GoalDeposit {
  id: string;
  goal_id: string;
  amount: number;
  occurred_on: string;
  /** The month of the plan it covers, when not the month of its date (saved early). */
  for_month?: string | null;
  /** The plan's date it covers, when the plan is not monthly. */
  for_date?: string | null;
}

/** «scheduled»: a goal with no pace to keep (one payment on its date, or no plan): only its date matters. */
export type GoalStatus = "done" | "ahead" | "on_track" | "behind" | "overdue" | "scheduled";

export interface GoalView {
  goal: Goal;
  /** The debt, for payoff goals. */
  account: Account | null;
  target: number;
  achieved: number;
  remaining: number;
  progress: number;
  daysLeft: number;
  /** What to set aside to arrive on time, rounded up to the next $1.000. */
  perMonth: number;
  perQuincena: number;
  perWeek: number;
  /** Where you should be today: by the plan's instalments due so far, or (debts) a steady pace. 0 when there is no pace. */
  expected: number;
  status: GoalStatus;
}

const roundUp = (n: number) => (n <= 0 ? 0 : Math.ceil(n / 1000) * 1000);

export const goalSchedule = (goal: Goal): Schedule => ({ every: goal.plan_every ?? "monthly", day: goal.plan_day ?? 1, start: goal.plan_start ?? null });

/** A plan's dates in a month when it is not monthly: none before the goal existed nor after its date. */
const datesOfPlan = (goal: Goal, month: string) => datesIn(goalSchedule(goal), month).filter((d) => d >= goal.created_on && d <= goal.target_date);

/** The fixed monthly payment that clears `balance` in `months` at `annualPct` (plain division at 0%). */
export function paymentToClear(balance: number, months: number, annualPct: number | null): number {
  if (balance <= 0) return 0;
  const n = Math.max(1, months);
  const r = annualPct ? monthlyRate(annualPct) : 0;
  return r === 0 ? balance / n : (r * balance) / (1 - Math.pow(1 + r, -n));
}

export function goalView(goal: Goal, deposits: GoalDeposit[], accounts: Account[], txs: Tx[], today: string): GoalView {
  const daysLeft = daysBetween(today, goal.target_date);
  const days = Math.max(1, daysLeft);
  const months = Math.max(1, Math.ceil(days / 30.44));
  const quincenas = Math.max(1, Math.ceil(days / 15.22));
  const weeks = Math.max(1, Math.ceil(days / 7));

  let account: Account | null = null;
  let target: number;
  let achieved: number;
  let remaining: number;
  let perMonth: number;

  if (goal.kind === "payoff") {
    account = accounts.find((a) => a.id === goal.account_id) ?? null;
    const owed = account ? Math.max(0, balanceAt(account, txs)) : 0;
    target = Math.max(goal.start_balance ?? owed, owed, 1);
    remaining = owed;
    achieved = target - owed;
    perMonth = paymentToClear(owed, months, account?.annual_rate ?? null);
  } else {
    target = goal.target_amount ?? 0;
    achieved = deposits.filter((d) => d.goal_id === goal.id).reduce((sum, d) => sum + d.amount, 0);
    remaining = Math.max(0, target - achieved);
    perMonth = remaining / months;
  }

  // The pace to compare with. A debt: steady from the day the goal was set. Savings with a monthly
  // plan: the plan's instalments due so far. A one-time goal or one with no plan has no pace, so
  // it is never "behind": only its date counts.
  let expected = 0;
  let paced = true;
  let ahead = target * 0.1;
  if (goal.kind === "payoff") {
    const span = Math.max(1, daysBetween(goal.created_on, goal.target_date));
    const elapsed = Math.min(span, Math.max(0, daysBetween(goal.created_on, today)));
    expected = (target * elapsed) / span;
  } else if (goal.plan_amount && goal.plan_day) {
    const due = planDates(goal.plan_day, goal.created_on.slice(0, 7), goal.created_on, goal.target_date, goal.plan_every, goal.plan_start).filter((d) => d <= today).length;
    expected = Math.min(target, due * goal.plan_amount);
    ahead = goal.plan_amount;
  } else {
    paced = false;
  }
  const slack = target * 0.03;

  const status: GoalStatus =
    remaining <= 0
      ? "done"
      : daysLeft < 0
        ? "overdue"
        : !paced
          ? "scheduled"
          : achieved < expected - slack
            ? "behind"
            : achieved >= expected + ahead
              ? "ahead"
              : "on_track";

  return {
    goal,
    account,
    target,
    achieved,
    remaining,
    progress: target > 0 ? Math.min(1, Math.max(0, achieved / target)) : 0,
    daysLeft,
    perMonth: roundUp(perMonth),
    perQuincena: goal.kind === "payoff" ? roundUp(perMonth / 2) : roundUp(remaining / quincenas),
    perWeek: goal.kind === "payoff" ? roundUp((perMonth * 12) / 52) : roundUp(remaining / weeks),
    expected,
    status,
  };
}

/**
 * The plan's instalment dates from month `from` up to the goal's date: the plan's day each month,
 * never after the goal's date and never before the goal existed (a plan made on the 21st with
 * day 15 starts next month). Other periodicities: each of their dates in that span.
 */
export function planDates(planDay: number, from: string, createdOn: string, targetDate: string, every: Every = "monthly", start: string | null = null): string[] {
  const dates: string[] = [];
  for (let m = from; m <= targetDate.slice(0, 7); m = shiftMonth(m, 1)) {
    if (every !== "monthly") {
      for (const date of datesIn({ every, day: planDay, start }, m)) if (date >= createdOn && date <= targetDate) dates.push(date);
      continue;
    }
    const planned = dueDates(planDay, `${m}-01`, 1)[0];
    const date = planned > targetDate ? targetDate : planned;
    if (date >= createdOn) dates.push(date);
  }
  return dates;
}

/** What to set aside on each of the plan's dates to reach the goal on time, rounded up to $1.000. */
export function suggestedPlan(remaining: number, planDay: number, today: string, targetDate: string, createdOn = today): number {
  const count = planDates(planDay, today.slice(0, 7), createdOn > today ? createdOn : today, targetDate).length;
  return roundUp(remaining / Math.max(1, count));
}

const savedBy = (goal: Goal, deposits: GoalDeposit[], before: string) =>
  deposits.filter((d) => d.goal_id === goal.id && d.occurred_on < before).reduce((sum, d) => sum + d.amount, 0);

/**
 * The month's savings instalments: one row in Pagos per savings goal with a plan, from the month
 * it was created to the month of its date. Ticked by a deposit to the goal that month. A goal
 * already reached drops off, unless something was deposited this month.
 */
export function goalChecklist(goals: Goal[], deposits: GoalDeposit[], month: string, today: string, skips: Skip[] = []): ChecklistItem[] {
  const first = `${month}-01`;
  const items: ChecklistItem[] = [];
  for (const goal of goals) {
    if (goal.kind !== "save" || !goal.target_amount) continue;
    const monthly = Boolean(goal.plan_amount && goal.plan_day);
    if (!monthly && !goal.plan_once) continue;
    if (month < goal.created_on.slice(0, 7) || month > goal.target_date.slice(0, 7)) continue;
    if (monthly && !goal.plan_once && goalSchedule(goal).every !== "monthly") {
      items.push(...savingsByDate(goal, deposits, month, today, skips));
      continue;
    }
    // A one-time goal: only the month of its date.
    if (goal.plan_once && month !== goal.target_date.slice(0, 7)) continue;
    const thisMonth = deposits.filter((d) => d.goal_id === goal.id && paidMonth(d) === month && d.amount > 0);
    const missing = goal.target_amount - savedBy(goal, deposits, first);
    if (missing <= 0 && thisMonth.length === 0) continue;
    const skip = findSkip(skips, "goal", goal.id, month);
    // The plan's day, but never after the goal's own date.
    const planned = goal.plan_once ? goal.target_date : dueDates(goal.plan_day!, first, 1)[0];
    const due = planned > goal.target_date ? goal.target_date : planned;
    const expected = goal.plan_once ? Math.max(missing, 0) || goal.target_amount : Math.min(goal.plan_amount!, Math.max(missing, 0)) || goal.plan_amount!;
    const paid = thisMonth.length > 0;
    // A plan day that had already passed when the goal was created starts next month.
    if (!paid && due < goal.created_on) continue;
    items.push({
      type: "goal",
      id: goal.id,
      name: goal.plan_once ? goal.name : `Ahorro: ${goal.name}`,
      due,
      expected,
      paid,
      paidAmount: thisMonth.reduce((sum, d) => sum + d.amount, 0),
      paidOn: thisMonth[0]?.occurred_on ?? null, // deposits come newest first
      overdue: !paid && due < today && !skip,
      skipped: paid ? null : skip,
      quick: { amount: expected, accountId: null },
    });
  }
  return items;
}

/** A plan that is not monthly: one row per date, each asking for what is still missing at most. */
function savingsByDate(goal: Goal, deposits: GoalDeposit[], month: string, today: string, skips: Skip[]): ChecklistItem[] {
  const own = deposits.filter((d) => d.goal_id === goal.id);
  const slots = assign(datesOfPlan(goal, month), own.filter((d) => d.amount > 0 && paidMonth(d) === month));
  let left = goal.target_amount! - own.reduce((sum, d) => sum + d.amount, 0);
  const items: ChecklistItem[] = [];
  for (const { date, payments } of slots) {
    const paid = payments.length > 0;
    if (!paid && left <= 0) continue;
    const skip = date && !paid ? findSkip(skips, "goal", goal.id, month, date) : null;
    const expected = paid ? goal.plan_amount! : Math.min(goal.plan_amount!, left);
    if (!paid && !skip) left -= expected;
    items.push({
      type: "goal",
      id: goal.id,
      name: `Ahorro: ${goal.name}`,
      every: goal.plan_every,
      forDate: date ?? undefined,
      due: date ?? payments[0].occurred_on,
      expected,
      paid,
      paidAmount: payments.reduce((sum, d) => sum + d.amount, 0),
      paidOn: payments[0]?.occurred_on ?? null,
      paidIds: payments.map((d) => d.id),
      overdue: !paid && !skip && date !== null && date < today,
      skipped: skip,
      quick: { amount: expected, accountId: null },
    });
  }
  return items;
}

export interface PlanOutlook {
  /** Plan instalments still ahead, up to the goal's date (this month's counts if not yet saved). */
  instalments: number;
  /** Where the plan leaves you on the goal's date. */
  projected: number;
  enough: boolean;
  /** What would still be missing on that date. */
  shortfall: number;
  /** The next instalment's date, or null when none is left. */
  next: string | null;
}

/** Whether keeping the plan reaches the goal on time. */
export function planOutlook(view: GoalView, deposits: GoalDeposit[], today: string): PlanOutlook | null {
  const { goal } = view;
  if (goal.kind !== "save" || !goal.plan_amount || !goal.plan_day) return null;
  const month = today.slice(0, 7);
  const savedThisMonth = deposits.some((d) => d.goal_id === goal.id && paidMonth(d) === month && d.amount > 0);
  let dates: string[] = [];
  if (goalSchedule(goal).every === "monthly") dates = planDates(goal.plan_day, savedThisMonth ? shiftMonth(month, 1) : month, goal.created_on, goal.target_date);
  else {
    const own = deposits.filter((d) => d.goal_id === goal.id && d.amount > 0);
    for (let m = month; m <= goal.target_date.slice(0, 7); m = shiftMonth(m, 1)) {
      for (const slot of assign(datesOfPlan(goal, m), own.filter((d) => paidMonth(d) === m))) {
        if (slot.date && slot.payments.length === 0) dates.push(slot.date);
      }
    }
  }
  const instalments = dates.length;
  const projected = view.achieved + instalments * goal.plan_amount;
  return {
    instalments,
    projected,
    enough: projected >= view.target,
    shortfall: Math.max(0, view.target - projected),
    next: dates[0] ?? null,
  };
}
