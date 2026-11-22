// People to divide with: a name and a phone from one's own address book. The number only points at
// whom to send the invitation; it never looks an account up (phones are not verified).
import { normalizePhone } from "./phone.ts";
import type { SharedData } from "./shared.ts";

/**
 * A Colombian mobile in any usual writing, or a number from abroad written with its country code
 * (+34…, 0034…); null when empty, "invalid" otherwise.
 */
export function contactPhone(raw: string): string | null | "invalid" {
  const colombian = normalizePhone(raw);
  if (colombian !== "invalid") return colombian;
  const compact = raw.replace(/[^\d+]/g, "").replace(/^00/, "+");
  // With +57 it had to be a mobile: landlines do not get WhatsApp invitations.
  if (compact.startsWith("+57")) return "invalid";
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : "invalid";
}

/** What the phone's contact picker gives, as a person: the first number that can get a message, a mobile first. */
export function fromContact({ name, tel }: { name?: string[]; tel?: string[] }): { name: string; phone: string } {
  const numbers = (tel ?? []).map(contactPhone).filter((p): p is string => Boolean(p) && p !== "invalid");
  const phone = numbers.find((p) => p.startsWith("+573")) ?? numbers[0] ?? "";
  return { name: (name?.find((n) => n.trim()) ?? phone).replace(/\s+/g, " ").trim().slice(0, 60), phone };
}

/** The chat with that number, the invitation already written. */
export const whatsappLink = (phone: string, message: string) => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;

/** Someone the person already shares a group with. */
export interface Known {
  /** Their place in one of those groups: what an invitation inside Guaca points at. */
  member: string;
  name: string;
  phone: string;
  /** null: no account yet, so they get a link. */
  userId: string | null;
}

/**
 * The person's own list of people, from their groups: once each, by account, else by phone, else
 * by name. A phone whose owner accepted once stands for that account.
 */
export function knownPeople(data: SharedData, me: string): Known[] {
  const accountOfPhone = new Map<string, string>();
  for (const m of data.members) if (m.phone && m.user_id && m.user_id !== me) accountOfPhone.set(m.phone, m.user_id);
  const people = new Map<string, Known>();
  for (const m of data.members) {
    if (m.user_id === me) continue;
    const userId = m.user_id ?? (m.phone ? (accountOfPhone.get(m.phone) ?? null) : null);
    const key = userId ?? m.phone ?? `name:${m.name.toLocaleLowerCase("es")}`;
    const seen = people.get(key);
    // The joined place is the one an invitation can point at.
    const member = !seen || (m.user_id && m.user_id === userId) ? m.id : seen.member;
    const named = !seen || (!seen.phone && m.phone);
    people.set(key, { member, name: named ? m.name : seen.name, phone: seen?.phone || m.phone || "", userId });
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** The known person with an account behind a typed or picked number. */
export function knownByPhone(known: Known[], raw: string): Known | undefined {
  const phone = contactPhone(raw);
  return phone && phone !== "invalid" ? known.find((k) => k.userId && k.phone === phone) : undefined;
}
