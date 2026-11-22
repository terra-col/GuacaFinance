import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCOP, formatCompact } from "./finance.ts";
import { MASK, maskMoney } from "./privacy.ts";

test("private mode: every amount becomes the mask, nothing else changes", () => {
  assert.equal(maskMoney(formatCOP(8_004_000)), MASK);
  assert.equal(maskMoney(formatCOP(-42_000)), MASK);
  assert.equal(maskMoney(`+${formatCOP(7_000_000)}`), MASK);
  assert.equal(maskMoney(formatCompact(85_000)), MASK);
  assert.equal(maskMoney(formatCompact(1_250_000_000)), MASK);
  assert.equal(maskMoney(`Quedan ${formatCOP(166_200)}, unos ${formatCOP(16_620)} por día`), `Quedan ${MASK}, unos ${MASK} por día`);
  assert.equal(maskMoney("12 de 22 pagados"), null, "counts stay");
  assert.equal(maskMoney("92% del cupo"), null, "percentages stay");
  assert.equal(maskMoney("21 nov 2026"), null, "dates stay");
  assert.equal(maskMoney(MASK), null, "already masked");
});
