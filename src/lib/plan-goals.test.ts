import assert from "node:assert/strict";
import { test } from "node:test";
import type { Account, Tx } from "./finance.ts";
import { goalView, paymentToClear, type Goal } from "./goals.ts";
import { assumedMinimum, planDebts, simulate, type PlanDebt } from "./planner.ts";

const base = { institution: null, credit_limit: null, annual_rate: null, monthly_payment: null, statement_day: null, due_day: null, wallet_card_name: null, opening_date: "2026-01-01" };
const acc = (a: Partial<Account> & Pick<Account, "id" | "kind" | "opening_balance">): Account => ({ ...base, name: a.id, ...a });
const goal = (g: Partial<Goal> & Pick<Goal, "kind" | "target_date">): Goal => ({ id: "g", name: "Meta", emoji: null, target_amount: null, account_id: null, start_balance: null, created_on: "2026-11-01", ...g });

test("save goal: what to set aside per month, fortnight and week, rounded up to $1.000", () => {
  const v = goalView(goal({ kind: "save", target_amount: 2_000_000, target_date: "2027-02-01" }), [{ id: "d", goal_id: "g", amount: 500_000, occurred_on: "2026-11-05" }], [], [], "2026-11-17");
  assert.equal(v.achieved, 500_000);
  assert.equal(v.remaining, 1_500_000);
  assert.equal(v.daysLeft, 76);
  assert.equal(v.perMonth, 500_000, "76 days = 3 months");
  assert.equal(v.perQuincena, 300_000, "5 fortnights");
  assert.equal(v.perWeek, 137_000, "11 weeks, rounded up");
  assert.equal(v.status, "scheduled", "no plan: no pace to be on or off");
  const more = goalView(goal({ kind: "save", target_amount: 2_000_000, target_date: "2027-02-01" }), [{ id: "d", goal_id: "g", amount: 800_000, occurred_on: "2026-11-05" }], [], [], "2026-11-17");
  assert.equal(more.status, "scheduled");
});

test("save goal status: no plan means no pace (never behind); done and overdue still count", () => {
  const g = goal({ kind: "save", target_amount: 1_000_000, target_date: "2026-12-01" });
  assert.equal(goalView(g, [], [], [], "2026-11-20").status, "scheduled", "nothing to keep up with");
  assert.equal(goalView({ ...g, plan_once: true }, [], [], [], "2026-11-20").status, "scheduled");
  assert.equal(goalView(g, [{ id: "d", goal_id: "g", amount: 1_000_000, occurred_on: "2026-11-02" }], [], [], "2026-11-20").status, "done");
  assert.equal(goalView(g, [], [], [], "2026-12-05").status, "overdue");
});

test("payoff goal: progress from the balance when it was set, payment includes interest", () => {
  const card = acc({ id: "c", kind: "credit_card", opening_balance: 3_000_000, annual_rate: 26 });
  const paid: Tx = { id: "p", account_id: "c", source_account_id: null, kind: "payment", amount: 600_000, category: null, description: null, occurred_on: "2026-11-10", source: "manual", bill_id: null };
  const v = goalView(goal({ kind: "payoff", account_id: "c", start_balance: 3_000_000, target_date: "2027-04-30" }), [], [card], [paid], "2026-11-17");
  assert.equal(v.remaining, 2_400_000);
  assert.equal(v.progress, 0.2);
  assert.ok(v.perMonth > 2_400_000 / 6, "interest makes it more than plain division");
  assert.equal(v.perMonth, Math.ceil(paymentToClear(2_400_000, 6, 26) / 1000) * 1000);
});

test("paymentToClear at 0% is plain division", () => {
  assert.equal(paymentToClear(1_200_000, 4, null), 300_000);
  assert.equal(paymentToClear(0, 4, 20), 0);
});

const debts: PlanDebt[] = [
  { id: "cara", name: "Cara", balance: 5_000_000, annualRate: 30, minPayment: 250_000, assumedMin: false },
  { id: "chica", name: "Chica", balance: 1_000_000, annualRate: 10, minPayment: 100_000, assumedMin: false },
];

test("avalanche pays the most expensive first and saves interest over the minimum", () => {
  const min = simulate(debts, 0, "minimum");
  const ava = simulate(debts, 500_000, "avalanche");
  const snow = simulate(debts, 500_000, "snowball");
  assert.equal(ava.order[0], "cara");
  assert.equal(snow.order[0], "chica");
  assert.ok(ava.totalInterest < snow.totalInterest, "avalanche minimises interest");
  assert.ok(ava.months! < min.months!, "extra money finishes sooner");
  assert.ok(ava.totalInterest < min.totalInterest);
});

