import assert from "node:assert/strict";
import { test } from "node:test";
import { computeShares, formatHundredths, matchingQuick, outcome, parseHundredths, parseSplit, quickSplits, splitOf, type Split, type SplitMode } from "./split.ts";

const of = (mode: SplitMode, ...values: number[]): Split => ({ mode, parts: values.map((value, i) => ({ id: "abcdefghij"[i], value })) });
const pesos = (amount: number, split: Split) => {
  const result = computeShares(amount, split);
  return result.ok ? result.shares.map((s) => s.amount) : result.error;
};

test("10.000 between two: the four usual answers", () => {
  const options = quickSplits("yo", "beto");
  const owed = options.map((o) => {
    const result = computeShares(10_000, o.split);
    assert.ok(result.ok);
    return outcome(10_000, o.paidBy, result.shares, "yo");
  });
  assert.deepEqual(owed, [5_000, 10_000, -5_000, -10_000]);
  for (const option of options) assert.equal(matchingQuick(options, option.paidBy, option.split)?.key, option.key);
  assert.equal(matchingQuick(options, "yo", of("exact", 5000, 5000)), undefined);
});

test("each of the five ways", () => {
  assert.deepEqual(pesos(100, of("equal", 0, 0, 0)), [34, 33, 33]);
  assert.deepEqual(pesos(10_000, of("exact", 7_000, 3_000)), [7_000, 3_000]);
  assert.deepEqual(pesos(10_000, of("percent", 7_000, 3_000)), [7_000, 3_000]);
  assert.deepEqual(pesos(100_000, of("percent", 3_333, 3_333, 3_334)), [33_330, 33_330, 33_340]);
  assert.deepEqual(pesos(90_000, of("shares", 200, 100)), [60_000, 30_000]);
  assert.deepEqual(pesos(90_000, of("shares", 150, 100, 50)), [45_000, 30_000, 15_000]);
  assert.deepEqual(pesos(100_000, of("adjust", 10_000, 0, 0)), [40_000, 30_000, 30_000]);
  assert.deepEqual(pesos(100_000, of("adjust", -10_000, 0)), [45_000, 55_000]);
});

test("what cannot be divided says why", () => {
  assert.match(String(pesos(10_000, of("exact", 4_000, 4_000))), /sumar el total/);
  assert.match(String(pesos(10_000, of("percent", 5_000, 4_999))), /100 %/);
  assert.match(String(pesos(10_000, of("shares", 0, 0))), /una parte/);
  assert.match(String(pesos(10_000, of("adjust", 11_000, 0))), /superan/);
  assert.match(String(pesos(10_000, of("adjust", -30_000, 0))), /por debajo de cero/);
  assert.match(String(pesos(10_000, of("equal"))), /entre quiénes/);
  assert.match(String(pesos(0, of("equal", 0))), /cuánto fue/);
});

test("never a peso lost nor made up, in any way and size", () => {
  let seed = 7;
  const next = (max: number) => ((seed = (seed * 48271) % 2147483647) % max);
  for (let round = 0; round < 4000; round++) {
    const n = 1 + next(10);
    const amount = round % 50 === 0 ? 9_999_999_999_999 - next(1000) : 1 + next(5_000_000);
    const cuts = Array.from({ length: n - 1 }, () => next(10_001)).sort((a, b) => a - b);
    const percent = [...cuts, 10_000].map((v, i) => v - (i ? cuts[i - 1] : 0));
    for (const split of [
      of("equal", ...Array(n).fill(0)),
      of("percent", ...percent),
      of("shares", ...Array.from({ length: n }, () => 1 + next(900))),
      of("adjust", ...Array.from({ length: n }, () => next(3) * 10)),
    ]) {
      const result = computeShares(amount, split);
      if (!result.ok) {
        assert.equal(split.mode, "adjust", `${amount} ${JSON.stringify(split)}`);
        continue;
      }
      assert.equal(result.shares.reduce((sum, s) => sum + s.amount, 0), amount, `${amount} ${JSON.stringify(split)}`);
      assert.ok(result.shares.every((s) => Number.isSafeInteger(s.amount) && s.amount > 0));
    }
  }
});

test("an expense opens as it was made, and saving it again changes nothing", () => {
  for (const split of [of("equal", 0, 0, 0), of("percent", 2_500, 7_500), of("shares", 200, 100, 100), of("adjust", 5_000, 0)]) {
    const result = computeShares(100_001, split);
    assert.ok(result.ok);
    const shares = Object.fromEntries(result.shares.map((s) => [s.member_id, s.amount]));
    assert.deepEqual(splitOf(100_001, shares, split, ["c", "b", "a"]), split);
  }
});

test("without how it was made, or no longer true: equal parts or exact amounts", () => {
  const equal = splitOf(100, { a: 33, b: 34, c: 33 }, null, ["a", "b", "c"]);
  assert.equal(equal.mode, "equal");
  const again = computeShares(100, equal);
  assert.ok(again.ok);
  assert.deepEqual(Object.fromEntries(again.shares.map((s) => [s.member_id, s.amount])), { a: 33, b: 34, c: 33 });
  assert.deepEqual(splitOf(10_000, { a: 8_000, b: 2_000 }, of("percent", 5_000, 5_000), ["a", "b"]), of("exact", 8_000, 2_000));
});

test("a split from outside is checked", () => {
  assert.deepEqual(parseSplit(of("percent", 10_000)), of("percent", 10_000));
  for (const bad of [null, {}, { mode: "otro", parts: [{ id: "a", value: 1 }] }, { mode: "equal", parts: [] }, of("exact", -5), of("shares", 1.5), { mode: "equal", parts: [{ id: "a", value: 0 }, { id: "a", value: 0 }] }]) {
    assert.equal(parseSplit(bad), null, JSON.stringify(bad));
  }
});

test("percentages and parts as typed", () => {
  assert.deepEqual(["", "50", "33,33", "0.5", ",5", "12,"].map(parseHundredths), [0, 5000, 3333, 50, 50, 1200]);
  for (const bad of ["-1", "1,234", "abc"]) assert.equal(parseHundredths(bad), null, bad);
  assert.deepEqual([3333, 200, 150].map(formatHundredths), ["33,33", "2", "1,5"]);
});
