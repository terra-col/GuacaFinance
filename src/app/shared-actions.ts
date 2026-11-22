"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { profileName } from "@/lib/brand";
import { contactPhone } from "@/lib/contacts";
import { parsePesos } from "@/lib/finance";
import { requestOrigin } from "@/lib/request-origin";
import { PENDING_ME, PENDING_OTHER, peopleWith, placesOf, splitTargets, type SplitTarget } from "@/lib/people";
import { INVITE_COOKIE, memberOf } from "@/lib/shared";
import { problem, readPeople, type PersonInput as Person } from "@/lib/shared-input";
import { loadShared } from "@/lib/shared-data";
import { computeShares, parseSplit } from "@/lib/split";
import { createClient } from "@/lib/supabase/server";

// Every write goes through a function of migration 0016, which checks who asks and what for.

export interface SharedResult {
  error?: string;
  id?: string;
  link?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function call(fn: string, args: Record<string, unknown>): Promise<SharedResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error: problem(error) };
  revalidatePath("/", "layout");
  return typeof data === "string" ? { id: data } : {};
}

export async function createGroup(form: FormData): Promise<SharedResult> {
  const read = readPeople(form);
  if ("error" in read) return read;
  const others = read.people.map((p) => p.name);
  const me = text(form, "me");
  if (!me) return { error: "Escribe tu nombre: así te verán en el grupo." };
  if (new Set([me, ...others].map((n) => n.toLocaleLowerCase("es"))).size !== others.length + 1) return { error: "Hay nombres repetidos: distínguelos con un apellido." };
  // With one person the group can simply carry their name.
  const name = text(form, "name") || (others.length === 1 ? `${me} y ${others[0]}`.slice(0, 60) : "");
  if (!name) return { error: "Ponle un nombre al grupo." };
  if (!form.has("phone")) return call("shared_create_group", { p_name: name, p_my_name: me, p_others: others }); // before migration 0020
  return call("shared_create_group_people", { p_name: name, p_my_name: me, p_people: read.people });
}

export async function addMember(form: FormData): Promise<SharedResult> {
  const group = text(form, "group");
  if (!form.has("person")) {
    // Before migration 0020: just a name.
    const name = text(form, "name");
    return name ? call("shared_add_member", { p_group: group, p_name: name }) : { error: "Escribe el nombre." };
  }
  const read = readPeople(form);
  if ("error" in read) return read;
  const [{ name, phone, known }] = read.people;
  return call("shared_add_person", { p_group: group, p_name: name, p_phone: phone, p_known: known });
}

export async function renameGroup(form: FormData): Promise<SharedResult> {
  const name = text(form, "name");
  if (!name) return { error: "Ponle un nombre al grupo." };
  return call("shared_rename_group", { p_group: text(form, "group"), p_name: name });
}

export async function editPerson(form: FormData): Promise<SharedResult> {
  const name = text(form, "name");
  if (!name) return { error: "Escribe el nombre." };
  const phone = contactPhone(text(form, "phone"));
  if (phone === "invalid") return { error: "Revisa el celular: 10 dígitos que empiecen por 3, o con + y el código del país." };
  return call("shared_edit_person", { p_member: text(form, "member"), p_name: name, p_phone: phone, p_known: text(form, "known") || null });
}

export async function answerRequest(form: FormData): Promise<SharedResult> {
  const result = await call("shared_respond", { p_member: text(form, "member"), p_accept: text(form, "accept") === "1" });
  if (result.error || !result.id) return result;
  // From here: redrawn, the invitation it was answered on is no longer there.
  redirect(`/compartidos/${result.id}`);
}

export async function removeMember(form: FormData): Promise<SharedResult> {
  return call("shared_remove_member", { p_member: text(form, "member") });
}

export async function deleteGroup(form: FormData): Promise<SharedResult> {
  const how = text(form, "how");
  const p_group = text(form, "group");
  // Without a «how» it is an empty group before migration 0023.
  const result = await (how ? call("shared_remove_group", { p_group, p_erase: how === "erase" }) : call("shared_delete_group", { p_group }));
  if (result.error) return result;
  // From here, so the deleted group's page is never drawn again.
  redirect(text(form, "back") === "/pagos" ? "/pagos" : "/compartidos");
}

/** A one-use link for one person's place; only its hash is kept. */
export async function inviteMember(form: FormData): Promise<SharedResult> {
  const token = randomBytes(24).toString("base64url");
  const result = await call("shared_invite", { p_member: text(form, "member"), p_hash: createHash("sha256").update(token).digest("hex") });
  return result.error ? result : { link: `${await requestOrigin()}/unirse/${token}` };
}

export async function joinGroup(form: FormData): Promise<SharedResult> {
  const result = await call("shared_join", { p_token: text(form, "token") });
  if (result.error) return result;
  (await cookies()).delete(INVITE_COOKIE);
  // From here: redrawn, the invitation's page would already say «ya se usó».
  redirect(`/compartidos/${result.id}`);
}

