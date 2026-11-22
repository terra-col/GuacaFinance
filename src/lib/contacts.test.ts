import assert from "node:assert/strict";
import { test } from "node:test";
import { contactPhone, fromContact, knownByPhone, knownPeople, whatsappLink } from "./contacts.ts";
import { NO_SHARED, type SharedData } from "./shared.ts";

test("contact phone: Colombian mobiles, and others with their country code", () => {
  for (const raw of ["300 123 4567", "+57 (300) 123-4567", "573001234567", "300 123 4567"]) assert.equal(contactPhone(raw), "+573001234567", raw);
  assert.equal(contactPhone("+34 612 34 56 78"), "+34612345678");
  assert.equal(contactPhone("0034 612 345 678"), "+34612345678");
  assert.equal(contactPhone(""), null);
  for (const raw of ["601 234 5678", "+57 601 234 5678", "12345", "300 abc"]) assert.equal(contactPhone(raw), "invalid", raw);
});

test("a picked contact: its name as saved, and a mobile before a landline", () => {
  assert.deepEqual(fromContact({ name: ["  Juan   Fe "], tel: ["601 234 5678", "+34 612 345 678", "310 555 0000"] }), { name: "Juan Fe", phone: "+573105550000" });
  assert.deepEqual(fromContact({ name: [], tel: ["300 123 4567"] }), { name: "+573001234567", phone: "+573001234567" });
  assert.deepEqual(fromContact({ name: ["Sin número"] }), { name: "Sin número", phone: "" });
});

const data: SharedData = {
  ...NO_SHARED,
  members: [
    { id: "me1", group_id: "g", user_id: "yo", name: "Yo" },
    { id: "b1", group_id: "g", user_id: "beto", name: "Beto", phone: "+573001234567" },
    { id: "b2", group_id: "h", user_id: null, name: "Beto", phone: "+573001234567" },
    { id: "c1", group_id: "g", user_id: null, name: "Caro" },
    { id: "c2", group_id: "h", user_id: null, name: "caro" },
  ],
};

test("known people: once each; a number stands for the account that accepted", () => {
  const known = knownPeople(data, "yo");
  assert.deepEqual(known.map((k) => k.name.toLowerCase()), ["beto", "caro"]);
  assert.deepEqual([known[0].member, known[0].userId], ["b1", "beto"]);
  assert.equal(knownByPhone(known, "300 123 4567")?.member, "b1");
  assert.equal(knownByPhone(known, "311 000 0000"), undefined);
});

test("WhatsApp: only digits, the message encoded", () => {
  assert.equal(whatsappLink("+573001234567", "Hola & chao"), "https://wa.me/573001234567?text=Hola%20%26%20chao");
});
