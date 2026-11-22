import assert from "node:assert/strict";
import { test } from "node:test";
import { ADJUSTMENT, balanceAt, monthFlows, monthlySeries, type Account, type Tx } from "./finance.ts";

const account = (id: string, kind: Account["kind"], opening_balance: number): Account => ({
  id, kind, name: id, institution: null, opening_balance, opening_date: "2026-01-01", credit_limit: null,
  annual_rate: null, monthly_payment: null, statement_day: null, due_day: null, wallet_card_name: null,
});
const bank = account("bank", "savings", 1_000_000);
const card = account("card", "credit_card", 500_000);
let n = 0;
/** `at` is when it was written down, in Bogota time. */
const tx = (kind: Tx["kind"], amount: number, occurred_on: string, at: string, more: Partial<Tx> = {}): Tx => ({
  id: `t${++n}`, account_id: "bank", source_account_id: null, kind, amount, category: null, description: null, occurred_on, source: "manual", bill_id: null,
  created_at: new Date(`${at}-05:00`).toISOString(), ...more,
});
const checkpoint = (value: number, occurred_on: string, at: string, more: Partial<Tx> = {}) =>
  tx("expense", 0, occurred_on, at, { category: ADJUSTMENT, checkpoint: value, ...more });

test("the reported case: adjust, then write down the older expense", () => {
  const txs = [checkpoint(800_000, "2026-11-22", "2026-11-22T10:00:00"), tx("expense", 200_000, "2026-11-20", "2026-11-22T11:00:00")];
  assert.equal(balanceAt(bank, txs), 800_000);
});

test("what happens after the check counts", () => {
  const check = checkpoint(800_000, "2026-11-22", "2026-11-22T10:00:00");
  assert.equal(balanceAt(bank, [check, tx("expense", 50_000, "2026-11-22", "2026-11-22T12:00:00")]), 750_000, "later the same day");
  assert.equal(balanceAt(bank, [check, tx("income", 100_000, "2026-11-23", "2026-11-23T09:00:00")]), 900_000, "another day");
  assert.equal(balanceAt(bank, [tx("expense", 50_000, "2026-11-22", "2026-11-22T09:00:00"), check]), 800_000, "earlier the same day is included");
});

test("a check dated in the past is that day's closing balance", () => {
  const check = checkpoint(700_000, "2026-11-15", "2026-11-22T10:00:00");
  assert.equal(balanceAt(bank, [check, tx("expense", 90_000, "2026-11-15", "2026-11-22T11:00:00")]), 700_000);
  assert.equal(balanceAt(bank, [check, tx("expense", 90_000, "2026-11-16", "2026-11-16T11:00:00")]), 610_000);
});

test("the day is Bogota's, not UTC's", () => {
  const check = checkpoint(800_000, "2026-11-22", "2026-11-22T20:30:00"); // the 23rd in UTC
  assert.equal(balanceAt(bank, [check, tx("expense", 10_000, "2026-11-22", "2026-11-22T21:00:00")]), 790_000);
});

test("the latest check wins, in any order of the list", () => {
  const txs = [
    checkpoint(900_000, "2026-11-22", "2026-11-22T15:00:00"),
    checkpoint(500_000, "2026-11-10", "2026-11-22T16:00:00"),
    checkpoint(800_000, "2026-11-22", "2026-11-22T10:00:00"),
  ];
  assert.equal(balanceAt(bank, txs), 900_000);
  assert.equal(balanceAt(bank, [...txs].reverse()), 900_000);
  assert.equal(balanceAt(bank, txs, "2026-11-12"), 500_000);
});

test("history before the first check keeps its sums", () => {
  const txs = [tx("expense", 100_000, "2026-10-10", "2026-10-10T10:00:00"), checkpoint(400_000, "2026-11-22", "2026-11-22T10:00:00")];
  assert.equal(balanceAt(bank, txs, "2026-10-31"), 900_000);
  assert.deepEqual(monthlySeries([bank], txs, "2026-11-22", 2).map((p) => p.savings), [900_000, 400_000]);
});

test("each account has its own: a payment older than the card's check still leaves the bank", () => {
  const txs = [
    checkpoint(300_000, "2026-11-22", "2026-11-22T10:00:00", { account_id: "card" }),
    tx("payment", 200_000, "2026-11-20", "2026-11-22T11:00:00", { account_id: "card", source_account_id: "bank" }),
  ];
  assert.equal(balanceAt(card, txs), 300_000);
  assert.equal(balanceAt(bank, txs), 800_000);
});

test("older adjustments keep adding, and no check is ever spending", () => {
  const old = tx("expense", 200_000, "2026-11-05", "2026-11-05T10:00:00", { category: ADJUSTMENT });
  assert.equal(balanceAt(bank, [old]), 800_000, "no checkpoint: as before");
  assert.equal(balanceAt(bank, [old, checkpoint(650_000, "2026-11-22", "2026-11-22T10:00:00")]), 650_000);
  assert.deepEqual(monthFlows([old, checkpoint(1, "2026-11-22", "2026-11-22T10:00:00")], "2026-11"), { income: 0, expense: 0, payment: 0 });
});
