// Gastos compartidos: who owes whom, and what of it is one's own spending. Pure, so it is tested.
// The rule: money that left an account is a balance matter; what counts as spending is one's own
// share. Settling up moves money and is neither spending nor income.
import type { Tx } from "./finance.ts";

export interface SharedGroup {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface SharedMember {
  id: string;
  group_id: string;
  /** null: a friend without an account (or who has not joined yet). */
  user_id: string | null;
  /** As the person has them in their contacts; else the group's name for them. */
  name: string;
  /** From the person's own contacts: nobody else sees it. */
  phone?: string | null;
}

export interface SharedRequest {
  member_id: string;
  group_id: string;
  user_id: string;
}

export interface SharedEntry {
  id: string;
  group_id: string;
  kind: "expense" | "settlement";
  description: string;
  category: string | null;
  amount: number;
  paid_by: string;
  occurred_on: string;
  created_by: string | null;
}

export interface SharedShare {
  entry_id: string;
  group_id: string;
  member_id: string;
  amount: number;
}

/** One's own movement that is the money of a shared entry. */
export interface SharedLink {
  tx_id: string;
  entry_id: string;
  /** false: a movement the person already had and divided. */
  created_tx?: boolean;
}

export interface SharedData {
  groups: SharedGroup[];
  members: SharedMember[];
  entries: SharedEntry[];
  shares: SharedShare[];
  links: SharedLink[];
  /** Invitations inside Guaca: to the person's groups, and to the person. */
  requests?: SharedRequest[];
  /** Whether groups, people and expenses can be edited (migration 0020). */
  editable?: boolean;
}

export const NO_SHARED: SharedData = { groups: [], members: [], entries: [], shares: [], links: [] };

/** Equal parts in whole pesos: the pesos that do not divide go one each to the first people. */
export function splitEqual(amount: number, ids: string[]): { member_id: string; amount: number }[] {
  if (ids.length === 0) return [];
  const base = Math.floor(amount / ids.length);
  const left = amount - base * ids.length;
  return ids.map((member_id, i) => ({ member_id, amount: base + (i < left ? 1 : 0) })).filter((share) => share.amount > 0);
}

/** Each member's balance in a group: above zero they are owed, below they owe. They always add up to zero. */
export function groupNets(groupId: string, { members, entries, shares }: SharedData): Map<string, number> {
  const nets = new Map(members.filter((m) => m.group_id === groupId).map((m) => [m.id, 0]));
  for (const e of entries) if (e.group_id === groupId) nets.set(e.paid_by, (nets.get(e.paid_by) ?? 0) + e.amount);
  for (const s of shares) if (s.group_id === groupId) nets.set(s.member_id, (nets.get(s.member_id) ?? 0) - s.amount);
  return nets;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/** Who pays whom to leave everyone at zero, in at most one payment fewer than the people. */
export function settleUp(nets: Map<string, number>): Transfer[] {
  const largest = (a: { id: string; left: number }, b: { id: string; left: number }) => b.left - a.left || a.id.localeCompare(b.id);
  const owe = [...nets].filter(([, net]) => net < 0).map(([id, net]) => ({ id, left: -net })).sort(largest);
  const owed = [...nets].filter(([, net]) => net > 0).map(([id, net]) => ({ id, left: net })).sort(largest);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < owe.length && j < owed.length) {
    const amount = Math.min(owe[i].left, owed[j].left);
    out.push({ from: owe[i].id, to: owed[j].id, amount });
    owe[i].left -= amount;
    owed[j].left -= amount;
    if (owe[i].left === 0) i += 1;
    if (owed[j].left === 0) j += 1;
  }
  return out;
}

/** The member a person is in a group. */
export const memberOf = (groupId: string, data: SharedData, userId: string) => data.members.find((m) => m.group_id === groupId && m.user_id === userId);

export interface Position {
  owedToMe: number;
  iOwe: number;
  /** One's balance in each group. */
  byGroup: Map<string, number>;
}

/** What others owe the person and what the person owes. One group never cancels another. */
export function myPosition(data: SharedData, userId: string): Position {
  const byGroup = new Map<string, number>();
  let owedToMe = 0;
  let iOwe = 0;
  for (const group of data.groups) {
    const me = memberOf(group.id, data, userId);
    if (!me) continue;
    const net = groupNets(group.id, data).get(me.id) ?? 0;
    byGroup.set(group.id, net);
    if (net > 0) owedToMe += net;
    else iOwe -= net;
  }
  return { owedToMe, iOwe, byGroup };
}

/**
 * The movements every «how much came in, how much was spent» total reads; balances keep reading
 * the real ones. Movements linked to a group leave, and one's share of each shared expense comes
 * in as spending, whoever paid it. A linked expense lends its share the category and date the
 * person gave that movement.
 */
export function flowTxs(txs: Tx[], data: SharedData, userId: string): Tx[] {
  if (data.entries.length === 0) return txs;
  const linked = new Set(data.links.map((l) => l.tx_id));
  const txOfEntry = new Map(data.links.map((l) => [l.entry_id, l.tx_id]));
  const txById = new Map(txs.map((t) => [t.id, t]));
  const mine = new Set(data.members.filter((m) => m.user_id === userId).map((m) => m.id));
  const myShare = new Map(data.shares.filter((s) => mine.has(s.member_id)).map((s) => [s.entry_id, s.amount]));

  const flows = txs.filter((t) => !linked.has(t.id));
  for (const entry of data.entries) {
    const amount = myShare.get(entry.id);
    if (entry.kind !== "expense" || !amount) continue;
    const own = txById.get(txOfEntry.get(entry.id) ?? "");
    flows.push({
      id: `shared-${entry.id}`,
      account_id: "",
      source_account_id: null,
      kind: "expense",
      amount,
      category: own ? own.category : entry.category,
      description: entry.description,
      occurred_on: own?.occurred_on ?? entry.occurred_on,
      source: "shared",
      bill_id: null,
    });
  }
  return flows;
}

/** How a linked movement reads in a list: the group it belongs to and how much of it is one's own. */
export interface SharedMark {
  groupId: string;
  kind: SharedEntry["kind"];
  mine: number;
}

export function sharedMarks(data: SharedData, userId: string): Record<string, SharedMark> {
  const mine = new Set(data.members.filter((m) => m.user_id === userId).map((m) => m.id));
  const entries = new Map(data.entries.map((e) => [e.id, e]));
  const myShare = new Map(data.shares.filter((s) => mine.has(s.member_id)).map((s) => [s.entry_id, s.amount]));
  const marks: Record<string, SharedMark> = {};
  for (const link of data.links) {
    const entry = entries.get(link.entry_id);
    if (entry) marks[link.tx_id] = { groupId: entry.group_id, kind: entry.kind, mine: entry.kind === "expense" ? (myShare.get(entry.id) ?? 0) : 0 };
  }
  return marks;
}

const INVITE_PATH = /^\/unirse\/[A-Za-z0-9_-]{32}$/;

/** Cookie with the invitation someone opened before signing in. */
export const INVITE_COOKIE = "guaca-invitacion";

/** The invitation's path when it is one, so signing in can return to it and to nowhere else. */
export const invitePath = (raw: string | null | undefined) => (raw && INVITE_PATH.test(raw) ? raw : null);
