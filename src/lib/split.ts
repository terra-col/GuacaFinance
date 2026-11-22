// The five ways to divide an expense. What is saved as truth are the pesos of each person; the way
// they were reached is kept only to open the expense again as it was made.
import { splitEqual } from "./shared.ts";

export type SplitMode = "equal" | "exact" | "percent" | "shares" | "adjust";

export const SPLIT_MODES: { mode: SplitMode; title: string; hint: string }[] = [
  { mode: "equal", title: "Por partes iguales", hint: "Elige entre quiénes se divide por igual." },
  { mode: "exact", title: "Por montos exactos", hint: "Escribe cuánto le toca a cada quien." },
  { mode: "percent", title: "Por porcentajes", hint: "Reparte el 100 % como sea justo para ustedes." },
  { mode: "shares", title: "Por partes", hint: "Quien cuenta por dos lleva 2 partes: una pareja, más noches, una habitación más grande." },
  { mode: "adjust", title: "Con ajustes", hint: "Se divide por igual, y a quien le toca más o menos le sumas o le restas." },
];

export const splitTitle = (mode: SplitMode) => SPLIT_MODES.find((m) => m.mode === mode)!.title;

/**
 * Who takes part, in order (the pesos that do not divide go to the first), and the number of each:
 * equal: 0; exact: pesos; percent and shares: hundredths (33,33 % is 3333); adjust: pesos, signed.
 */
export interface Split {
  mode: SplitMode;
  parts: { id: string; value: number }[];
}

export type Share = { member_id: string; amount: number };
export type SplitResult = { ok: true; shares: Share[] } | { ok: false; error: string };

const WHOLE_PERCENT = 10_000;
const MAX = 9_999_999_999_999;

/** A split from a form or the database, or null when it is not one. */
export function parseSplit(raw: unknown): Split | null {
  if (!raw || typeof raw !== "object") return null;
  const { mode, parts } = raw as { mode?: unknown; parts?: unknown };
  const known = SPLIT_MODES.find((m) => m.mode === mode)?.mode;
  if (!known || !Array.isArray(parts) || parts.length === 0 || parts.length > 30) return null;
  const clean: Split["parts"] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") return null;
    const { id, value } = part as { id?: unknown; value?: unknown };
    if (typeof id !== "string" || !id || clean.some((p) => p.id === id)) return null;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || Math.abs(value) > MAX) return null;
    if (known !== "adjust" && value < 0) return null;
    clean.push({ id, value });
  }
  return { mode: known, parts: clean };
}

/** Whole pesos in proportion to the weights: the largest remainders get the pesos that are left. */
function byWeight(amount: number, parts: Split["parts"]): Share[] {
  // BigInt: thirteen digits of pesos times the weight does not fit in a number exactly.
  const total = BigInt(parts.reduce((sum, p) => sum + p.value, 0));
  const rows = parts.map(({ id, value }, at) => {
    const product = BigInt(amount) * BigInt(value);
    return { id, at, amount: Number(product / total), rest: product % total };
  });
  let left = amount - rows.reduce((sum, r) => sum + r.amount, 0);
  for (const row of [...rows].sort((a, b) => (a.rest === b.rest ? a.at - b.at : a.rest > b.rest ? -1 : 1))) {
    if (left <= 0) break;
    row.amount += 1;
    left -= 1;
  }
  return rows.map((r) => ({ member_id: r.id, amount: r.amount }));
}

