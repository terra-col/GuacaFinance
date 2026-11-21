import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetViews, incomeChecklist, monthPlan, type Income } from "./budget.ts";
import { monthlyChecklist, type Account, type Skip, type Tx } from "./finance.ts";

const tx = (over: Partial<Tx>): Tx => ({
  id: crypto.randomUUID(),
  account_id: "cash",
  source_account_id: null,
  kind: "expense",
  amount: 0,
  category: "Ocio",
  description: null,
  occurred_on: "2026-11-05",
  source: "manual",
  bill_id: null,
  income_id: null,
  ...over,
});

test("budgets: spending, pace and per-day allowance", () => {
  const txs = [
    tx({ amount: 900_000, category: "Ocio" }),
    tx({ amount: 100_000, category: "Mercado" }),
    tx({ amount: 999_999, category: "Ocio", occurred_on: "2026-10-30" }), // other month
    tx({ amount: 50_000, category: "Ocio", kind: "income" }), // not spending
  ];
  const [ocio, mercado] = budgetViews(
    [
      { id: "1", category: "Ocio", amount: 1_400_000 },
      { id: "2", category: "Mercado", amount: 500_000 },
    ],
    txs,
    "2026-11",
    "2026-11-10",
  );
  assert.equal(ocio.spent, 900_000);
  assert.equal(ocio.left, 500_000);
  assert.equal(ocio.pace, 10 / 30);
  assert.equal(ocio.status, "watch"); // 60 % spent with a third of the month gone
  assert.equal(ocio.perDay, Math.floor(500_000 / 21));
  assert.equal(mercado.status, "ok");
});

test("budgets: over budget and past months", () => {
  const [v] = budgetViews([{ id: "1", category: "Ocio", amount: 100 }], [tx({ amount: 150 })], "2026-11", "2026-12-02");
  assert.equal(v.status, "over");
  assert.equal(v.pace, 1);
  assert.equal(v.perDay, 0);
});

const salary: Income = { id: "sal", name: "Salario", amount: 7_500_000, day: 30, months: null, account_id: "bank" };
const prima: Income = { id: "pri", name: "Prima", amount: 3_000_000, day: 20, months: [6, 12], account_id: "bank" };

test("incomes: only months when they arrive, ticked by a movement, skippable", () => {
  const nov = incomeChecklist([salary, prima], [], "2026-11", "2026-11-17");
  assert.deepEqual(nov.map((i) => i.id), ["sal"]);
  assert.equal(nov[0].due, "2026-11-30");
  assert.equal(nov[0].late, false);

  const dec = incomeChecklist([salary, prima], [tx({ kind: "income", amount: 4_200_000, income_id: "pri", occurred_on: "2026-12-19" })], "2026-12", "2026-12-31");
  assert.deepEqual(dec.map((i) => [i.id, i.received, i.late]), [["pri", true, false], ["sal", false, true]]);
  assert.equal(dec[0].receivedAmount, 4_200_000);

  const skip: Skip = { id: "s", item_type: "income", item_id: "sal", month: "2026-12", note: null };
  const skipped = incomeChecklist([salary], [], "2026-12", "2026-12-31", [skip]);
  assert.equal(skipped[0].late, false);
  assert.equal(skipped[0].skipped, skip);
});

test("checklist: a skipped debt is not overdue; paying it clears the skip", () => {
  const card: Account = {
    id: "card", kind: "credit_card", name: "Visa", institution: null, opening_balance: 4_000_000,
    opening_date: "2026-01-01", credit_limit: 6_000_000, annual_rate: 0.3, monthly_payment: 250_000,
    statement_day: null, due_day: 5, wallet_card_name: null,
  };
  const skip: Skip = { id: "s", item_type: "debt", item_id: "card", month: "2026-11", note: "Rediferida" };
  const [item] = monthlyChecklist([card], [], [], "2026-11", "2026-11-17", [skip]);
  assert.equal(item.overdue, false);
  assert.equal(item.skipped?.note, "Rediferida");
  const [paid] = monthlyChecklist([card], [], [tx({ kind: "payment", account_id: "card", amount: 250_000 })], "2026-11", "2026-11-17", [skip]);
  assert.equal(paid.skipped, null);
});