test("a minimum below the interest never finishes", () => {
  const never = simulate([{ id: "x", name: "X", balance: 10_000_000, annualRate: 30, minPayment: 100_000, assumedMin: false }], 0, "minimum");
  assert.equal(never.months, null);
  assert.equal(never.payoffMonth.x, null);
});

test("planDebts: registered payment as minimum, else 5% with a $50.000 floor", () => {
  const list = planDebts(
    [
      acc({ id: "t", kind: "credit_card", opening_balance: 4_000_000 }),
      acc({ id: "r", kind: "credit_card", opening_balance: 9_000_000, monthly_payment: 380_000 }),
      acc({ id: "a", kind: "savings", opening_balance: 1 }),
      acc({ id: "z", kind: "loan", opening_balance: 0 }),
    ],
    [],
  );
  assert.deepEqual(list.map((d) => [d.id, d.minPayment, d.assumedMin]), [["t", 200_000, true], ["r", 380_000, false]]);
  assert.equal(assumedMinimum(600_000), 50_000);
});

test("advisor snapshot lists debts, the simulation and goals in plain text", async () => {
  const { advisorContext } = await import("./advisor-context.ts");
  const text = advisorContext({
    accounts: [
      acc({ id: "a", kind: "savings", opening_balance: 2_000_000, name: "Nómina" }),
      acc({ id: "t", kind: "credit_card", opening_balance: 3_000_000, annual_rate: 26, monthly_payment: 300_000, name: "Bogotá 1" }),
    ],
    txs: [],
    bills: [{ id: "b", name: "Arriendo", amount: 1_500_000, due_day: 5, category: null }],
    goals: [goal({ kind: "save", name: "Armario", target_amount: 2_000_000, target_date: "2027-02-01" })],
    deposits: [],
    today: "2026-11-17",
  });
  const { formatCOP } = await import("./finance.ts");
  for (const piece of ["Nómina", "Bogotá 1", "26% E.A.", "Avalancha", "Arriendo", "Armario", formatCOP(2_000_000)]) {
    assert.ok(text.includes(piece), `missing ${piece}`);
  }
});

test("goal plan: one row a month in Pagos, ticked by a deposit that month", async () => {
  const { goalChecklist } = await import("./goals.ts");
  const closet = goal({ kind: "save", name: "Armario", target_amount: 1_200_000, target_date: "2027-06-30", created_on: "2026-11-21", plan_amount: 100_000, plan_day: 30 });
  const [row] = goalChecklist([closet], [], "2026-11", "2026-11-21");
  assert.deepEqual([row.type, row.name, row.due, row.expected, row.paid, row.overdue], ["goal", "Ahorro: Armario", "2026-11-30", 100_000, false, false]);
  const paid = goalChecklist([closet], [{ id: "d", goal_id: "g", amount: 100_000, occurred_on: "2026-11-30" }], "2026-11", "2026-12-01")[0];
  assert.deepEqual([paid.paid, paid.paidAmount], [true, 100_000]);
  assert.equal(goalChecklist([closet], [], "2026-12", "2026-12-31")[0].overdue, true, "the day passed with nothing saved");
  assert.equal(goalChecklist([closet], [], "2026-10", "2026-11-21").length, 0, "not before it was created");
  assert.equal(goalChecklist([closet], [], "2027-07", "2026-11-21").length, 0, "not after its date");
  assert.equal(goalChecklist([{ ...closet, plan_amount: null, plan_day: null }], [], "2026-11", "2026-11-21").length, 0, "no plan, no row");
});

test("goal plan: the last instalment asks only what is missing, and none once reached", async () => {
  const { goalChecklist } = await import("./goals.ts");
  const closet = goal({ kind: "save", target_amount: 1_200_000, target_date: "2027-06-30", created_on: "2026-11-01", plan_amount: 100_000, plan_day: 30 });
  assert.equal(goalChecklist([closet], [{ id: "d", goal_id: "g", amount: 1_150_000, occurred_on: "2026-12-01" }], "2027-01", "2027-01-05")[0].expected, 50_000);
  assert.equal(goalChecklist([closet], [{ id: "d", goal_id: "g", amount: 1_200_000, occurred_on: "2026-12-01" }], "2027-01", "2027-01-05").length, 0);
  const late = goal({ ...closet, target_date: "2027-06-15" });
  assert.equal(goalChecklist([late], [], "2027-06", "2027-06-01")[0].due, "2027-06-15", "never after the goal's own date");
});

