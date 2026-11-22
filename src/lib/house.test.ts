import assert from "node:assert/strict";
import { test } from "node:test";
import { advise } from "./advice.ts";
import { monthPlan } from "./budget.ts";
import { calendarEntries } from "./calendar.ts";
import { monthlyChecklist, type Account, type Bill } from "./finance.ts";
import { houseChecklist, houseMonth, houseSummary, type HouseBill, type HouseData, type HousePayment } from "./house.ts";
import type { SharedData } from "./shared.ts";

const MONTH = "2026-11";
const TODAY = "2026-11-22";
const CREATED = "2026-10-01T15:00:00Z";

const shared = (): SharedData => ({
  groups: [{ id: "h", name: "La casa", created_by: "ana", created_at: CREATED, house: true }],
  members: [
    { id: "a", group_id: "h", user_id: "ana", name: "Ana" },
    { id: "b", group_id: "h", user_id: "beto", name: "Beto" },
    { id: "c", group_id: "h", user_id: "caro", name: "Caro" },
  ],
  entries: [],
  shares: [],
  links: [],
});
const bill = (id: string, more: Partial<HouseBill> = {}): HouseBill => ({
  id, group_id: "h", name: id, amount: 100_000, category: null, due_day: 25, every: "monthly", starts_on: null, responsible: "a", split: false, created_at: CREATED, ended_month: null, ...more,
});
let n = 0;
const paid = (bill_id: string, paid_by: string, amount: number, more: Partial<HousePayment> = {}): HousePayment => ({
  id: `p${++n}`, bill_id, group_id: "h", for_month: MONTH, for_date: null, paid_by, amount, occurred_on: "2026-11-10", settles: true, entry_id: null, created_by: null, created_at: `2026-11-10T12:00:${String(n % 60).padStart(2, "0")}Z`, ...more,
});
const house = (bills: HouseBill[], payments: HousePayment[] = [], more: Partial<HouseData> = {}): HouseData => ({ ready: true, bills, payments, links: [], skips: [], ...more });
const obligations = (data: HouseData, user: string) => monthPlan([], houseChecklist(data, shared(), user, MONTH, TODAY), []).obligations;
const everyone = (data: HouseData) => ["ana", "beto", "caro"].map((user) => obligations(data, user));

test("pending, it is the responsible's alone", () => {
  assert.deepEqual(everyone(house([bill("internet")])), [100_000, 0, 0]);
  assert.deepEqual(everyone(house([bill("luz", { responsible: null })])), [0, 0, 0], "with no responsible, nobody's plan");
});

test("paid, it is of who paid, whoever was responsible", () => {
  assert.deepEqual(everyone(house([bill("internet")], [paid("internet", "a", 98_000)])), [98_000, 0, 0]);
  assert.deepEqual(everyone(house([bill("internet")], [paid("internet", "b", 100_000)])), [0, 100_000, 0]);
});

test("in parts, the whole adds up to the receipt and never twice", () => {
  const parts = house([bill("arriendo")], [paid("arriendo", "b", 40_000, { settles: false })]);
  assert.deepEqual(everyone(parts), [60_000, 40_000, 0]);
  const own = house([bill("arriendo")], [paid("arriendo", "a", 25_000, { settles: false })]);
  assert.deepEqual(everyone(own), [100_000, 0, 0], "what one put and what is left");
  const done = house([bill("arriendo")], [paid("arriendo", "b", 40_000, { settles: false }), paid("arriendo", "c", 35_000, { settles: false }), paid("arriendo", "a", 25_000)]);
  assert.deepEqual(everyone(done), [25_000, 40_000, 35_000]);
});

test("the list has what one answers for or paid, and the card sums up the whole house", () => {
  const data = house([bill("internet"), bill("luz", { responsible: "b", due_day: 28 }), bill("agua", { responsible: "c", due_day: 5 })], [paid("agua", "c", 82_000)]);
  assert.deepEqual(houseChecklist(data, shared(), "ana", MONTH, TODAY).map((i) => i.name), ["internet"]);
  const summary = houseSummary(houseMonth(data, shared(), "ana", "h", MONTH, TODAY));
  assert.deepEqual([summary.paid, summary.of, summary.next?.name, summary.more], [1, 3, "internet", 0]);
});