export async function saveSharedExpense(form: FormData): Promise<SharedResult> {
  const amount = parsePesos(text(form, "amount"));
  if (!amount) return { error: "Escribe cuánto fue." };
  const description = text(form, "description").slice(0, 120);
  if (!description) return { error: "Escribe qué fue." };
  const occurred_on = text(form, "occurred_on");
  if (!DATE.test(occurred_on)) return { error: "La fecha no es válida." };
  let split;
  try {
    split = parseSplit(JSON.parse(text(form, "split")));
  } catch {
    split = null;
  }
  if (!split) return { error: "Revisa cómo se divide." };
  // The pesos are worked out here, never taken from the page.
  const divided = computeShares(amount, split);
  if (!divided.ok) return { error: divided.error };
  const { shares } = divided;

  const entry = text(form, "entry");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shared_save_expense", {
    p_entry: entry || null,
    p_group: text(form, "group") || null,
    p_description: description,
    p_category: text(form, "category") || null,
    p_amount: amount,
    p_paid_by: text(form, "paid_by"),
    p_occurred_on: occurred_on,
    p_shares: shares,
    p_split: split,
    p_account: text(form, "account_id") || null,
    p_tx: text(form, "tx") || null,
  });
  if (!error) {
    revalidatePath("/", "layout");
    return { id: String(data) };
  }
  if (error.code !== "PGRST202") return { error: problem(error) };
  // Before migration 0021: the same pesos, without remembering how they were divided.
  if (entry) {
    return call("shared_update_entry", {
      p_entry: entry,
      p_description: description,
      p_category: text(form, "category") || null,
      p_amount: amount,
      p_paid_by: text(form, "paid_by"),
      p_occurred_on: occurred_on,
      p_shares: shares,
      p_account: text(form, "account_id") || null,
    });
  }
  return call("shared_add_entry", {
    p_group: text(form, "group"),
    p_kind: "expense",
    p_description: description,
    p_category: text(form, "category") || null,
    p_amount: amount,
    p_paid_by: text(form, "paid_by"),
    p_occurred_on: occurred_on,
    p_shares: shares,
    p_account: text(form, "account_id") || null,
    p_tx: text(form, "tx") || null,
  });
}

async function currentPerson() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { shared } = await loadShared(supabase, user.id);
  // The name of the profile; else the one they already go by in a group.
  const name = profileName(user) || shared.members.find((m) => m.user_id === user.id)?.name || "";
  return { supabase, user, shared, name };
}

/**
 * The account between two with someone: the one there is, or a new one. `member` is one of their
 * places (someone one already divides with); without it, a name and maybe a phone.
 */
async function openDirect(member: string, typed: Person | null): Promise<SharedResult> {
  const { shared, user, name } = await currentPerson();
  const same = (a: string, b: string) => a.trim().toLocaleLowerCase("es") === b.trim().toLocaleLowerCase("es");
  const person = peopleWith(shared, user.id, { deletedToo: true }).find((p) =>
    member ? p.members.includes(member) : typed?.phone ? p.phone === typed.phone : !p.phone && typed && same(p.name, typed.name),
  );
  if (member && !person && !typed) return { error: "Esa persona ya no está en tus grupos." };
  if (person?.direct) return { id: person.direct };
  if (!name) return { error: "Escribe tu nombre en Ajustes: así te verá la otra persona." };
  const other = person?.name ?? typed?.name ?? "";
  if (!other) return { error: "Escribe el nombre de la persona." };
  if (same(other, name)) return { error: "Tiene tu mismo nombre: distínguelos con un apellido." };
  return call("shared_create_direct", {
    p_my_name: name,
    p_name: other,
    p_phone: person?.phone || typed?.phone || null,
    p_known: person?.joined ? person.member : (typed?.known ?? null),
  });
}

export async function createDirect(form: FormData): Promise<SharedResult> {
  const member = text(form, "member");
  if (member) return openDirect(member, null);
  const read = readPeople(form);
  return "error" in read ? read : openDirect(read.people[0].known ?? "", read.people[0]);
}

/** Who one can divide with, asked when «Dividir con alguien» is tapped. */
export async function loadSplitTargets(): Promise<{ targets: SplitTarget[]; name: string; social: boolean }> {
  const { shared, user, name } = await currentPerson();
  const targets = splitTargets(shared, user.id, name || "Tú");
  // Before migration 0023 there are no accounts between two to create.
  return { targets: shared.social ? targets : targets.filter((t) => t.group), name: name || "Tú", social: Boolean(shared.social) };
}

/**
 * Divides a movement just recorded, with a group, a person, or someone new. The amount and the rest
 * are the movement's own: only with whom and how come from the page.
 */
