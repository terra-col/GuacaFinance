import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, normalizePhone } from "./phone.ts";

test("phone: a Colombian mobile in any usual writing, kept as +57", () => {
  for (const raw of ["3001234567", "300 123 4567", "+57 300-123-4567", "57 3001234567", "(300) 123 4567", "0057 300 123 4567"]) {
    assert.equal(normalizePhone(raw), "+573001234567", raw);
  }
  assert.equal(normalizePhone("  "), null);
  for (const raw of ["601 234 5678", "300123456", "30012345678", "+1 300 123 4567", "abc"]) assert.equal(normalizePhone(raw), "invalid", raw);
  assert.equal(formatPhone("+573001234567"), "300 123 4567");
  assert.equal(formatPhone(""), "");
});
