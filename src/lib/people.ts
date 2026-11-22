// The person's people: each one once, with what is pending with them across their accounts between
// two and their groups. Pure, so it is tested.
import { groupNets, memberOf, settleUp, type SharedData, type SharedGroup } from "./shared.ts";

export interface PersonPlace {
  group: SharedGroup;
  /** Their place in that group. */
  member: string;
  /** Above zero they owe me; below, I owe them. */
  net: number;
}

export interface Person {
  /** One of their places: what stands for them in an address. Their joined one when there is one. */
  member: string;
  /** Every place of theirs in the groups still open. */
  members: string[];
  name: string;
  phone: string;
  userId: string | null;
  /** Whether they already entered one of those groups with their account. */
  joined: boolean;
  total: number;
  places: PersonPlace[];
  /** The account between the two. */
  direct: string | null;
}

/**
 * By account, else by phone, else by name. An account is also known by a pending invitation and by
 * a phone whose owner joined. In a group, what is pending with each is what «Para quedar al día» says.
 */
export function peopleWith(data: SharedData, me: string): Person[] {
  const accountOfPhone = new Map<string, string>();
  for (const m of data.members) if (m.phone && m.user_id && m.user_id !== me) accountOfPhone.set(m.phone, m.user_id);
  const invited = new Map(data.requests?.map((r) => [r.member_id, r.user_id]));

  const people = new Map<string, Person>();
  for (const group of data.groups) {
    const mine = memberOf(group.id, data, me);
    if (!mine) continue;
    const transfers = settleUp(groupNets(group.id, data));
    for (const m of data.members) {
      if (m.group_id !== group.id || m.id === mine.id) continue;
      const userId = m.user_id ?? invited.get(m.id) ?? (m.phone ? (accountOfPhone.get(m.phone) ?? null) : null);
      const key = userId ?? m.phone ?? `name:${m.name.trim().toLocaleLowerCase("es")}`;
      let person = people.get(key);
      if (!person) {
        person = { member: m.id, members: [], name: m.name, phone: m.phone ?? "", userId, joined: false, total: 0, places: [], direct: null };
        people.set(key, person);
      }
      if (m.user_id && !person.joined) {
        person.member = m.id;
        person.joined = true;
      }
      if (!person.phone && m.phone) {
        person.phone = m.phone;
        person.name = m.name;
      }
      let net = 0;
      for (const t of transfers) {
        if (t.from === m.id && t.to === mine.id) net += t.amount;
        if (t.from === mine.id && t.to === m.id) net -= t.amount;
      }
      person.members.push(m.id);
      person.total += net;
      person.places.push({ group, member: m.id, net });
      if (group.direct) person.direct ??= group.id;
    }
  }
  for (const person of people.values()) person.places.sort((a, b) => Number(Boolean(b.group.direct)) - Number(Boolean(a.group.direct)));
  // What is pending first, the largest on top.
  return [...people.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.name.localeCompare(b.name, "es"));
}

/** An account between two is called by the other person, as one has them. */
export function groupTitle(group: SharedGroup, data: SharedData, me: string): string {
  const other = group.direct ? data.members.find((m) => m.group_id === group.id && m.user_id !== me) : undefined;
  return other?.name ?? group.name;
}

/** Who to divide with, for «Registrar movimiento»: each person once, then the groups. */
export interface SplitTarget {
  key: string;
  kind: "person" | "group";
  name: string;
  /** null: their account between two is created when the movement is saved. */
  group: string | null;
  /** The person's place elsewhere, to create that account. */
  person: string | null;
  members: { id: string; name: string }[];
  me: string;
}

/** Stand for the two people of an account that is not created yet. */
export const PENDING_ME = "me";
export const PENDING_OTHER = "other";

export function splitTargets(data: SharedData, me: string, myName: string): SplitTarget[] {
  const inGroup = (group: string) => data.members.filter((m) => m.group_id === group).map(({ id, name }) => ({ id, name }));
  const people = peopleWith(data, me).map((p): SplitTarget => {
    const base = { key: `p:${p.member}`, kind: "person" as const, name: p.name, person: p.member };
    const mine = p.direct ? memberOf(p.direct, data, me) : undefined;
    if (p.direct && mine) return { ...base, group: p.direct, members: inGroup(p.direct), me: mine.id };
    return { ...base, group: null, members: [{ id: PENDING_ME, name: myName }, { id: PENDING_OTHER, name: p.name }], me: PENDING_ME };
  });
  const groups = data.groups.flatMap((g): SplitTarget[] => {
    const mine = memberOf(g.id, data, me);
    return g.direct || !mine ? [] : [{ key: `g:${g.id}`, kind: "group", name: g.name, group: g.id, person: null, members: inGroup(g.id), me: mine.id }];
  });
  return [...people, ...groups];
}
