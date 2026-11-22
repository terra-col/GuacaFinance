// The Pagos calendar: the month's checklist (bills, card and loan payments,
// incomes) laid out on a Monday-first grid. Pure, so it is tested.
import type { IncomeItem } from "./budget.ts";
import { daysInMonth, type ChecklistItem } from "./finance.ts";

export type EntryStatus = "paid" | "pending" | "overdue" | "skipped";

export interface CalendarEntry {
  date: string;
  type: "bill" | "debt" | "income" | "goal" | "house";
  id: string;
  name: string;
  /** Expected amount, or what was paid/received once it was; null when it varies. */
  amount: number | null;
  status: EntryStatus;
}

/** The month as weeks of seven days, Monday first; days outside the month are null. */
export function calendarWeeks(month: string): (string | null)[][] {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const days = daysInMonth(year, m);
  // getUTCDay: 0 = Sunday. Shift so Monday is the first column.
  const lead = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/**
 * Every dated item of the month as a calendar entry, by date. Debts with no
 * payment day have no place on the grid: they come back in `undated`.
 */
export function calendarEntries(items: ChecklistItem[], incomes: IncomeItem[]): { byDate: Record<string, CalendarEntry[]>; undated: CalendarEntry[] } {
  const all: (Omit<CalendarEntry, "date"> & { date: string | null })[] = [
    ...items.map((i) => ({
      date: i.due,
      type: i.type,
      id: i.id,
      name: i.name,
      amount: i.paid ? (i.house?.total ?? i.paidAmount) : i.expected,
      status: (i.paid ? "paid" : i.skipped ? "skipped" : i.overdue ? "overdue" : "pending") as EntryStatus,
    })),
    ...incomes.map((i) => ({
      date: i.due,
      type: "income" as const,
      id: i.id,
      name: i.name,
      amount: i.received ? i.receivedAmount : i.expected,
      status: (i.received ? "paid" : i.skipped ? "skipped" : i.late ? "overdue" : "pending") as EntryStatus,
    })),
  ];
  const byDate: Record<string, CalendarEntry[]> = {};
  const undated: CalendarEntry[] = [];
  for (const entry of all) {
    if (!entry.date) {
      undated.push({ ...entry, date: "" });
      continue;
    }
    (byDate[entry.date] ??= []).push({ ...entry, date: entry.date });
  }
  // Within a day: what goes out first, then what comes in; by name.
  for (const list of Object.values(byDate)) list.sort((a, b) => Number(a.type === "income") - Number(b.type === "income") || a.name.localeCompare(b.name));
  return { byDate, undated };
}

/** What is still to pay and to receive in the month (skipped and settled items count zero). */
export function calendarTotals(entries: CalendarEntry[]) {
  const open = entries.filter((e) => e.status === "pending" || e.status === "overdue");
  return {
    toPay: open.filter((e) => e.type !== "income").reduce((sum, e) => sum + (e.amount ?? 0), 0),
    toReceive: open.filter((e) => e.type === "income").reduce((sum, e) => sum + (e.amount ?? 0), 0),
    unknown: open.filter((e) => e.type !== "income" && e.amount === null).length,
  };
}
