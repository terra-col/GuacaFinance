import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_RATES, atTodayRate, formatForeign, needsRates, parseHundredths, parseRate, toPesos } from "./currency.ts";
import { monthlyChecklist, type Bill, type Planned } from "./finance.ts";
import { incomeChecklist, incomeRow, type Income } from "./budget.ts";

test("amounts as people write them", () => {
  const cases: [string, number | null][] = [
    ["12,50", 1250], ["12.50", 1250], ["12.5", 1250], ["1.234,56", 123456], ["1,234.56", 123456],
    ["1.234", 123400], ["US$ 99", 9900], ["0,99", 99], ["", null], ["abc", null], ["12,345", null],
  ];
  for (const [raw, expected] of cases) assert.equal(parseHundredths(raw), expected, raw);
});

test("rates as people write them", () => {
  const cases: [string, number | null][] = [["3.505,92", 3505.92], ["3505.92", 3505.92], ["3.505", 3505], ["952,3809", 952.3809], ["0", null], ["1,23456", null]];
  for (const [raw, expected] of cases) assert.equal(parseRate(raw), expected, raw);
});

test("into pesos, to the peso, as the database checks it", () => {
  assert.equal(toPesos(1250, 3505.92), 43824);
  assert.equal(toPesos(999_999_99, 3831.4176), 3_831_417_562);
  assert.equal(formatForeign(12.5, "USD"), "US$ 12,50");
  assert.equal(formatForeign(1234, "EUR"), "€ 1.234,00");
});

test("bills and incomes in another currency: pesos at today's rate, paid in their currency", () => {
  const netflix: Bill = { id: "nf", name: "Netflix", amount: 60_000, due_day: 10, category: "Suscripciones", created_at: "2026-01-01T12:00:00Z", currency: "USD", original_amount: "15.49", rate: "3873.5" };
  const internet: Bill = { id: "in", name: "Internet", amount: 90_000, due_day: 5, category: "Hogar", created_at: "2026-01-01T12:00:00Z" };
  const varying: Bill = { id: "vr", name: "Hosting", amount: null, due_day: 20, category: null, created_at: "2026-01-01T12:00:00Z", currency: "EUR", original_amount: null, rate: null };
  assert.equal(needsRates([internet, varying]), false, "only what has a value in another currency wants rates");
  assert.equal(needsRates([internet, netflix]), true);

  const rates = { USD: 4000, EUR: null, AED: null, date: "2026-11-27" };
  const [nf, inet, vr] = atTodayRate([netflix, internet, varying], rates);
  assert.deepEqual([nf.amount, nf.rate], [61_960, 4000], "US$ 15,49 × 4.000");
  assert.equal(inet, internet, "pesos stay as they are");
  assert.equal(vr, varying);
  // Without today's rate, the pesos of the rate it was saved at.
  assert.equal(atTodayRate([netflix], NO_RATES)[0].amount, 60_000);

  const items = monthlyChecklist([{ id: "bank", kind: "savings", name: "Banco", institution: null, opening_balance: 0, opening_date: "2026-01-01", credit_limit: null, annual_rate: null, monthly_payment: null, statement_day: null, due_day: null, wallet_card_name: null, favorite: true }], [nf, inet], [], "2026-12", "2026-11-27");
  const row = items.find((i) => i.id === "nf")!;
  assert.deepEqual([row.expected, row.foreign, row.quick], [61_960, { currency: "USD", original: 15.49 }, null], "in dollars: asks the rate, never one tap");
  assert.equal(items.find((i) => i.id === "in")!.foreign, undefined);
  assert.equal(items.find((i) => i.id === "in")!.quick?.amount, 90_000);

  // A value set for the month is in pesos: then it is paid in pesos, in one tap, and keeps its currency.
  const planned: Planned[] = [{ id: "p", item_type: "bill", item_id: "nf", month: "2026-12", amount: 65_000 }];
  const withPlan = monthlyChecklist([{ id: "bank", kind: "savings", name: "Banco", institution: null, opening_balance: 0, opening_date: "2026-01-01", credit_limit: null, annual_rate: null, monthly_payment: null, statement_day: null, due_day: null, wallet_card_name: null, favorite: true }], [nf], [], "2026-12", "2026-11-27", [], planned)[0];
  assert.deepEqual([withPlan.expected, withPlan.quick?.amount, withPlan.foreign?.currency], [65_000, 65_000, "USD"]);

  const salary: Income = { id: "sal", name: "Sueldo", amount: 18_000_000, day: 30, months: null, account_id: "bank", currency: "USD", original_amount: 4500, rate: 4000 };
  const [inc] = incomeChecklist([salary], [], "2026-12", "2026-11-27");
  assert.deepEqual([inc.expected, inc.foreign], [18_000_000, { currency: "USD", original: 4500 }]);
  assert.equal(incomeRow(inc).quick, null);
});
