import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowedTxKinds,
  balanceAt,
  billStatus,
  monthlyChecklist,
  monthlySeries,
  shiftMonth,
  nextDueDate,
  dueDates,
  isDebt,
  parsePesos,
  parseWalletAmount,
  spendingByCategory,
  todayInBogota,
  totals,
  ADJUSTMENT,
  type Account,
  type Tx,
} from "./finance.ts";

const base = {
  institution: null,
  credit_limit: null,
  annual_rate: null,
  monthly_payment: null,
  statement_day: null,
  due_day: null,
  wallet_card_name: null,
};
const ahorros: Account = { ...base, id: "a", kind: "savings", name: "Ahorros", opening_balance: 5_000_000, opening_date: "2026-09-01" };
const tarjeta: Account = { ...base, id: "t", kind: "credit_card", name: "Visa", opening_balance: 2_000_000, opening_date: "2026-09-01" };
const credito: Account = { ...base, id: "c", kind: "loan", name: "Libre inversión", opening_balance: 10_000_000, opening_date: "2026-10-15" };
const accounts = [ahorros, tarjeta, credito];

let n = 0;
const tx = (t: Partial<Tx> & Pick<Tx, "account_id" | "kind" | "amount" | "occurred_on">): Tx => ({
  id: String(++n),
  source_account_id: null,
  category: null,
  description: null,
  source: "manual",
  bill_id: null,
  ...t,
});

const txs: Tx[] = [
  tx({ account_id: "a", kind: "income", amount: 3_000_000, occurred_on: "2026-09-30" }),
  tx({ account_id: "t", kind: "expense", amount: 400_000, occurred_on: "2026-10-05", category: "Ocio" }),
  tx({ account_id: "a", kind: "expense", amount: 100_000, occurred_on: "2026-10-06", category: "Mercado" }),
  tx({ account_id: "t", source_account_id: "a", kind: "payment", amount: 1_000_000, occurred_on: "2026-10-20" }),
  tx({ account_id: "c", kind: "payment", amount: 500_000, occurred_on: "2026-11-10" }),
  tx({ account_id: "t", kind: "expense", amount: 50_000, occurred_on: "2026-11-12", category: "Ocio" }),
];

test("a purchase raises card debt and a payment lowers it", () => {
  assert.equal(balanceAt(tarjeta, txs), 2_000_000 + 400_000 - 1_000_000 + 50_000);
});

test("a payment funded from savings lowers both the debt and the savings balance", () => {
  assert.equal(balanceAt(ahorros, txs), 5_000_000 + 3_000_000 - 100_000 - 1_000_000);
});

test("a payment with no source account only touches the debt", () => {
  assert.equal(balanceAt(credito, txs), 9_500_000);
});

test("balanceAt ignores movements after the cut-off date", () => {
  assert.equal(balanceAt(tarjeta, txs, "2026-10-19"), 2_400_000);
  assert.equal(balanceAt(tarjeta, txs, "2026-10-20"), 1_400_000);
});

test("totals: net worth is savings minus debt", () => {
  const t = totals(accounts, txs);
  assert.deepEqual(t, { savings: 6_900_000, debt: 1_450_000 + 9_500_000, net: 6_900_000 - 10_950_000 });
});