export async function divideMovement(form: FormData): Promise<SharedResult> {
  let split;
  try {
    split = parseSplit(JSON.parse(text(form, "split")));
  } catch {
    split = null;
  }
  if (!split) return { error: "Revisa cómo se divide." };
  const { supabase } = await currentPerson();
  const { data: tx } = await supabase.from("transactions").select("id, amount, description, category, occurred_on").eq("id", text(form, "tx")).maybeSingle();
  if (!tx) return { error: "Ese movimiento ya no existe." };

  let group = text(form, "group");
  if (!group) {
    const phone = contactPhone(text(form, "phone"));
    if (phone === "invalid") return { error: "Revisa el celular." };
    const made = await openDirect(text(form, "person"), { name: text(form, "name").slice(0, 60), phone, known: null });
    if (!made.id) return made;
    group = made.id;
  }
  const { shared, user } = await currentPerson();
  const mine = memberOf(group, shared, user.id);
  if (!mine) return { error: "No haces parte de ese grupo." };
  const other = shared.members.find((m) => m.group_id === group && m.id !== mine.id);
  const real = (id: string) => (id === PENDING_ME ? mine.id : id === PENDING_OTHER ? (other?.id ?? id) : id);

  const expense = new FormData();
  expense.set("group", group);
  expense.set("tx", tx.id);
  expense.set("amount", String(tx.amount));
  expense.set("description", tx.description || tx.category || "Gasto");
  expense.set("category", tx.category ?? "");
  expense.set("occurred_on", tx.occurred_on);
  expense.set("paid_by", mine.id);
  expense.set("split", JSON.stringify({ mode: split.mode, parts: split.parts.map((p) => ({ ...p, id: real(p.id) })) }));
  const saved = await saveSharedExpense(expense);
  return saved.error ? saved : { id: group };
}

export async function removePerson(form: FormData): Promise<SharedResult> {
  return call("shared_remove_person", { p_member: text(form, "member") });
}

export async function leaveGroup(form: FormData): Promise<SharedResult> {
  const result = await call("shared_leave", { p_group: text(form, "group") });
  if (result.error) return result;
  // From here, so the page of the group one left is never drawn again.
  redirect(text(form, "back") === "/pagos" ? "/pagos" : "/compartidos");
}

export async function restorePerson(form: FormData): Promise<SharedResult> {
  return call("shared_restore_person", { p_member: text(form, "member") });
}

export async function deleteContact(form: FormData): Promise<SharedResult> {
  const { shared, user } = await currentPerson();
  const member = text(form, "member");
  const person = peopleWith(shared, user.id, { deletedToo: true }).find((p) => p.members.includes(member));
  if (!person) return { error: "Ese contacto ya no está." };
  if (person.places.some((p) => !p.group.direct && p.net !== 0)) return { error: "Todavía hay plata pendiente con esa persona: sáldala primero." };
  const result = await call("shared_delete_contact", {
    p_members: placesOf(shared, user.id, member),
    p_directs: person.places.filter((p) => p.group.direct).map((p) => p.group.id),
    p_erase: text(form, "how") === "erase",
  });
  if (result.error) return result;
  // From here, so the deleted contact's page is never drawn again.
  redirect("/compartidos");
}

export async function answerPhoneInvite(form: FormData): Promise<SharedResult> {
  return call("shared_phone_answer", { p_invite: text(form, "invite"), p_accept: text(form, "accept") === "1" });
}

export async function confirmPhoneInvite(form: FormData): Promise<SharedResult> {
  return call("shared_phone_confirm", { p_invite: text(form, "invite"), p_accept: text(form, "accept") === "1" });
}

/** No redraw: what was new stays marked while one reads it. */
export async function readNotices(until: string): Promise<void> {
  if (Number.isNaN(Date.parse(until))) return;
  const supabase = await createClient();
  await supabase.rpc("shared_read_notices", { p_until: until });
}

export async function saveSettlement(form: FormData): Promise<SharedResult> {
  const amount = parsePesos(text(form, "amount"));
  if (!amount) return { error: "Escribe cuánto se pagó." };
  const occurred_on = text(form, "occurred_on");
  if (!DATE.test(occurred_on)) return { error: "La fecha no es válida." };
  const entry = text(form, "entry");
  if (entry) {
    return call("shared_update_entry", {
      p_entry: entry,
      p_description: (text(form, "description") || "Pago para saldar").slice(0, 120),
      p_category: null,
      p_amount: amount,
      p_paid_by: text(form, "from"),
      p_occurred_on: occurred_on,
      p_shares: [{ member_id: text(form, "to"), amount }],
      p_account: text(form, "account_id") || null,
    });
  }
  return call("shared_add_entry", {
    p_group: text(form, "group"),
    p_kind: "settlement",
    p_description: (text(form, "description") || "Pago para saldar").slice(0, 120),
    p_category: null,
    p_amount: amount,
    p_paid_by: text(form, "from"),
    p_occurred_on: occurred_on,
    p_shares: [{ member_id: text(form, "to"), amount }],
    p_account: text(form, "account_id") || null,
    p_tx: null,
  });
}

/** The other side of a payment (or who paid, later) records it in their own account. */
export async function recordInAccount(form: FormData): Promise<SharedResult> {
  const account = text(form, "account_id");
  if (!account) return { error: "Elige la cuenta." };
  return call("shared_record", { p_entry: text(form, "entry"), p_account: account });
}

export async function deleteSharedEntry(form: FormData): Promise<SharedResult> {
  return call("shared_delete_entry", { p_entry: text(form, "entry") });
}
