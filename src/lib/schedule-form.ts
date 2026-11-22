import { todayInBogota } from "./finance";
import { needsDate, parseEvery, quincenaFrom, type Every } from "./recurrence";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The periodicity a form asks for, as day and start. A quincena keeps its start while it stays a
 * quincena; otherwise it starts where `quincenaStart` says.
 */
export function readSchedule(
  form: FormData,
  names: { every: string; day: string; start: string },
  before: { every?: Every; start?: string | null },
  quincenaStart: string,
): { error: string } | { every: Every; day: number; start: string | null } {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  // No field: before migration 0017, or a screen that does not ask. It stays as it was.
  const asked = text(names.every);
  const every = asked ? parseEvery(asked) : (before.every ?? "monthly");
  if (!every) return { error: "Elige cada cuánto se repite." };
  if (needsDate(every)) {
    const start = text(names.start);
    if (!DATE.test(start) || Number.isNaN(Date.parse(start))) return { error: "Elige la fecha." };
    return { every, day: Number(start.slice(8)), start };
  }
  const day = Number(text(names.day));
  if (!Number.isInteger(day) || day < 1 || day > 31) return { error: "El día debe estar entre 1 y 31." };
  if (every === "monthly") {
    // Back to monthly: from this month, so past ones are not shown as unpaid.
    const start = before.every && before.every !== "monthly" ? `${todayInBogota().slice(0, 7)}-01` : (before.start ?? null);
    return { every, day, start };
  }
  return { every, day: quincenaFrom(day), start: before.every === every && before.start ? before.start : quincenaStart };
}