/** What each person pays, always adding up to the amount, or why it cannot be. */
export function computeShares(amount: number, { mode, parts }: Split): SplitResult {
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, error: "Escribe cuánto fue." };
  if (parts.length === 0) return { ok: false, error: "Elige entre quiénes se divide." };
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const ids = parts.map((p) => p.id);

  let shares: Share[];
  if (mode === "equal") {
    shares = splitEqual(amount, ids);
  } else if (mode === "adjust") {
    const base = amount - total;
    // Minus more than the total leaves nothing to divide: someone would end below zero.
    if (base < 0) return { ok: false, error: "Los ajustes superan el total." };
    const equal = new Map(splitEqual(base, ids).map((s) => [s.member_id, s.amount]));
    shares = parts.map((p) => ({ member_id: p.id, amount: (equal.get(p.id) ?? 0) + p.value }));
    if (shares.some((s) => s.amount < 0)) return { ok: false, error: "Un ajuste deja a alguien por debajo de cero." };
  } else {
    if (parts.some((p) => p.value < 0)) return { ok: false, error: "Los valores no pueden ser negativos." };
    if (mode === "exact") {
      if (total !== amount) return { ok: false, error: "Las partes deben sumar el total." };
      shares = parts.map((p) => ({ member_id: p.id, amount: p.value }));
    } else {
      if (mode === "percent" && total !== WHOLE_PERCENT) return { ok: false, error: "Los porcentajes deben sumar 100 %." };
      if (total === 0) return { ok: false, error: "Pon al menos una parte." };
      shares = byWeight(amount, parts);
    }
  }
  return { ok: true, shares: shares.filter((s) => s.amount > 0) };
}

/**
 * How to open an expense to edit it: as it was made if that still gives its pesos (it may have
 * been changed by another path, or be older than the five ways); else as equal parts or exact amounts.
 */
export function splitOf(amount: number, shares: Record<string, number>, saved: unknown, members: string[]): Split {
  const split = parseSplit(saved);
  if (split && split.parts.every((p) => members.includes(p.id))) {
    const result = computeShares(amount, split);
    if (result.ok && result.shares.length === Object.keys(shares).length && result.shares.every((s) => shares[s.member_id] === s.amount)) return split;
  }
  // Those with the extra peso first, so saving again gives it to the same people.
  const ids = members.filter((id) => shares[id] > 0).sort((a, b) => shares[b] - shares[a]);
  const equal = splitEqual(amount, ids);
  if (equal.length === ids.length && equal.every((s) => shares[s.member_id] === s.amount)) return { mode: "equal", parts: ids.map((id) => ({ id, value: 0 })) };
  return { mode: "exact", parts: ids.map((id) => ({ id, value: shares[id] })) };
}

export interface QuickSplit {
  key: "i-paid-half" | "i-am-owed-all" | "other-paid-half" | "other-is-owed-all";
  paidBy: string;
  split: Split;
}

/** Between two: the four usual answers to «¿cómo se dividió?». */
export function quickSplits(me: string, other: string): QuickSplit[] {
  const among = (...ids: string[]): Split => ({ mode: "equal", parts: ids.map((id) => ({ id, value: 0 })) });
  return [
    { key: "i-paid-half", paidBy: me, split: among(me, other) },
    { key: "i-am-owed-all", paidBy: me, split: among(other) },
    { key: "other-paid-half", paidBy: other, split: among(me, other) },
    { key: "other-is-owed-all", paidBy: other, split: among(me) },
  ];
}

/** The quick answer that an expense is, if it is one. */
export function matchingQuick(options: QuickSplit[], paidBy: string, split: Split): QuickSplit | undefined {
  if (split.mode !== "equal") return undefined;
  const who = (s: Split) => s.parts.map((p) => p.id).sort().join();
  return options.find((o) => o.paidBy === paidBy && who(o.split) === who(split));
}

/** What an expense leaves for one person: above zero they are owed, below they owe. */
export function outcome(amount: number, paidBy: string, shares: Share[], me: string): number {
  const own = shares.find((s) => s.member_id === me)?.amount ?? 0;
  return (paidBy === me ? amount : 0) - own;
}

/** "33,33" or "2" as hundredths; null when it is not a number with up to two decimals. */
export function parseHundredths(raw: string): number | null {
  const clean = raw.trim().replace(",", ".");
  if (!clean) return 0;
  if (!/^\d{1,5}(\.\d{0,2})?$|^\.\d{1,2}$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** 3333 as "33,33", 200 as "2". */
export const formatHundredths = (value: number) => String(value / 100).replace(".", ",");
