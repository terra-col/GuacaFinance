// Pagos de la casa. A house is a group of Compartidos; what is here is its receipts, who paid them,
// and which of them are one person's to count. Pure, so it is tested.
//
// The rule that keeps anything from counting twice: a pending receipt is an obligation of its
// responsible alone; once paid, of each payer for what they paid.
import { byDue, todayInBogota, type ChecklistItem } from "./finance.ts";
import { assign, datesIn, type Every, type Schedule } from "./recurrence.ts";
import { memberOf, type SharedData, type SharedGroup } from "./shared.ts";

export interface HouseBill {
  id: string;
  group_id: string;
  name: string;
  amount: number | null;
  category: string | null;
  due_day: number;
  every: Every;
  starts_on: string | null;
  /** The usual responsible: the member whose list and plan it is in. */
  responsible: string | null;
  /** Whether paying it proposes dividing it. */
  split: boolean;
  created_at: string;
  ended_month: string | null;
}

export interface HousePayment {
  id: string;
  bill_id: string;
  group_id: string;
  for_month: string;
  for_date: string | null;
  paid_by: string;
  amount: number;
  occurred_on: string;
  /** With it the receipt is paid; otherwise it is one part. */
  settles: boolean;
  /** Divided: the shared expense it is. */
  entry_id: string | null;
  created_by: string | null;
  created_at: string;
}

/** One's own movement that is the money of a payment. */
export interface HouseLink {
  tx_id: string;
  payment_id: string;
}

export interface HouseSkip {
  id: string;
  bill_id: string;
  group_id: string;
  for_month: string;
  for_date: string | null;
  note: string | null;
}

export interface HouseData {
  /** Whether it exists in this database (migration 0025). */
  ready: boolean;
  bills: HouseBill[];
  payments: HousePayment[];
  links: HouseLink[];
  skips: HouseSkip[];
}

export const NO_HOUSE: HouseData = { ready: false, bills: [], payments: [], links: [], skips: [] };

export interface HousePaid {
  id: string;
  by: string;
  who: string;
  byMe: boolean;
  amount: number;
  on: string;
  settles: boolean;
  entry: string | null;
  /** The person has it as a movement of their own. */
  recorded: boolean;
  /** Whoever wrote it down or paid, while the payer is still in the house. */
  canEdit: boolean;
}

/** A receipt in one month (or on one of its dates), as the person sees it. */
export interface HouseReceipt {
  group: string;
  groupName: string;
  bill: string;
  name: string;
  amount: number | null;
  split: boolean;
  every: Every;
  month: string;
  /** The date it ticks; null for what is monthly. */
  date: string | null;
  due: string;
  responsible: string | null;
  responsibleName: string | null;
  /** The person's place in the house. */
  me: string;
  /** Who can be the payer. */
  members: { id: string; name: string }[];
  payments: HousePaid[];
  settled: boolean;
  total: number;
  /** What is left of the amount; null when it varies. */
  left: number | null;
  skip: { id: string; note: string | null } | null;
  overdue: boolean;
  /** False for a loose payment of a schedule that changed: it can only be read. */
  payable: boolean;
}

export const houseBillSchedule = (bill: Pick<HouseBill, "every" | "due_day" | "starts_on">): Schedule => ({ every: bill.every, day: bill.due_day, start: bill.starts_on });

/** The houses the person is in, the newest first. */
export const housesOf = (shared: SharedData): SharedGroup[] => shared.groups.filter((g) => g.house);