test("monthlySeries gives month-end balances and leaves out accounts that did not exist yet", () => {
  const series = monthlySeries(accounts, txs, "2026-11-15", 4);
  assert.deepEqual(series.map((p) => p.month), ["2026-08", "2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(series[0], { month: "2026-08", label: "ago 26", savings: 0, debt: 0, net: 0, byAccount: { a: null, t: null, c: null } });
  assert.equal(series[1].savings, 8_000_000);
  assert.equal(series[1].debt, 2_000_000);
  assert.equal(series[1].byAccount.c, null);
  assert.equal(series[2].debt, 1_400_000 + 10_000_000);
  assert.equal(series[3].debt, 1_450_000 + 9_500_000);
});

test("monthlySeries cuts the current month at today", () => {
  const series = monthlySeries(accounts, txs, "2026-11-11", 1);
  assert.equal(series[0].byAccount.t, 1_400_000); // the 12 nov purchase has not happened yet
});

test("spendingByCategory counts expenses only, largest first", () => {
  assert.deepEqual(spendingByCategory(txs, "2026-10"), [
    { category: "Ocio", amount: 400_000 },
    { category: "Mercado", amount: 100_000 },
  ]);
  assert.deepEqual(spendingByCategory(txs, "2026-12"), []);
});

test("nextDueDate rolls to next month, across the year end, and clamps short months", () => {
  assert.equal(nextDueDate(20, "2026-11-15"), "2026-11-20");
  assert.equal(nextDueDate(15, "2026-11-15"), "2026-11-15");
  assert.equal(nextDueDate(5, "2026-12-15"), "2027-01-05");
  assert.equal(nextDueDate(31, "2027-02-10"), "2027-02-28");
  assert.equal(nextDueDate(30, "2027-02-28"), "2027-02-28"); // day 30 clamps to feb 28, which is today
  assert.equal(nextDueDate(27, "2027-02-28"), "2027-03-27");
});

test("parsePesos accepts thousands separators and rejects empty input", () => {
  assert.equal(parsePesos("1.500.000"), 1_500_000);
  assert.equal(parsePesos("$ 80,000"), 80_000);
  assert.equal(parsePesos("abc"), null);
});

test("todayInBogota uses Colombian time, not UTC", () => {
  assert.equal(todayInBogota(new Date("2026-11-16T03:00:00Z")), "2026-11-15");
});

test("dueDates lists consecutive months", () => {
  assert.deepEqual(dueDates(31, "2026-12-31", 3), ["2026-12-31", "2027-01-31", "2027-02-28"]);
});

test("parseWalletAmount reads the formats a phone can send", () => {
  assert.equal(parseWalletAmount("85000"), 85_000);
  assert.equal(parseWalletAmount("$ 85.000,00"), 85_000);
  assert.equal(parseWalletAmount("85,000.00"), 85_000);
  assert.equal(parseWalletAmount("85.000"), 85_000);
  assert.equal(parseWalletAmount("COP 1.250.300"), 1_250_300);
  assert.equal(parseWalletAmount("12.345,6"), 12_346);
  assert.equal(parseWalletAmount(85000.4), 85_000);
  assert.equal(parseWalletAmount("0,00"), null);
  assert.equal(parseWalletAmount(""), null);
  assert.equal(parseWalletAmount(undefined), null);
});

test("billStatus: unpaid shows this month's date (even overdue); paid moves to next month", () => {
  const bill = { id: "b", name: "Internet", amount: 90_000, due_day: 10, category: null };
  assert.deepEqual(billStatus(bill, [], "2026-11-08"), { date: "2026-11-10", paidThisMonth: false, days: 2 });
  assert.deepEqual(billStatus(bill, [], "2026-11-15"), { date: "2026-11-10", paidThisMonth: false, days: -5 });
  const paid = [tx({ account_id: "a", kind: "expense", amount: 90_000, occurred_on: "2026-11-09", bill_id: "b" })];
  assert.deepEqual(billStatus(bill, paid, "2026-11-15"), { date: "2026-12-10", paidThisMonth: true, days: 25 });
  const lastMonth = [tx({ account_id: "a", kind: "expense", amount: 90_000, occurred_on: "2026-10-31", bill_id: "b" })];
  assert.equal(billStatus(bill, lastMonth, "2026-11-15").paidThisMonth, false);
});

test("monthlyChecklist: bills and debts for the month, by due date, renewed each month", () => {
  const bills = [
    { id: "net", name: "Internet", amount: 90_000, due_day: 5, category: null },
    { id: "luz", name: "Luz", amount: null, due_day: 12, category: null },
  ];
  const loan: Account = { ...credito, due_day: 28, monthly_payment: 500_000 };
  const card: Account = { ...tarjeta, due_day: 20 };
  const all = [ahorros, card, loan];
  const pay = [
    tx({ account_id: "a", kind: "expense", amount: 90_000, occurred_on: "2026-11-04", bill_id: "net" }),
    ...txs,
  ].sort((x, y) => y.occurred_on.localeCompare(x.occurred_on));

  const nov = monthlyChecklist(all, bills, pay, "2026-11", "2026-11-15");
  assert.deepEqual(nov.map((i) => [i.name, i.paid, i.overdue]), [
    ["Internet", true, false],
    ["Luz", false, true],
    ["Visa", false, false],
    ["Libre inversión", true, false],
  ]);
  const byName = Object.fromEntries(nov.map((i) => [i.name, i]));
  assert.equal(byName.Internet.paidAmount, 90_000);
  assert.equal(byName.Luz.quick, null, "variable amount has to be asked");
  assert.equal(byName.Visa.quick, null, "a card payment has no fixed amount");
  assert.equal(byName.Visa.due, "2026-11-20");

  const dec = monthlyChecklist(all, bills, pay, "2026-12", "2026-12-01");
  assert.ok(dec.every((i) => !i.paid), "a new month starts with nothing ticked");
  const internet = dec.find((i) => i.name === "Internet")!;
  assert.deepEqual(internet.quick, { amount: 90_000, accountId: "a" }, "one tap: fixed amount, same account as last time");
  const libre = dec.find((i) => i.name === "Libre inversión")!;
  assert.deepEqual(libre.quick, { amount: 500_000, accountId: null }, "the loan's last payment named no source account");

  const sep = monthlyChecklist(all, bills, pay, "2026-09", "2026-11-15");
  assert.ok(!sep.some((i) => i.name === "Libre inversión"), "the loan did not exist in September");
});

test("monthlyChecklist leaves out a debt that owes nothing", () => {
  const paidOff: Account = { ...tarjeta, opening_balance: 0 };
  assert.deepEqual(monthlyChecklist([paidOff], [], [], "2026-11", "2026-11-15"), []);
});

test("shiftMonth crosses years", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});

test("monthlyChecklist does not list a bill in months before it was registered", () => {
  const bill = { id: "gym", name: "Gimnasio", amount: 80_000, due_day: 3, category: null, created_at: "2026-11-15T20:00:00Z" };
  assert.equal(monthlyChecklist([], [bill], [], "2026-10", "2026-11-15").length, 0);
  assert.equal(monthlyChecklist([], [bill], [], "2026-11", "2026-11-15").length, 1);
});

test("cash works like savings: holds money, takes income and expenses, can fund a debt payment", () => {
  const billetera: Account = { ...ahorros, id: "e", kind: "cash", name: "Billetera", opening_balance: 300_000 };
  const moves = [
    tx({ account_id: "e", kind: "income", amount: 200_000, occurred_on: "2026-11-01" }),
    tx({ account_id: "e", kind: "expense", amount: 50_000, occurred_on: "2026-11-02" }),
    tx({ account_id: "t", source_account_id: "e", kind: "payment", amount: 100_000, occurred_on: "2026-11-03" }),
  ];
  assert.equal(balanceAt(billetera, moves), 350_000);
  assert.deepEqual(totals([billetera], moves), { savings: 350_000, debt: 0, net: 350_000 });
  assert.equal(isDebt(billetera), false);
  assert.deepEqual(allowedTxKinds("cash"), ["income", "expense"]);
});

test("checklist: a balance adjustment does not tick a debt as paid", () => {
  const card: Account = { ...tarjeta, due_day: 20, monthly_payment: 300_000 };
  const adjustment = tx({ account_id: "t", kind: "payment", amount: 120_000, occurred_on: "2026-11-16", category: ADJUSTMENT, description: "Ajuste de saldo" });
  const [item] = monthlyChecklist([card], [], [adjustment], "2026-11", "2026-11-17");
  assert.equal(item.paid, false);
});

test("checklist: a bill created late on the last evening of a month (Bogotá) is not listed for that month", () => {
  // 31 oct 2026, 9 pm in Bogotá is already 1 nov in UTC.
  const bill = { id: "b", name: "Gym", amount: 80_000, due_day: 5, category: null, created_at: "2026-11-01T02:00:00Z" };
  assert.equal(monthlyChecklist([], [bill], [], "2026-10", "2026-10-31").length, 1);
  assert.equal(monthlyChecklist([], [bill], [], "2026-09", "2026-10-31").length, 0);
});

test("favourite account: payments come from it by default, before the one used last time", async () => {
  const { favoriteAccountId, favoriteFirst } = await import("./finance.ts");
  const nequi: Account = { ...ahorros, id: "n", name: "Nequi", favorite: true };
  const bill = { id: "b", name: "Internet", amount: 90_000, due_day: 10, category: null };
  const lastTime = [tx({ account_id: "a", kind: "expense", amount: 90_000, occurred_on: "2026-10-10", bill_id: "b" })];
  const debtTxs = [...txs];
  const withFav = monthlyChecklist([ahorros, nequi, tarjeta], [bill], [...lastTime, ...debtTxs], "2026-11", "2026-11-17");
  assert.equal(withFav.find((i) => i.type === "bill")!.quick!.accountId, "n", "the favourite wins over the last one used");
  const noFav = monthlyChecklist([ahorros, { ...nequi, favorite: false }, tarjeta], [bill], [...lastTime, ...debtTxs], "2026-11", "2026-11-17");
  assert.equal(noFav.find((i) => i.type === "bill")!.quick!.accountId, "a", "without one, the last one used");
  assert.equal(favoriteAccountId([{ ...tarjeta, favorite: true }]), null, "only savings or cash count");
  assert.deepEqual(favoriteFirst([ahorros, nequi, tarjeta]).map((a) => a.id), ["n", "a", "t"]);
});

test("categories to offer: the app's own, then the person's, once each", async () => {
  const { knownCategories, CATEGORIES } = await import("./finance.ts");
  const list = knownCategories(["Gasolina", "mercado", "Ajuste de saldo", " Gasolina ", null, "Arriendo", "gasolina"]);
  assert.deepEqual(list.slice(0, CATEGORIES.length), CATEGORIES);
  assert.deepEqual(list.slice(CATEGORIES.length), ["Arriendo", "Gasolina"], "no repeats (case aside), no adjustments, no app categories again");
});