test("month plan: income − obligations − budgets", () => {
  const card: Account = {
    id: "card", kind: "credit_card", name: "Mastercard", institution: null, opening_balance: 2_000_000,
    opening_date: "2026-01-01", credit_limit: null, annual_rate: null, monthly_payment: 150_000,
    statement_day: null, due_day: 10, wallet_card_name: null,
  };
  const loan: Account = { ...card, id: "loan", kind: "loan", name: "Libre", monthly_payment: 350_000 };
  const variable: Account = { ...card, id: "var", name: "Variable", monthly_payment: null };
  const txs = [tx({ kind: "payment", account_id: "loan", amount: 360_000, occurred_on: "2026-11-03" })];
  const checklist = monthlyChecklist([card, loan, variable], [], txs, "2026-11", "2026-11-17");
  const plan = monthPlan(incomeChecklist([salary], txs, "2026-11", "2026-11-17"), checklist, [{ id: "b", category: "Ocio", amount: 1_200_000 }]);
  assert.equal(plan.income, 7_500_000);
  assert.equal(plan.incomePending, 7_500_000);
  assert.equal(plan.obligations, 360_000 + 150_000);
  assert.equal(plan.obligationsPending, 150_000);
  assert.equal(plan.unknownObligations, 1);
  assert.equal(plan.free, 7_500_000 - 510_000 - 1_200_000);
});

test("advisor context lists incomes, budgets, skips and the month split", async () => {
  const { advisorContext } = await import("./advisor-context.ts");
  const text = advisorContext({
    accounts: [],
    txs: [tx({ amount: 200_000, category: "Ocio", occurred_on: "2026-11-02" })],
    bills: [],
    goals: [],
    deposits: [],
    incomes: [salary, prima],
    budgets: [{ id: "b", category: "Ocio", amount: 1_200_000 }],
    skips: [],
    today: "2026-11-17",
  });
  assert.match(text, /Salario: \$\s?7\.500\.000, día 30, cada mes/);
  assert.match(text, /Prima: .*solo en jun, dic/);
  assert.match(text, /Ocio: \$\s?200\.000 de \$\s?1\.200\.000/);
  assert.match(text, /libre \$\s?6\.300\.000/);
});

test("incomes: a one-time extra shows only in its month and adds to that month's plan", () => {
  const extra: Income = { id: "ext", name: "Horas extra", amount: 450_000, day: 30, months: null, once_month: "2026-12", account_id: "bank" };
  assert.deepEqual(incomeChecklist([salary, extra], [], "2026-11", "2026-11-17").map((i) => i.id), ["sal"]);
  const dec = incomeChecklist([salary, extra], [], "2026-12", "2026-12-01");
  assert.deepEqual(dec.map((i) => [i.id, i.once]), [["ext", true], ["sal", false]]);
  assert.equal(monthPlan(dec, [], []).income, 7_500_000 + 450_000);
  assert.equal(incomeChecklist([extra], [], "2027-12", "2027-12-01").length, 0, "it does not come back next year");
});

test("incomes: the next date, also when it falls in a coming month", async () => {
  const { nextIncomeDate } = await import("./budget.ts");
  assert.equal(nextIncomeDate({ day: 30, months: null, once_month: null }, "2026-11-21"), "2026-11-30");
  assert.equal(nextIncomeDate({ day: 15, months: null, once_month: null }, "2026-11-21"), "2026-12-15", "this month's already passed");
  assert.equal(nextIncomeDate({ day: 20, months: [6, 12], once_month: null }, "2026-11-21"), "2026-12-20", "the prima in December");
  assert.equal(nextIncomeDate({ day: 20, months: [6, 12], once_month: null }, "2026-12-21"), "2027-06-20");
  assert.equal(nextIncomeDate({ day: 30, months: null, once_month: "2026-12" }, "2026-11-21"), "2026-12-30", "a one-time extra next month");
  assert.equal(nextIncomeDate({ day: 5, months: null, once_month: "2026-11" }, "2026-11-21"), null, "a one-time extra already behind");
  assert.equal(nextIncomeDate({ day: 31, months: null, once_month: null }, "2027-02-10"), "2027-02-28");
});
