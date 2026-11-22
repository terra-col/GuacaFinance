// How often a fixed payment or a goal's saving repeats, and which date each payment ticks.
// Pure and free of imports, so finance.ts can build on it.

export type Every = "daily" | "every2" | "biweekly" | "monthly" | "bimonthly" | "quarterly" | "semiannual";

export const EVERY: { value: Every; label: string }[] = [
  { value: "monthly", label: "Mensual" },
  { value: "daily", label: "Cada día" },
  { value: "every2", label: "Cada 2 días" },
  { value: "biweekly", label: "Quincenal" },
  { value: "bimonthly", label: "Bimestral (cada 2 meses)" },
  { value: "quarterly", label: "Trimestral (cada 3 meses)" },
  { value: "semiannual", label: "Semestral (cada 6 meses)" },
];

const SHORT: Record<Every, string> = {
  monthly: "Mensual",
  daily: "Diario",
  every2: "Cada 2 días",
  biweekly: "Quincenal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  semiannual: "Semestral",
};
export const everyShort = (every: Every) => SHORT[every];

/** A 'daily', 'every2'… from a form or the database; null for anything else. */
export const parseEvery = (raw: string): Every | null => EVERY.find((e) => e.value === raw)?.value ?? null;

/** Those that repeat several times a week: the list folds what is further ahead. */
export const isFrequent = (every: Every | undefined) => every === "daily" || every === "every2";

/** Those set by a date (from when, or the next one) rather than by a day of the month. */
export const needsDate = (every: Every) => every !== "monthly" && every !== "biweekly";

export interface Schedule {
  every: Every;
  /** Monthly: the day. Quincenal: the first of its two days, or 31 for «15 y último día». */
  day: number;
  /** From when it applies; also what it counts from, when set by a date. */
  start: string | null;
}

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const onDay = (month: string, day: number) => `${month}-${pad(Math.min(day, lastDay(month)))}`;
const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
const monthOf = (index: number) => `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;

const STEP_MONTHS: Partial<Record<Every, number>> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6 };

/** The two days of a quincena: 5 is [5, 20], 15 is [15, 30], 31 is [15, 31] (the last day). */
export function quincenaDays(day: number): [number, number] {
  if (day >= 31) return [15, 31];
  const first = day > 15 ? day - 15 : day;
  return [first, first + 15];
}

/** Any day of the month as the day a quincena is set by: the 30 becomes «15 y 30». */
export const quincenaFrom = (day: number) => (day >= 31 ? 31 : quincenaDays(day)[0]);

export const quincenaLabel = (day: number) => (day >= 31 ? "15 y último día" : quincenaDays(day).join(" y "));

/** Every choice of days for a quincena, the usual ones for pay in Colombia first. */
export const QUINCENAS = [15, 31, ...Array.from({ length: 14 }, (_, i) => i + 1)];

/** Where a quincena that starts today starts: this half of the month, not the one already over. */
export const halfStart = (today: string) => `${today.slice(0, 7)}-${Number(today.slice(8)) > 15 ? "16" : "01"}`;

/** The dates it falls on in a 'YYYY-MM' month, in order. */
export function datesIn({ every, day, start }: Schedule, month: string): string[] {
  if (every === "monthly") return start && month < start.slice(0, 7) ? [] : [onDay(month, day)];
  if (!start || month < start.slice(0, 7)) return [];

  if (every === "biweekly") {
    const dates = quincenaDays(day).map((d) => onDay(month, d));
    return [...new Set(dates)].filter((d) => d >= start);
  }
  const months = STEP_MONTHS[every];
  if (months) {
    if ((monthIndex(month) - monthIndex(start)) % months !== 0) return [];
    // The anchor's own day: the 31st stays the last day, also after a February.
    return [onDay(month, Number(start.slice(8)))];
  }
  const step = every === "every2" ? 2 : 1;
  const out: string[] = [];
  for (let d = 1; d <= lastDay(month); d++) {
    const date = onDay(month, d);
    const since = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);
    if (since >= 0 && since % step === 0) out.push(date);
  }
  return out;
}

/** The next `count` dates on or after `from`. */
export function nextDates(schedule: Schedule, from: string, count: number): string[] {
  const out: string[] = [];
  const begin = monthIndex(schedule.start && schedule.start > from ? schedule.start : from);
  // Six months is the longest wait, so this always reaches `count`.
  for (let i = begin; out.length < count && i <= begin + count * 6 + 12; i++) {
    for (const date of datesIn(schedule, monthOf(i))) if (date >= from && out.length < count) out.push(date);
  }
  return out;
}

export interface Slot<T> {
  /** null: payments of a month with no date of its own (the schedule changed after they were made). */
  date: string | null;
  payments: T[];
}

/**
 * Which date each payment of the month ticks. One marked on a date goes to that date. The others
 * (made before the schedule changed, or recorded by hand) take the earliest date still open,
 * oldest payment first, so changing the schedule never loses nor repeats a payment.
 * `payments` come newest first, like every list of movements.
 */
export function assign<T extends { for_date?: string | null }>(dates: string[], payments: T[]): Slot<T>[] {
  if (dates.length === 0) return payments.length ? [{ date: null, payments }] : [];
  const slots = dates.map((date) => ({ date, payments: [] as T[] }));
  const loose: T[] = [];
  for (const payment of payments) {
    const slot = slots.find((s) => s.date === payment.for_date);
    if (slot) slot.payments.push(payment);
    else loose.push(payment);
  }
  for (const payment of loose.reverse()) (slots.find((s) => s.payments.length === 0) ?? slots[slots.length - 1]).payments.unshift(payment);
  return slots;
}

/** How many times a month it happens on average, for «al mes» figures. */
export function timesPerMonth(every: Every): number {
  if (every === "daily") return 365.25 / 12;
  if (every === "every2") return 365.25 / 24;
  if (every === "biweekly") return 2;
  return 1 / STEP_MONTHS[every]!;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «cada mes, día 5», «quincenal, 15 y 30», «cada día», «semestral: 15 ene y 15 jul». */
export function cadenceText({ every, day, start }: Schedule): string {
  if (every === "monthly") return `cada mes, día ${day}`;
  if (every === "biweekly") return `quincenal, ${quincenaLabel(day)}`;
  if (every === "daily") return "cada día";
  if (every === "every2") return "cada 2 días";
  const label = SHORT[every].toLowerCase();
  if (!start) return label;
  const anchor = Number(start.slice(5, 7)) - 1;
  const d = Number(start.slice(8));
  if (every === "semiannual") return `${label}: ${d} ${MONTHS[anchor]} y ${d} ${MONTHS[(anchor + 6) % 12]}`;
  return `${label}, día ${d}`;
}