test("skipped it counts for nobody and leaves the card's count", () => {
  const data = house([bill("gas")], [], { skips: [{ id: "s", bill_id: "gas", group_id: "h", for_month: MONTH, for_date: null, note: null }] });
  assert.deepEqual(everyone(data), [0, 0, 0]);
  assert.equal(houseSummary(houseMonth(data, shared(), "ana", "h", MONTH, TODAY)).of, 0);
});

test("by dates each one ticks alone", () => {
  const data = house([bill("aseo", { every: "w1", starts_on: "2026-11-02", amount: 50_000 })], [paid("aseo", "a", 50_000, { for_date: "2026-11-09" })]);
  const rows = houseMonth(data, shared(), "ana", "h", MONTH, TODAY);
  assert.deepEqual(rows.map((r) => [r.date, r.settled]), [["2026-11-02", false], ["2026-11-09", true], ["2026-11-16", false], ["2026-11-23", false], ["2026-11-30", false]]);
  assert.equal(obligations(data, "ana"), 250_000);
});

test("a receipt starts the month it was created and leaves the month it ended, keeping what was paid", () => {
  const old = bill("cable", { created_at: "2026-11-03T15:00:00Z", ended_month: "2026-12" });
  const months = (data: HouseData) => ["2026-10", "2026-11", "2026-12"].map((m) => houseMonth(data, shared(), "ana", "h", m, TODAY).length);
  assert.deepEqual(months(house([old])), [0, 1, 0]);
  assert.deepEqual(months(house([old], [paid("cable", "b", 1000, { for_month: "2026-12" })])), [0, 1, 1]);
});

test("who left can no longer be changed nor be the responsible", () => {
  const data = shared();
  data.members[1].removed_at = "2026-11-15T12:00:00Z";
  const [row] = houseMonth(house([bill("internet", { responsible: "b" })], [paid("internet", "b", 100_000, { created_by: "ana" })]), data, "ana", "h", MONTH, TODAY);
  assert.deepEqual([row.responsible, row.payments[0].who, row.payments[0].canEdit, row.members.length], [null, "Beto", false, 2]);
});

test("a fixed payment that moved to a house leaves from that month on, and only then", () => {
  const bank: Account = {
    id: "bank", kind: "savings", name: "Banco", institution: null, opening_balance: 1_000_000, opening_date: "2026-01-01",
    credit_limit: null, annual_rate: null, monthly_payment: null, statement_day: null, due_day: null, wallet_card_name: null,
  };
  const own: Bill = { id: "own", name: "Internet", amount: 100_000, due_day: 24, category: null, created_at: "2026-01-01T12:00:00Z", ended_month: "2026-11" };
  assert.equal(monthlyChecklist([bank], [own], [], "2026-10", TODAY).length, 1);
  assert.equal(monthlyChecklist([bank], [own], [], MONTH, TODAY).length, 0);
  assert.equal(advise([bank], [], TODAY, [own]).filter((a) => a.id === "bill-own").length, 0);
});

test("due soon it is advised to the responsible, and on the calendar it shows what was paid", () => {
  const due = house([bill("internet", { due_day: 24 })]);
  const items = (user: string, data: HouseData) => houseChecklist(data, shared(), user, MONTH, TODAY);
  assert.equal(advise([], [], TODAY, [], [], [], items("ana", due)).filter((a) => a.id === "house-internet").length, 1);
  assert.equal(advise([], [], TODAY, [], [], [], items("beto", due)).filter((a) => a.id === "house-internet").length, 0);
  const done = house([bill("internet", { due_day: 24 })], [paid("internet", "b", 98_000)]);
  assert.equal(calendarEntries(items("ana", done), []).byDate["2026-11-24"][0].amount, 98_000, "not zero because another paid it");
});
