import assert from "node:assert/strict";
import { test } from "node:test";
import { advise } from "./advice.ts";
import { monthPlan } from "./budget.ts";
import { billStatus, monthlyChecklist, type Account, type Bill, type Tx } from "./finance.ts";
import { goalChecklist, goalView, planDates, planOutlook, type Goal, type GoalDeposit } from "./goals.ts";
import { buildCalendar } from "./ics.ts";
import { assign, cadenceText, datesIn, nextDates, quincenaFrom, timesPerMonth } from "./recurrence.ts";

const bank: Account = {
  id: "bank", kind: "savings", name: "Banco", institution: null, opening_balance: 5_000_000, opening_date: "2026-01-01",
  credit_limit: null, annual_rate: null, monthly_payment: null, statement_day: null, due_day: null, wallet_card_name: null,
};
const bill = (b: Partial<Bill>): Bill => ({ id: "b", name: "Pago", amount: 100_000, due_day: 5, category: null, created_at: "2026-01-01T12:00:00Z", ...b });
let n = 0;
const pay = (occurred_on: string, more: Partial<Tx> = {}): Tx => ({
  id: `p${++n}`, account_id: "bank", source_account_id: null, kind: "expense", amount: 100_000, category: null, description: null, occurred_on, source: "manual", bill_id: "b", ...more,
});
const list = (b: Bill, txs: Tx[], month = "2026-11", today = "2026-11-22", skips = [] as Parameters<typeof monthlyChecklist>[5]) =>
  monthlyChecklist([bank], [b], txs, month, today, skips);

test("dates: every day and every 2 days, across months", () => {
  assert.equal(datesIn({ every: "daily", day: 1, start: "2026-11-01" }, "2026-11").length, 30);
  assert.deepEqual(datesIn({ every: "daily", day: 28, start: "2026-11-28" }, "2026-11"), ["2026-11-28", "2026-11-29", "2026-11-30"]);
  assert.deepEqual(datesIn({ every: "every2", day: 29, start: "2026-11-29" }, "2026-12").slice(0, 3), ["2026-12-01", "2026-12-03", "2026-12-05"]);
  assert.deepEqual(datesIn({ every: "every2", day: 30, start: "2026-11-30" }, "2026-12").slice(0, 2), ["2026-12-02", "2026-12-04"]);
});

test("dates: quincena is two days a month, not every 14 days", () => {
  const q = (day: number, month: string) => datesIn({ every: "biweekly", day, start: "2026-01-01" }, month);
  assert.deepEqual(q(5, "2026-11"), ["2026-11-05", "2026-11-20"]);
  assert.deepEqual(q(15, "2026-12"), ["2026-12-15", "2026-12-30"]);
  assert.deepEqual(q(31, "2026-12"), ["2026-12-15", "2026-12-31"]);
  assert.deepEqual(q(15, "2027-02"), ["2027-02-15", "2027-02-28"]);
  for (let day = 1; day <= 31; day++) assert.equal(q(quincenaFrom(day), "2027-02").length, 2, `day ${day}`);
});

test("dates: every 2, 3 and 6 months; the 31st stays the last day", () => {
  const year = (every: "bimonthly" | "quarterly" | "semiannual", start: string) =>
    nextDates({ every, day: Number(start.slice(8)), start }, start, 4);
  assert.deepEqual(year("bimonthly", "2026-12-31"), ["2026-12-31", "2027-02-28", "2027-04-30", "2027-06-30"]);
  assert.deepEqual(year("quarterly", "2026-11-30"), ["2026-11-30", "2027-02-28", "2027-05-30", "2027-08-30"]);
  assert.deepEqual(year("semiannual", "2027-01-15"), ["2027-01-15", "2027-07-15", "2028-01-15", "2028-07-15"]);
  assert.deepEqual(datesIn({ every: "semiannual", day: 15, start: "2027-01-15" }, "2026-07"), [], "nothing before it starts");
});

test("a bill with no periodicity works as always: any payment of the month ticks it", () => {
  for (const b of [bill({}), bill({ every: "monthly", starts_on: null })]) {
    const [item, ...rest] = list(b, [pay("2026-11-03"), pay("2026-11-20")]);
    assert.equal(rest.length, 0);
    assert.deepEqual([item.paid, item.paidAmount, item.forDate], [true, 200_000, undefined]);
  }
});

test("quincena: each one has its own tick", () => {
  const b = bill({ every: "biweekly", due_day: 15, starts_on: "2026-11-01" });
  const items = list(b, [pay("2026-11-14", { for_date: "2026-11-30" })]);
  assert.deepEqual(items.map((i) => [i.due, i.paid]), [["2026-11-15", false], ["2026-11-30", true]]);
  assert.equal(items[0].overdue, true);
});

test("semester: only in its months", () => {
  const b = bill({ every: "semiannual", due_day: 15, starts_on: "2027-01-15" });
  assert.equal(list(b, []).length, 0);
  assert.equal(list(b, [], "2027-01").length, 1);
  assert.equal(list(b, [], "2027-04").length, 0);
  assert.equal(list(b, [], "2027-07").length, 1);
});

test("next month paid ahead does not tick this one", () => {
  const b = bill({ every: "biweekly", due_day: 15, starts_on: "2026-11-01" });
  const txs = [pay("2026-11-30", { for_month: "2026-12", for_date: "2026-12-15" })];
  assert.ok(list(b, txs).every((i) => !i.paid));
  assert.deepEqual(list(b, txs, "2026-12").map((i) => i.paid), [true, false]);
});

