"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SharedResult } from "@/app/shared-actions";
import { parsePesos, todayInBogota } from "@/lib/finance";
import { halfStart, type Every } from "@/lib/recurrence";
import { readSchedule } from "@/lib/schedule-form";
import { problem, readPeople } from "@/lib/shared-input";
import { computeShares, parseSplit } from "@/lib/split";
import { createClient } from "@/lib/supabase/server";

// Every write goes through a function of migration 0025, which checks who asks and what for.

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

async function call(fn: string, args: Record<string, unknown>): Promise<SharedResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error: problem(error) };
  revalidatePath("/", "layout");
  return typeof data === "string" ? { id: data } : {};
}

/** A house from nothing (alone or with people), or a group the person already has. */
export async function setUpHouse(form: FormData): Promise<SharedResult> {
  const existing = text(form, "existing");
  if (existing) {
    const result = await call("house_set", { p_group: existing, p_on: true });
    return result.error ? result : { id: existing };
  }
  const read = readPeople(form, { optional: true });
  if ("error" in read) return read;
  const me = text(form, "me");
  if (!me) return { error: "Escribe tu nombre: así te verán en la casa." };
  const names = [me, ...read.people.map((p) => p.name)].map((n) => n.toLocaleLowerCase("es"));
  if (new Set(names).size !== names.length) return { error: "Hay nombres repetidos: distínguelos con un apellido." };
  return call("house_create", { p_name: text(form, "name") || "La casa", p_my_name: me, p_people: read.people });
}

export async function stopHouse(form: FormData): Promise<SharedResult> {
  const result = await call("house_set", { p_group: text(form, "group"), p_on: false });
  if (result.error) return result;
  // From here, so the page of what is no longer a house is never drawn again.
  redirect("/pagos");
}

export async function saveHouseBill(form: FormData): Promise<SharedResult> {
  const name = text(form, "name");
  if (!name) return { error: "Ponle un nombre al recibo." };
  const raw = text(form, "amount");
  const amount = raw ? parsePesos(raw) : null;
  if (raw && !amount) return { error: "El valor no es válido." };

  const id = text(form, "bill");
  const supabase = await createClient();
  const { data: current } = id ? await supabase.from("house_bills").select("every, starts_on").eq("id", id).maybeSingle() : { data: null };
  const schedule = readSchedule(
    form,
    { every: "every", day: "due_day", start: "starts_on" },
    { every: current?.every as Every | undefined, start: current?.starts_on },
    halfStart(todayInBogota()),
  );
  if ("error" in schedule) return schedule;
  return call("house_save_bill", {
    p_bill: id || null,
    p_group: text(form, "group") || null,
    p_name: name.slice(0, 80),
    p_amount: amount,
    p_category: text(form, "category") || null,
    p_due_day: schedule.day,
    p_every: schedule.every,
    p_starts_on: schedule.start,
    p_responsible: text(form, "responsible") || null,
    p_split: form.get("split") !== null,
    p_from: text(form, "from") || null,
  });
}

export async function mergeHouseBill(form: FormData): Promise<SharedResult> {
  return call("house_merge_bill", { p_own: text(form, "own"), p_bill: text(form, "bill") });
}

export async function endHouseBill(form: FormData): Promise<SharedResult> {
  return call("house_end_bill", { p_bill: text(form, "bill") });
}

export async function payHouseBill(form: FormData): Promise<SharedResult> {
  const amount = parsePesos(text(form, "amount"));
  if (!amount) return { error: "Escribe cuánto se pagó." };
  const occurred_on = text(form, "occurred_on");
  if (!DATE.test(occurred_on) || occurred_on > todayInBogota()) return { error: "La fecha no es válida." };
  const month = text(form, "month");
  const date = text(form, "for_date");
  if (!MONTH.test(month) || (date && !DATE.test(date))) return { error: "Ese mes no es válido." };

  let shares = null;
  let split = null;
  if (form.has("split")) {
    try {
      split = parseSplit(JSON.parse(text(form, "split")));
    } catch {
      split = null;
    }
    if (!split) return { error: "Revisa cómo se divide." };
    // The pesos are worked out here, never taken from the page.
    const divided = computeShares(amount, split);
    if (!divided.ok) return { error: divided.error };
    shares = divided.shares;
  }
  return call("house_pay", {
    p_bill: text(form, "bill"),
    p_month: month,
    p_date: date || null,
    p_paid_by: text(form, "paid_by"),
    p_amount: amount,
    p_occurred_on: occurred_on,
    p_settles: text(form, "settles") !== "0",
    p_account: text(form, "account_id") || null,
    p_shares: shares,
    p_split: split,
  });
}

export async function updateHousePayment(form: FormData): Promise<SharedResult> {
  const amount = parsePesos(text(form, "amount"));
  if (!amount) return { error: "Escribe cuánto se pagó." };
  const occurred_on = text(form, "occurred_on");
  if (!DATE.test(occurred_on) || occurred_on > todayInBogota()) return { error: "La fecha no es válida." };
  return call("house_update_payment", {
    p_payment: text(form, "payment"),
    p_amount: amount,
    p_occurred_on: occurred_on,
    p_settles: form.get("settles") !== null,
    p_account: text(form, "account_id") || null,
  });
}

export async function recordHousePayment(form: FormData): Promise<SharedResult> {
  const account = text(form, "account_id");
  if (!account) return { error: "Elige la cuenta." };
  return call("house_record", { p_payment: text(form, "payment"), p_account: account });
}

export async function unpayHouseBill(form: FormData): Promise<SharedResult> {
  return call("house_unpay", { p_payment: text(form, "payment") });
}

export async function skipHouseBill(form: FormData): Promise<SharedResult> {
  const month = text(form, "month");
  if (!MONTH.test(month)) return { error: "Ese mes no es válido." };
  return call("house_skip", { p_bill: text(form, "bill"), p_month: month, p_date: text(form, "for_date") || null, p_note: text(form, "note").slice(0, 200) || null });
}

export async function unskipHouseBill(form: FormData): Promise<SharedResult> {
  return call("house_unskip", { p_skip: text(form, "skip") });
}
