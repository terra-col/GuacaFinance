import assert from "node:assert/strict";
import { test } from "node:test";
import { advise } from "./advice.ts";
import { advisorContext } from "./advisor-context.ts";
import { ADJUSTMENT, balanceAt, formatPesosInput, monthFlows, parsePesos, spendingByCategory, type Account, type Tx } from "./finance.ts";
import { allPages } from "./paging.ts";

const account = (id: string, kind: Account["kind"], opening_balance: number): Account => ({
  id, kind, name: id, institution: null, opening_balance, opening_date: "2026-01-01", credit_limit: null,
  annual_rate: null, monthly_payment: null, statement_day: null, due_day: null, wallet_card_name: null,
});
let n = 0;
const tx = (t: Partial<Tx> & Pick<Tx, "account_id" | "kind" | "amount">): Tx => ({
  id: String(++n), source_account_id: null, category: null, description: null, occurred_on: "2026-11-22", source: "manual", bill_id: null, ...t,
});
const bank = account("bank", "savings", 1_000_000);
const loan = account("loan", "loan", 0);
const txs = [
  tx({ account_id: "bank", kind: "expense", amount: 300_000, category: "Mercado" }),
  tx({ account_id: "bank", kind: "income", amount: 500_000 }),
  tx({ account_id: "bank", kind: "income", amount: 900_000, category: ADJUSTMENT }),
  tx({ account_id: "loan", kind: "expense", amount: 150_000_000, category: ADJUSTMENT }),
  tx({ account_id: "loan", kind: "payment", amount: 70_000, category: ADJUSTMENT }),
  ...["2026-08-10", "2026-09-10", "2026-10-10"].map((occurred_on) => tx({ account_id: "loan", kind: "expense", amount: 100_000, category: ADJUSTMENT, occurred_on })),
];

test("adjustments: never income, spending or payments", () => {
  assert.deepEqual(spendingByCategory(txs, "2026-11"), [{ category: "Mercado", amount: 300_000 }]);
  assert.deepEqual(monthFlows(txs, "2026-11"), { income: 500_000, expense: 300_000, payment: 0 });
});

test("adjustments: they still move the balances", () => {
  assert.equal(balanceAt(bank, txs), 2_100_000);
  assert.equal(balanceAt(loan, txs), 150_230_000);
});

test("adjustments: no spike alert, and the advisor does not read them as spending", () => {
  assert.ok(!advise([bank, loan], txs, "2026-11-22").some((a) => a.id.startsWith("spike-")));
  const context = advisorContext({ accounts: [bank, loan], txs, bills: [], goals: [], deposits: [], today: "2026-11-22" });
  assert.match(context, /gastos \$\s300\.000/);
});

test("money field: cents as the banks show them are dropped, never read as pesos", () => {
  for (const [raw, pesos] of [["1.054.000,00", 1_054_000], ["$ 1.054.000,5", 1_054_000], ["1,054,000.00", 1_054_000], ["80,000", 80_000], ["1.500.000", 1_500_000], ["25000", 25_000]] as const) {
    assert.equal(parsePesos(raw), pesos, raw);
    assert.equal(parsePesos(formatPesosInput(raw)), pesos, raw + " through the field");
  }
});

test("money field: typed one key at a time", () => {
  const type = (keys: string) => [...keys].reduce<string>((value, key) => formatPesosInput(value + key), "");
  assert.equal(parsePesos(type("1054000,00")), 1_054_000);
  assert.equal(parsePesos(type("1054000")), 1_054_000);
  assert.equal(parsePesos(type("80,000")), 80_000);
});

test("paging: reads past the first 1000 rows, and reports a failure", async () => {
  const all = Array.from({ length: 2000 }, (_, i) => i);
  const { rows } = await allPages<number>(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
  assert.equal(rows.length, 2000);
  assert.ok((await allPages(async () => ({ data: null, error: { message: "x" } }))).error);
});
