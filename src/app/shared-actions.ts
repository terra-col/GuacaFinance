"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { contactPhone } from "@/lib/contacts";
import { parsePesos } from "@/lib/finance";
import { requestOrigin } from "@/lib/request-origin";
import { INVITE_COOKIE } from "@/lib/shared";
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

/** The functions raise in Spanish (P0001); anything else gets a plain answer. */
function problem(error: { code?: string; message: string }): string {
  if (error.code === "P0001") return error.message;
  if (error.code === "23505") return "Ya hay alguien con ese nombre en el grupo, o eso ya quedó registrado.";
  if (error.code === "PGRST202") return "Falta ejecutar la migración 0016 o la 0020 en Supabase.";
  if (error.code === "23514") return "Revisa los datos: hay un nombre, monto o texto que no es válido.";
  return "No se pudo guardar. Intenta de nuevo.";
}

async function call(fn: string, args: Record<string, unknown>): Promise<SharedResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error: problem(error) };
  revalidatePath("/", "layout");
  return typeof data === "string" ? { id: data } : {};
}

interface Person {
  name: string;
  phone: string | null;
  known: string | null;
}

/** The people of a form: `person`, `phone` and `known`, once for each. */
function readPeople(form: FormData): { error: string } | { people: Person[] } {
  const all = (name: string) => form.getAll(name).map((v) => String(v).trim());
  const [names, phones, known] = [all("person"), all("phone"), all("known")];
  const people: Person[] = [];
  for (const [i, name] of names.entries()) {
    if (!name) {
      if (phones[i]) return { error: "Escribe el nombre de cada persona." };
      continue;
    }
    const phone = contactPhone(phones[i] ?? "");
    if (phone === "invalid") return { error: `Revisa el celular de ${name}: 10 dígitos que empiecen por 3, o con + y el código del país.` };
    if (phone && people.some((p) => p.phone === phone)) return { error: `El celular de ${name} está repetido.` };
    people.push({ name, phone, known: known[i] || null });
  }
  return people.length ? { people } : { error: "Agrega al menos una persona." };
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
  const result = await call("shared_delete_group", { p_group: text(form, "group") });
  if (result.error) return result;
  // From here, so the deleted group's page is never drawn again.
  redirect("/compartidos");
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
