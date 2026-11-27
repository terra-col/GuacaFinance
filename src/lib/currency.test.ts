import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_RATES, PESOS, atTodayRate, formatForeign, formatMain, mainCurrencyCode, needsRates, parseHundredths, parseRate, showsForeign, toPesos } from "./currency.ts";
import { balanceAt, balanceByCurrency, monthFlows, monthlyChecklist, nativeBalance, totals, valueRate, type Account, type Bill, type Planned, type Tx } from "./finance.ts";
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

test("accounts in another currency: balance there, valued in pesos at today's rate", () => {
  const base = { institution: null, opening_date: "2026-01-01", credit_limit: null, annual_rate: null, monthly_payment: null, statement_day: null, due_day: null, wallet_card_name: null };
  const wise: Account = { ...base, id: "wise", kind: "savings", name: "Wise", opening_balance: 4_000_000, currency: "USD", opening_original: "1000.00", fx_rate: 4200 };
  const bank: Account = { ...base, id: "bank", kind: "savings", name: "Banco", opening_balance: 2_000_000 };
  const card: Account = { ...base, id: "card", kind: "credit_card", name: "Visa", opening_balance: 500_000 };
  const tx = (over: Partial<Tx>): Tx => ({ id: crypto.randomUUID(), account_id: "wise", source_account_id: null, kind: "expense", amount: 0, category: "Ocio", description: null, occurred_on: "2026-11-05", source: "manual", bill_id: null, income_id: null, ...over });
  const txs = [
    // US$ 50,25 spent at 4.000, then US$ 300 paid in, at 4.100.
    tx({ kind: "expense", amount: 201_000, currency: "USD", original_amount: "50.25", rate: "4000" }),
    tx({ kind: "income", amount: 1_230_000, currency: "USD", original_amount: "300", rate: "4100" }),
    // US$ 100 from Wise pay the peso card: the card owes $ 410.000 less.
    tx({ kind: "payment", account_id: "card", source_account_id: "wise", amount: 410_000, currency: "USD", original_amount: "100", rate: "4100", occurred_on: "2026-11-06" }),
  ];
  assert.equal(nativeBalance(wise, txs), 114_975, "US$ 1.000 − 50,25 + 300 − 100 = 1.149,75");
  assert.equal(balanceAt(wise, txs), Math.round(1149.75 * 4200), "valued at today's rate, not the rates of each day");
  assert.equal(balanceAt(card, txs), 90_000);
  // Without today's rate: the latest one known on the account.
  assert.equal(valueRate({ ...wise, fx_rate: null }, txs), 4100);
  assert.equal(valueRate({ ...wise, fx_rate: null }, []), 4000, "or that of its opening balance");

  // The bank's balance as a checkpoint, in cents of the currency.
  const check = tx({ kind: "income", amount: 0, category: "Ajuste de saldo", occurred_on: "2026-11-10", checkpoint: 120_000, created_at: "2026-11-10T15:00:00Z" });
  const later = tx({ kind: "expense", amount: 40_000, currency: "USD", original_amount: "10", rate: "4000", occurred_on: "2026-11-12" });
  assert.equal(nativeBalance(wise, [...txs, check, later]), 119_000, "US$ 1.200 checked, then US$ 10 spent");

  const t = totals([wise, bank, card], txs);
  assert.equal(t.savings, Math.round(1149.75 * 4200) + 2_000_000);
  const groups = balanceByCurrency([wise, bank, card], txs);
  assert.deepEqual(groups.map((g) => [g.currency, g.have, g.owe, g.rate]), [["COP", 2_000_000, 90_000, null], ["USD", 1149.75, 0, 4200]]);
  assert.equal(balanceByCurrency([bank, card], txs).length, 1, "all in pesos: no detail");
});

test("transfers: out of one account into the other, also changing currency, and never spending", () => {
  const base = { institution: null, opening_date: "2026-01-01", credit_limit: null, annual_rate: null, monthly_payment: null, statement_day: null, due_day: null, wallet_card_name: null };
  const bank: Account = { ...base, id: "bank", kind: "savings", name: "Banco", opening_balance: 10_000_000 };
  const cash: Account = { ...base, id: "cash", kind: "cash", name: "Efectivo", opening_balance: 0 };
  const wise: Account = { ...base, id: "wise", kind: "savings", name: "Wise", opening_balance: 0, currency: "USD", opening_original: "0", fx_rate: 4000 };
  const tx = (over: Partial<Tx>): Tx => ({ id: crypto.randomUUID(), account_id: "cash", source_account_id: "bank", kind: "transfer", amount: 0, category: null, description: null, occurred_on: "2026-11-05", source: "manual", bill_id: null, income_id: null, ...over });
  const txs = [
    tx({ amount: 300_000 }),
    // $ 4.100.000 out of the bank, US$ 1.000 into Wise: the exchange's own rate.
    tx({ account_id: "wise", amount: 4_100_000, currency: "USD", original_amount: "1000", rate: "4100" }),
  ];
  assert.equal(balanceAt(bank, txs), 10_000_000 - 300_000 - 4_100_000);
  assert.equal(balanceAt(cash, txs), 300_000);
  assert.equal(nativeBalance(wise, txs), 100_000, "US$ 1.000,00");
  assert.equal(balanceAt(wise, txs), 4_000_000, "valued at today's 4.000: the exchange cost $ 100.000 of value");
  const t = totals([bank, cash, wise], txs);
  assert.equal(t.savings, 10_000_000 - 4_100_000 + 4_000_000);
  assert.deepEqual(monthFlows(txs, "2026-11"), { income: 0, expense: 0, payment: 0, transfer: 4_400_000 }, "not income nor spending");
});

test("main currency: totals in it at today's rate, pesos when unknown", () => {
  assert.equal(mainCurrencyCode({ main_currency: "EUR" }), "EUR");
  assert.equal(mainCurrencyCode({ main_currency: "JPY" }), "COP", "an unknown one is pesos");
  assert.equal(mainCurrencyCode(null), "COP");
  const plain = (s: string) => s.replace(/[  ]/g, " ");
  assert.equal(plain(formatMain(8_130_890, PESOS)), "$ 8.130.890");
  assert.equal(plain(formatMain(8_130_890, { code: "USD", rate: 4000 })), "US$ 2.032,72");
  assert.equal(plain(formatMain(-400_000, { code: "EUR", rate: 4500 })), "€ -88,89");
  // No rate today: still pesos, never a wrong figure.
  assert.equal(showsForeign({ code: "USD", rate: null }), false);
  assert.equal(plain(formatMain(1_000, { code: "USD", rate: null })), "$ 1.000");
});
