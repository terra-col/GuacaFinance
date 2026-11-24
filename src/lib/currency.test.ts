import assert from "node:assert/strict";
import { test } from "node:test";
import { formatForeign, parseHundredths, parseRate, toPesos } from "./currency.ts";

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