test("goal plan: whether keeping it arrives on time", async () => {
  const { planOutlook } = await import("./goals.ts");
  const closet = goal({ kind: "save", target_amount: 1_200_000, target_date: "2027-06-30", created_on: "2026-11-21", plan_amount: 100_000, plan_day: 30 });
  const short = planOutlook(goalView(closet, [], [], [], "2026-11-21"), [], "2026-11-21")!;
  assert.deepEqual([short.instalments, short.projected, short.enough, short.shortfall, short.next], [8, 800_000, false, 400_000, "2026-11-30"], "nov to jun: 8 × $100.000");
  const enough = planOutlook(goalView({ ...closet, plan_amount: 150_000 }, [], [], [], "2026-11-21"), [], "2026-11-21")!;
  assert.equal(enough.enough, true);
  const saved = [{ id: "d", goal_id: "g", amount: 100_000, occurred_on: "2026-11-21" }];
  assert.equal(planOutlook(goalView(closet, saved, [], [], "2026-11-21"), saved, "2026-11-21")!.next, "2026-12-30", "this month's is done");
  assert.equal(planOutlook(goalView(goal({ kind: "save", target_amount: 1, target_date: "2027-01-01" }), [], [], [], "2026-11-21"), [], "2026-11-21"), null);
});

test("goal plan: a plan day already past when the goal is created starts next month", async () => {
  const { goalChecklist, planDates, suggestedPlan } = await import("./goals.ts");
  const g = goal({ kind: "save", target_amount: 600_000, target_date: "2027-04-30", created_on: "2026-11-21", plan_amount: 100_000, plan_day: 15 });
  assert.equal(goalChecklist([g], [], "2026-11", "2026-11-21").length, 0, "not overdue on the day it was created");
  assert.equal(goalChecklist([g], [], "2026-12", "2026-12-01")[0].due, "2026-12-15");
  assert.deepEqual(planDates(15, "2026-11", "2026-11-21", "2027-04-30"), ["2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15", "2027-04-15"]);
  assert.equal(suggestedPlan(600_000, 15, "2026-11-21", "2027-04-30"), 120_000, "5 instalments");
  assert.equal(suggestedPlan(1_000_000, 30, "2026-11-21", "2027-02-28"), 250_000, "nov 30, dec 30, jan 30 and feb 28");
});

test("save goal status: with a monthly plan, behind or ahead is measured against the plan", () => {
  const g = goal({ kind: "save", target_amount: 1_200_000, target_date: "2027-06-30", created_on: "2026-09-01", plan_amount: 100_000, plan_day: 30 });
  // Sep, Oct and Nov instalments are due by Nov 30.
  assert.equal(goalView(g, [], [], [], "2026-11-30").expected, 300_000);
  assert.equal(goalView(g, [{ id: "d", goal_id: "g", amount: 200_000, occurred_on: "2026-11-01" }], [], [], "2026-11-30").status, "behind");
  assert.equal(goalView(g, [{ id: "d", goal_id: "g", amount: 300_000, occurred_on: "2026-11-01" }], [], [], "2026-11-30").status, "on_track");
  assert.equal(goalView(g, [{ id: "d", goal_id: "g", amount: 400_000, occurred_on: "2026-11-01" }], [], [], "2026-11-30").status, "ahead");
});

test("one-time goal: shows up once in Pagos, on its date, for what is missing", async () => {
  const { goalChecklist, planOutlook } = await import("./goals.ts");
  const juanfe = goal({ kind: "save", name: "Deuda JuanFe", target_amount: 800_000, target_date: "2026-12-31", created_on: "2026-11-21", plan_once: true });
  assert.equal(goalChecklist([juanfe], [], "2026-11", "2026-11-21").length, 0, "not before its month");
  const [row] = goalChecklist([juanfe], [{ id: "d", goal_id: "g", amount: 300_000, occurred_on: "2026-11-25" }], "2026-12", "2026-12-01");
  assert.deepEqual([row.name, row.due, row.expected], ["Deuda JuanFe", "2026-12-31", 500_000]);
  assert.equal(planOutlook(goalView(juanfe, [], [], [], "2026-11-21"), [], "2026-11-21"), null, "no monthly plan to project");
});
