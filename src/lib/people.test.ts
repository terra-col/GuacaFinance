import assert from "node:assert/strict";
import { test } from "node:test";
import { groupTitle, peopleWith, splitTargets } from "./people.ts";
import { myPosition, sharedMarks, type SharedData } from "./shared.ts";

const base = (): SharedData => ({
  groups: [
    { id: "g", name: "Viaje", created_by: "ana", created_at: "" },
    { id: "d", name: "Ana y Beto", created_by: "ana", created_at: "", direct: true },
  ],
  members: [
    { id: "ga", group_id: "g", user_id: "ana", name: "Ana" },
    { id: "gb", group_id: "g", user_id: "beto", name: "Beto" },
    { id: "gc", group_id: "g", user_id: null, name: "Caro" },
    { id: "da", group_id: "d", user_id: "ana", name: "Ana" },
    { id: "db", group_id: "d", user_id: "beto", name: "Beto" },
  ],
  entries: [
    { id: "e1", group_id: "g", kind: "expense", description: "Hotel", category: null, amount: 300_000, paid_by: "ga", occurred_on: "2026-11-22", created_by: "ana" },
    { id: "e2", group_id: "d", kind: "expense", description: "Taxi", category: null, amount: 40_000, paid_by: "db", occurred_on: "2026-11-22", created_by: "beto" },
  ],
  shares: [
    ...["ga", "gb", "gc"].map((member_id) => ({ entry_id: "e1", group_id: "g", member_id, amount: 100_000 })),
    { entry_id: "e2", group_id: "d", member_id: "da", amount: 40_000 },
  ],
  links: [{ tx_id: "t", entry_id: "e1" }],
});

test("each person once, with what is pending across groups and the account between two", () => {
  const people = peopleWith(base(), "ana");
  assert.deepEqual(people.map((p) => [p.name, p.total]), [["Caro", 100_000], ["Beto", 60_000]]);
  const beto = people[1];
  assert.deepEqual(beto.places.map((p) => [p.group.id, p.net]), [["d", -40_000], ["g", 100_000]]);
  assert.equal(beto.direct, "d");
});

test("what is pending with each person adds up to one's position", () => {
  const data = base();
  for (const user of ["ana", "beto"]) {
    const position = myPosition(data, user);
    assert.equal(peopleWith(data, user).reduce((sum, p) => sum + p.total, 0), position.owedToMe - position.iOwe, user);
  }
});

test("the same phone is one person, also without an account", () => {
  const data = base();
  data.members.find((m) => m.id === "gc")!.phone = "+573001112233";
  data.groups.push({ id: "c", name: "Ana y Carolina", created_by: "ana", created_at: "", direct: true });
  data.members.push({ id: "ca", group_id: "c", user_id: "ana", name: "Ana" }, { id: "cc", group_id: "c", user_id: null, name: "Carolina", phone: "+573001112233" });
  const caro = peopleWith(data, "ana").filter((p) => p.phone === "+573001112233");
  assert.equal(caro.length, 1);
  assert.equal(caro[0].direct, "c");
});

test("a deleted group leaves people, balances and links to it", () => {
  const data = base();
  data.groups = data.groups.filter((g) => g.id !== "g");
  assert.deepEqual(peopleWith(data, "ana").map((p) => [p.name, p.total]), [["Beto", -40_000]]);
  assert.equal(sharedMarks(data, "ana").t.groupId, null);
  assert.equal(sharedMarks(data, "ana").t.mine, 100_000);
});

test("between two it is called by the other one", () => {
  const data = base();
  assert.equal(groupTitle(data.groups[1], data, "ana"), "Beto");
  assert.equal(groupTitle(data.groups[1], data, "beto"), "Ana");
  assert.equal(groupTitle(data.groups[0], data, "ana"), "Viaje");
});

test("who to divide with: people first, without repeating their account as a group", () => {
  const targets = splitTargets(base(), "ana", "Ana");
  assert.deepEqual(targets.map((t) => [t.kind, t.name, t.group]), [["person", "Caro", null], ["person", "Beto", "d"], ["group", "Viaje", "g"]]);
  assert.equal(targets[0].me, "me");
});