test("changing the periodicity keeps what was paid", () => {
  const toSemester = bill({ every: "semiannual", due_day: 15, starts_on: "2027-01-15" });
  const past = list(toSemester, [pay("2026-11-05")]);
  assert.deepEqual([past.length, past[0].paid, past[0].paidAmount], [1, true, 100_000]);

  const toQuincena = bill({ every: "biweekly", due_day: 5, starts_on: "2026-11-01" });
  assert.deepEqual(list(toQuincena, [pay("2026-11-05")]).map((i) => i.paid), [true, false]);
});

test("loose payments take open dates, oldest first, and none is lost", () => {
  const slots = assign(["a", "b", "c"], [{ id: 3 }, { id: 2 }, { id: 1, for_date: "b" }] as { id: number; for_date?: string }[]);
  assert.deepEqual(slots.map((s) => s.payments.map((p) => p.id)), [[2], [1], [3]]);
  assert.equal(assign(["a"], [{}, {}])[0].payments.length, 2);
});

test("skipping one date leaves the others", () => {
  const b = bill({ every: "biweekly", due_day: 5, starts_on: "2026-11-01" });
  const skips = [{ id: "s", item_type: "bill" as const, item_id: "b", month: "2026-11", for_date: "2026-11-05", note: null }];
  const items = list(b, [], "2026-11", "2026-11-22", skips);
  assert.deepEqual(items.map((i) => Boolean(i.skipped)), [true, false]);
  assert.equal(billStatus(b, [], "2026-11-10", skips).date, "2026-11-20");
});

test("the month's plan adds up every time it falls", () => {
  const items = list(bill({ every: "biweekly", due_day: 15, starts_on: "2026-11-01" }), []);
  assert.equal(monthPlan([], items, []).obligations, 200_000);
});

test("alerts: the next open date, and a daily one only when it is late", () => {
  const b = bill({ every: "biweekly", due_day: 5, starts_on: "2026-11-01" });
  assert.equal(billStatus(b, [pay("2026-11-05", { for_date: "2026-11-05" })], "2026-11-06").date, "2026-11-20");
  const daily = bill({ every: "daily", due_day: 22, starts_on: "2026-11-22" });
  assert.equal(advise([bank], [], "2026-11-22", [daily]).some((a) => a.id === "bill-b"), false);
  assert.equal(advise([bank], [], "2026-11-23", [daily]).some((a) => a.id === "bill-b"), true);
  const semester = bill({ every: "semiannual", due_day: 15, starts_on: "2027-01-15" });
  assert.equal(advise([bank], [], "2026-11-22", [semester]).some((a) => a.id === "bill-b"), false);
});

const goal = (g: Partial<Goal>): Goal => ({
  id: "g", kind: "save", name: "Viaje", emoji: null, target_amount: 1_000_000, target_date: "2027-01-31", account_id: null, start_balance: null,
  created_on: "2026-11-01", plan_amount: 100_000, plan_day: 15, plan_every: "biweekly", plan_start: "2026-11-01", ...g,
});
const deposit = (occurred_on: string, for_date: string | null = null, amount = 100_000): GoalDeposit => ({ id: `d${++n}`, goal_id: "g", amount, occurred_on, for_date });

test("goals: each quincena's saving is its own row", () => {
  const items = goalChecklist([goal({})], [deposit("2026-11-15", "2026-11-15")], "2026-11", "2026-11-22");
  assert.deepEqual(items.map((i) => [i.due, i.paid]), [["2026-11-15", true], ["2026-11-30", false]]);
});

test("goals: the last savings ask only for what is missing", () => {
  const items = goalChecklist([goal({ target_amount: 150_000 })], [], "2026-11", "2026-11-10");
  assert.deepEqual(items.map((i) => i.expected), [100_000, 50_000]);
  assert.equal(goalChecklist([goal({ target_amount: 100_000 })], [deposit("2026-11-15", "2026-11-15")], "2026-11", "2026-11-22").length, 1);
});

test("goals: pace and outlook count each time it falls", () => {
  const deposits = [deposit("2026-11-15", "2026-11-15")];
  const view = goalView(goal({}), deposits, [], [], "2026-11-22");
  assert.equal(view.expected, 100_000);
  const outlook = planOutlook(view, deposits, "2026-11-22")!;
  assert.deepEqual([outlook.instalments, outlook.projected, outlook.next], [5, 600_000, "2026-11-30"]);
  assert.equal(planDates(15, "2026-11", "2026-11-01", "2027-01-20", "semiannual", "2026-11-15").length, 1);
});

test("calendar feed: follows the periodicity", () => {
  const starts = (item: object) =>
    [...buildCalendar([{ id: "x", name: "U", due_day: 15, monthly_payment: null, ...item }], "2026-11-22").matchAll(/DTSTART;VALUE=DATE:(\d{8})/g)].map((m) => m[1]);
  assert.deepEqual(starts({}), ["20261215", "20270115", "20270215"]);
  assert.deepEqual(starts({ every: "semiannual", starts_on: "2027-01-15" }), ["20270115", "20270715", "20280115"]);
  assert.equal(starts({ every: "biweekly", starts_on: "2026-11-01" }).length, 6);
  assert.equal(starts({ every: "daily", starts_on: "2026-11-01" }).length, 14);
});

test("texts and monthly equivalents", () => {
  assert.equal(cadenceText({ every: "semiannual", day: 15, start: "2027-01-15" }), "semestral: 15 ene y 15 jul");
  assert.equal(cadenceText({ every: "biweekly", day: 31, start: null }), "quincenal, 15 y último día");
  assert.equal(timesPerMonth("quarterly"), 1 / 3);
});
