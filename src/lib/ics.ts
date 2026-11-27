// Calendar feed (iCalendar) with the upcoming payment dates, so any calendar
// app that subscribes to it shows them and can alert before each one.
import { addDays, dueDates, formatCOP } from "./finance.ts";
import { EVERY, isFrequent, nextDates, timesPerMonth, type Every } from "./recurrence.ts";

export interface DueItem {
  id: string;
  name: string;
  due_day: number;
  monthly_payment: number | null;
  every?: Every;
  starts_on?: string | null;
  /** A one-time payment (migration 0028): only that month. */
  once_month?: string | null;
}

const escapeText = (text: string) => text.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
const compact = (date: string) => date.replace(/-/g, "");

export function buildCalendar(items: DueItem[], today: string, monthsAhead = 3): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Finanzas//Pagos//ES", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Pagos"];
  for (const item of items) {
    const every = item.every ?? "monthly";
    // What repeats every few days only shows two weeks ahead, and warns only that day.
    const frequent = isFrequent(every);
    const named = EVERY.some((e) => e.value === every);
    // The ones of migration 0017 show as always; any other, those of the months ahead or the next one.
    const count = frequent ? 14 : every === "biweekly" ? monthsAhead * 2 : named ? monthsAhead : Math.max(1, Math.ceil(monthsAhead * timesPerMonth(every)));
    const once = item.once_month ? dueDates(item.due_day, `${item.once_month}-01`, 1).filter((d) => d >= today) : null;
    const dates = once ? once : every === "monthly" ? dueDates(item.due_day, today, monthsAhead) : nextDates({ every, day: item.due_day, start: item.starts_on ?? null }, today, count);
    for (const date of dates) {
      const summary = `Pagar ${item.name}${item.monthly_payment ? ` · cuota ${formatCOP(item.monthly_payment)}` : ""}`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${item.id}-${date}@finanzas`,
        `DTSTAMP:${compact(today)}T000000Z`,
        `DTSTART;VALUE=DATE:${compact(date)}`,
        `DTEND;VALUE=DATE:${compact(addDays(date, 1))}`,
        `SUMMARY:${escapeText(summary)}`,
        "TRANSP:TRANSPARENT",
        // Two days before at 9:00, and the same day at 8:00 (offsets from midnight).
        ...(frequent ? [] : ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(summary)}`, "TRIGGER:-PT39H", "END:VALARM"]),
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(summary)}`, "TRIGGER:PT8H", "END:VALARM",
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