/** A house's receipts in a month, by due date. */
export function houseMonth(house: HouseData, shared: SharedData, userId: string, groupId: string, month: string, today: string): HouseReceipt[] {
  const group = shared.groups.find((g) => g.id === groupId && g.house);
  const me = group && memberOf(groupId, shared, userId);
  if (!group || !me) return [];
  const all = shared.members.filter((m) => m.group_id === groupId);
  const member = new Map(all.map((m) => [m.id, m]));
  const members = all.filter((m) => !m.removed_at).map(({ id, name }) => ({ id, name }));
  const mine = new Set(house.links.map((l) => l.payment_id));
  const mineShared = new Set(shared.links.map((l) => l.entry_id));

  const out: HouseReceipt[] = [];
  for (const bill of house.bills) {
    if (bill.group_id !== groupId) continue;
    // Newest first, like every list of movements.
    const payments = house.payments
      .filter((p) => p.bill_id === bill.id && p.for_month === month)
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at));
    // Before it was created, and from the month it ended, only what was paid.
    const active = month >= todayInBogota(new Date(bill.created_at)).slice(0, 7) && !(bill.ended_month && month >= bill.ended_month);
    const monthly = bill.every === "monthly";
    const schedule = houseBillSchedule(bill);
    const dates = active || payments.length ? datesIn(schedule, month) : [];
    const slots = monthly ? (dates.length || payments.length ? [{ date: null, payments }] : []) : assign(dates, payments);

    for (const slot of slots) {
      const settled = slot.payments.some((p) => p.settles);
      if (!active && slot.payments.length === 0) continue;
      const due = (monthly ? dates[0] : slot.date) ?? slot.payments[0].occurred_on;
      const found = settled ? undefined : house.skips.find((s) => s.bill_id === bill.id && s.for_month === month && s.for_date === slot.date);
      const total = slot.payments.reduce((sum, p) => sum + p.amount, 0);
      const responsible = bill.responsible ? member.get(bill.responsible) : undefined;
      out.push({
        group: groupId,
        groupName: group.name,
        bill: bill.id,
        name: bill.name,
        amount: bill.amount,
        split: bill.split,
        every: bill.every,
        month,
        date: slot.date,
        due,
        responsible: responsible && !responsible.removed_at ? responsible.id : null,
        responsibleName: responsible && !responsible.removed_at ? responsible.name : null,
        me: me.id,
        members,
        payments: [...slot.payments].reverse().map((p) => ({
          id: p.id,
          by: p.paid_by,
          who: member.get(p.paid_by)?.name ?? "Alguien",
          byMe: p.paid_by === me.id,
          amount: p.amount,
          on: p.occurred_on,
          settles: p.settles,
          entry: p.entry_id,
          recorded: p.entry_id ? mineShared.has(p.entry_id) : mine.has(p.id),
          canEdit: !member.get(p.paid_by)?.removed_at && (p.created_by === userId || p.paid_by === me.id),
        })),
        settled,
        total,
        left: bill.amount === null ? null : Math.max(0, bill.amount - total),
        skip: found ? { id: found.id, note: found.note } : null,
        overdue: active && !settled && !found && due < today,
        payable: active && (monthly || slot.date !== null),
      });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name, "es"));
}

/**
 * A receipt as a row of the person's own list, or null when it is none of theirs: theirs is what
 * they are responsible for, and what they paid.
 */
export function ownRow(receipt: HouseReceipt): ChecklistItem | null {
  const responsible = receipt.responsible === receipt.me;
  const own = receipt.payments.filter((p) => p.byMe);
  if (!responsible && own.length === 0) return null;
  // Someone who only put a part is done with it; the rest waits for the responsible.
  const paid = receipt.settled || !responsible;
  return {
    type: "house",
    id: receipt.bill,
    name: receipt.name,
    due: receipt.due,
    every: receipt.every === "monthly" ? undefined : receipt.every,
    forDate: receipt.date ?? undefined,
    // Pending: what is left. What one already put of it is in paidAmount.
    expected: paid ? receipt.amount : receipt.left || null,
    paid,
    paidAmount: own.reduce((sum, p) => sum + p.amount, 0),
    paidOn: own.at(-1)?.on ?? null,
    overdue: !paid && receipt.overdue,
    skipped: !paid && receipt.skip ? { id: receipt.skip.id, item_type: "bill", item_id: receipt.bill, month: receipt.month, note: receipt.skip.note } : null,
    quick: null,
    house: receipt,
  };
}

/** The house receipts in the person's own list: what their plan, calendar and Inicio count. */
export function houseChecklist(house: HouseData, shared: SharedData, userId: string, month: string, today: string): ChecklistItem[] {
  return housesOf(shared)
    .flatMap((g) => houseMonth(house, shared, userId, g.id, month, today))
    .flatMap((receipt) => ownRow(receipt) ?? [])
    .sort(byDue);
}

export interface HouseSummary {
  paid: number;
  of: number;
  /** The first one waiting that is one's own. */
  next: HouseReceipt | null;
  /** How many more of one's own wait after it. */
  more: number;
}

/** A house in one line, for its card in Pagos. */
export function houseSummary(receipts: HouseReceipt[]): HouseSummary {
  const counted = receipts.filter((r) => !r.skip);
  const waiting = counted.filter((r) => !r.settled && r.responsible === r.me);
  return { paid: counted.filter((r) => r.settled).length, of: counted.length, next: waiting[0] ?? null, more: Math.max(0, new Set(waiting.map((r) => r.bill)).size - 1) };
}
