import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetViews } from "./budget.ts";
import { balanceAt, monthFlows, spendingByCategory, type Account, type Tx } from "./finance.ts";
import { NO_SHARED, flowTxs, groupNets, invitePath, myPosition, settleUp, sharedMarks, splitEqual, type SharedData } from "./shared.ts";

const bank: Account = {
  id: "bank", kind: "savings", name: "Banco", institution: null, opening_balance: 1_000_000, opening_date: "2026-01-01",
  credit_limit: null, annual_rate: null, monthly_payment: null, statement_day: null, due_day: null, wallet_card_name: null,
};
const tx = (id: string, kind: Tx["kind"], amount: number, category: string | null = null): Tx => ({
  id, account_id: "bank", source_account_id: null, kind, amount, category, description: null, occurred_on: "2026-11-22", source: "manual", bill_id: null,
});

/** Ana pays a dinner of 300.000 for three. */
const dinner: SharedData = {
  groups: [{ id: "g", name: "Cena", created_by: "ana", created_at: "2026-11-22" }],
  members: [
    { id: "a", group_id: "g", user_id: "ana", name: "Ana" },
    { id: "b", group_id: "g", user_id: "beto", name: "Beto" },
    { id: "c", group_id: "g", user_id: null, name: "Caro" },
  ],
  entries: [{ id: "e", group_id: "g", kind: "expense", description: "Cena", category: "Restaurantes", amount: 300_000, paid_by: "a", occurred_on: "2026-11-22", created_by: "ana" }],
  shares: ["a", "b", "c"].map((member_id) => ({ entry_id: "e", group_id: "g", member_id, amount: 100_000 })),
  links: [{ tx_id: "t", entry_id: "e" }],
};
const paid = [tx("t", "expense", 300_000, "Restaurantes")];

test("split: whole pesos that always add up", () => {
  assert.deepEqual(splitEqual(100, ["a", "b", "c"]).map((s) => s.amount), [34, 33, 33]);
  assert.deepEqual(splitEqual(2, ["a", "b", "c"]).map((s) => s.amount), [1, 1]);
  assert.deepEqual(splitEqual(100, []), []);
  for (const n of [1, 7, 13, 30]) {
    const ids = Array.from({ length: n }, (_, i) => String(i));
    assert.equal(splitEqual(1_000_001, ids).reduce((sum, s) => sum + s.amount, 0), 1_000_001);
  }
});

test("the dinner: 300.000 out of the account, 100.000 of spending, 200.000 owed to the payer", () => {
  assert.equal(balanceAt(bank, paid), 700_000);
  const flows = flowTxs(paid, dinner, "ana");
  assert.deepEqual(spendingByCategory(flows, "2026-11"), [{ category: "Restaurantes", amount: 100_000 }]);
  const position = myPosition(dinner, "ana");
  assert.deepEqual([position.owedToMe, position.iOwe], [200_000, 0]);
});

test("the dinner for who did not pay: spending and a debt, no money moved", () => {
  const theirs = { ...dinner, links: [] };
  assert.equal(monthFlows(flowTxs([], theirs, "beto"), "2026-11").expense, 100_000);
  assert.equal(myPosition(theirs, "beto").iOwe, 100_000);
});

test("being paid back: the account goes up and it is not income", () => {
  const settled: SharedData = {
    ...dinner,
    entries: [...dinner.entries, { id: "s", group_id: "g", kind: "settlement", description: "Pago", category: null, amount: 100_000, paid_by: "b", occurred_on: "2026-11-22", created_by: "beto" }],
    shares: [...dinner.shares, { entry_id: "s", group_id: "g", member_id: "a", amount: 100_000 }],
    links: [...dinner.links, { tx_id: "r", entry_id: "s" }],
  };
  const txs = [...paid, tx("r", "income", 100_000)];
  assert.equal(balanceAt(bank, txs), 800_000);
  assert.deepEqual(monthFlows(flowTxs(txs, settled, "ana"), "2026-11"), { income: 0, expense: 100_000, payment: 0, transfer: 0 });
  assert.equal(myPosition(settled, "ana").owedToMe, 100_000);
  assert.equal(monthFlows(flowTxs([], { ...settled, links: [] }, "beto"), "2026-11").expense, 100_000, "paying back is not spending again");
});

test("budgets read the share, in the category the person gave their own movement", () => {
  const flows = flowTxs([tx("t", "expense", 300_000, "Ocio")], dinner, "ana");
  assert.equal(budgetViews([{ id: "1", category: "Ocio", amount: 500_000 }], flows, "2026-11", "2026-11-22")[0].spent, 100_000);
});

test("paying for something that is all someone else's is not spending", () => {
  const gift = { ...dinner, shares: [{ entry_id: "e", group_id: "g", member_id: "b", amount: 300_000 }] };
  assert.equal(monthFlows(flowTxs(paid, gift, "ana"), "2026-11").expense, 0);
});

test("without groups nothing changes", () => {
  assert.equal(flowTxs(paid, NO_SHARED, "ana"), paid);
});

test("settle up: everyone ends at zero", () => {
  for (let round = 1; round < 300; round++) {
    const n = 2 + (round % 9);
    const values = Array.from({ length: n - 1 }, (_, i) => ((round * 7919 * (i + 3)) % 200_001) - 100_000);
    values.push(-values.reduce((a, b) => a + b, 0));
    const nets = new Map(values.map((v, i) => [String(i), v]));
    const transfers = settleUp(nets);
    for (const { from, to, amount } of transfers) {
      assert.ok(amount > 0 && from !== to);
      nets.set(from, nets.get(from)! + amount);
      nets.set(to, nets.get(to)! - amount);
    }
    assert.ok([...nets.values()].every((v) => v === 0));
    assert.ok(transfers.length <= n - 1);
  }
});

test("one group's debt does not cancel another's credit", () => {
  const two: SharedData = {
    groups: [...dinner.groups, { id: "h", name: "Viaje", created_by: "ana", created_at: "2026-11-22" }],
    members: [...dinner.members, { id: "x", group_id: "h", user_id: "ana", name: "Ana" }, { id: "y", group_id: "h", user_id: null, name: "Leo" }],
    entries: [...dinner.entries, { ...dinner.entries[0], id: "f", group_id: "h", amount: 50_000, paid_by: "y" }],
    shares: [...dinner.shares, { entry_id: "f", group_id: "h", member_id: "x", amount: 50_000 }],
    links: [],
  };
  const position = myPosition(two, "ana");
  assert.deepEqual([position.owedToMe, position.iOwe], [200_000, 50_000]);
  assert.equal([...groupNets("h", two).values()].reduce((a, b) => a + b, 0), 0);
});

test("marks say how much of a movement is one's own", () => {
  assert.deepEqual(sharedMarks(dinner, "ana").t, { groupId: "g", kind: "expense", mine: 100_000 });
});

test("invitation return path: only an invitation", () => {
  const token = "A".repeat(32);
  assert.equal(invitePath(`/unirse/${token}`), `/unirse/${token}`);
  for (const bad of ["//evil.example", `/unirse/${token}/../../x`, "/ajustes", `https://evil.example/unirse/${token}`, undefined]) assert.equal(invitePath(bad), null);
});
