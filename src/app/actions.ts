"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { passwordProblem } from "@/lib/auth-links";
import { ADJUSTMENT, allowedTxKinds, balanceAt, isDebt, lastCheckpoint, paidMonth, parsePesos, todayInBogota, type Account, type AccountKind, type Tx, type TxKind } from "@/lib/finance";
import { firstMonthFor } from "@/lib/installments";
import { allPages } from "@/lib/paging";
import { normalizePhone } from "@/lib/phone";
import { PHONE_TAKEN, emailForPhone, phoneLoginReady, phoneTaken } from "@/lib/phone-login";
import { halfStart, type Every } from "@/lib/recurrence";
import { readSchedule } from "@/lib/schedule-form";
import { currencyColumns, readAmount } from "@/lib/money-form";
import { requestOrigin } from "@/lib/request-origin";
import { INVITE_COOKIE, invitePath } from "@/lib/shared";
import { REMEMBER_COOKIE, createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  message?: string;
  /** The movement just created. */
  id?: string;
  /** A freshly created token. It is only ever shown here; the database keeps its hash. */
  token?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Supabase's answer when a table from a migration that has not run yet is queried. */
const missingTable = (message: string, migration: string) =>
  /relation .* does not exist|schema cache|could not find the table|column .* does not exist/i.test(message) ? `Falta ejecutar la migración ${migration} en Supabase.` : null;

const periodMissing = (message: string) => (/every_check/.test(message) ? "Falta ejecutar la migración 0022 en Supabase." : null);

const recurrenceMissing = (message: string) =>
  periodMissing(message) ?? (/\bevery\b|starts_on|plan_every|plan_start|for_date|date_skips/i.test(message) ? "Falta ejecutar la migración 0017 en Supabase." : null);

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

export async function authenticate(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured) return { error: "Falta configurar Supabase en .env.local." };
  // At sign-in the field takes the email or, once the email is verified, the phone.
  const login = text(form, "email");
  const password = String(form.get("password") ?? "");
  if (!login || !password) return { error: "Escribe tu correo y tu contraseña." };

  // «Mantener la sesión iniciada» (on unless unchecked): remembered for later refreshes of the session.
  const remember = form.get("remember") !== null || form.get("intent") === "signup";
  (await cookies()).set(REMEMBER_COOKIE, remember ? "1" : "0", { path: "/", maxAge: 60 * 60 * 24 * 400, sameSite: "lax", httpOnly: true, secure: true });
  const supabase = await createClient({ remember });
  if (form.get("intent") === "signup") {
    const name = text(form, "name").slice(0, 60);
    if (!name) return { error: "Escribe tu nombre: así te saludamos en la app." };
    const phone = normalizePhone(text(form, "phone"));
    if (phone === "invalid") return { error: "Escribe un celular de Colombia de 10 dígitos (empieza por 3), o déjalo vacío." };
    if (phone && (await phoneTaken(supabase, phone))) return { error: PHONE_TAKEN };
    // The confirmation link comes back through /auth/confirm, which opens the session.
    const { data, error } = await supabase.auth.signUp({
      email: login,
      password,
      options: { emailRedirectTo: `${await requestOrigin()}/auth/confirm?next=/`, data: phone ? { name, phone } : { name } },
    });
    if (error) return { error: error.message };
    if (!data.session) return { message: "Cuenta creada. Abre el enlace que te enviamos al correo para entrar. Si no lo ves en unos minutos, revisa la carpeta de spam o correo no deseado." };
  } else {
    let email = login;
    if (!login.includes("@")) {
      const phone = normalizePhone(login);
      if (!phoneLoginReady() || !phone || phone === "invalid") return { error: "Escribe tu correo completo (con @)." };
      // The same answer for an unknown phone and a wrong password: it does not tell who has an account.
      const found = await emailForPhone(supabase, phone);
      if (!found) return { error: "Celular o contraseña incorrectos. Si aún no confirmas tu correo, entra con el correo." };
      email = found;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: email === login ? "Correo o contraseña incorrectos." : "Celular o contraseña incorrectos. Si aún no confirmas tu correo, entra con el correo." };
  }
  // An invitation opened before signing in: back to it.
  const jar = await cookies();
  const invited = invitePath(jar.get(INVITE_COOKIE)?.value);
  if (invited) jar.delete(INVITE_COOKIE);
  redirect(invited ?? "/");
}

/** Sends the reset link. The answer is the same whether or not the email has an account. */
export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured) return { error: "Falta configurar Supabase en .env.local." };
  const email = text(form, "email");
  if (!email) return { error: "Escribe tu correo." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await requestOrigin()}/auth/confirm?next=/nueva-clave`,
  });
  if (error?.status === 429) return { error: "Ya pediste un enlace hace poco. Espera un momento y vuelve a intentarlo." };
  // A 5xx means Supabase could not send the email (usually the SMTP settings), not that the account is missing.
  if (error && (error.status ?? 500) >= 500) {
    console.error("resetPasswordForEmail", error.status, error.code, error.message);
    return { error: "No pudimos enviar el correo en este momento. Intenta de nuevo en unos minutos." };
  }
  return { message: "Si hay una cuenta con ese correo, te enviamos un enlace para elegir una contraseña nueva. Revisa también la carpeta de spam." };
}

/** Sets the password of the signed-in person (after the reset or invite link opened the session). */
export async function updatePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const problem = passwordProblem(password, String(form.get("repeat") ?? ""));
  if (problem) return { error: problem };

  const supabase = await signedIn();
  const { error } = await supabase.auth.updateUser({ password });
  if (error?.code === "same_password") return { error: "La contraseña nueva debe ser distinta a la anterior." };
  if (error?.code === "weak_password") return { error: "Esa contraseña es muy débil. Usa una más larga o con más variedad." };
  if (error) return { error: "No se pudo cambiar la contraseña. Pide un enlace nuevo e intenta otra vez." };
  redirect("/");
}

/**
 * The person's profile: the name the app greets them by and their email. A new email is only
 * used once confirmed from the link sent to it.
 */
export async function updateProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const name = text(form, "name").slice(0, 60);
  if (!name) return { error: "Escribe tu nombre." };
  const phone = normalizePhone(text(form, "phone"));
  if (phone === "invalid") return { error: "Escribe un celular de Colombia de 10 dígitos (empieza por 3), o déjalo vacío." };
  if (phone && (await phoneTaken(supabase, phone, user.id))) return { error: PHONE_TAKEN };
  const email = text(form, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Ese correo no parece válido." };
  const emailChanged = email !== (user.email ?? "").toLowerCase();
  const { error } = await supabase.auth.updateUser(
    { data: { name, phone }, ...(emailChanged ? { email } : {}) },
    emailChanged ? { emailRedirectTo: `${await requestOrigin()}/auth/confirm?next=/ajustes` } : undefined,
  );
  if (error) return { error: error.status === 429 ? "Espera un momento antes de volver a intentarlo." : `No se pudo guardar: ${error.message}` };
  revalidatePath("/", "layout");
  return { message: emailChanged ? `Nombre guardado. Para cambiar el correo, abre el enlace que te enviamos a ${email} (si no llega, revisa spam).` : "Datos guardados." };
}

/** The welcome tour was seen (or skipped): kept with the profile, so it does not start again on another device. */
export async function markTourSeen() {
  const supabase = await createClient();
  await supabase.auth.updateUser({ data: { tour_seen: true } });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function optionalDay(form: FormData, name: string): number | null | "invalid" {
  const raw = text(form, name);
  if (!raw) return null;
  const day = Number(raw);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : "invalid";
}

const DETAIL_COLUMNS = /term_months|first_due_month|rate_type|rate_reference|refinanced|card_purchases/;
const FAVORITE_COLUMN = /favorite/;

/** The message for a failed account write, naming the migration that is missing if that is the cause. */
function accountWriteError(message: string): string {
  if (/column .* does not exist|schema cache|could not find/i.test(message)) {
    return `Falta ejecutar la migración ${FAVORITE_COLUMN.test(message) ? "0012" : DETAIL_COLUMNS.test(message) ? "0009" : "0004"} en Supabase.`;
  }
  return `No se pudo guardar: ${message}`;
}

/**
 * The detail of a debt: rate type (and what a variable rate follows), whether it was refinanced
 * and, for loans, the term in instalments. "Cuotas ya pagadas" becomes the month of the first one.
 */
function creditDetail(form: FormData, kind: AccountKind, dueDay: number | null): { error: string } | { detail: Record<string, string | number | boolean | null> } {
  if (!isDebt({ kind })) return { detail: {} };
  const rateType = text(form, "rate_type");
  if (rateType && rateType !== "fixed" && rateType !== "variable") return { error: "El tipo de tasa no es válido." };
  const detail: Record<string, string | number | boolean | null> = {
    rate_type: rateType || null,
    rate_reference: rateType === "variable" ? text(form, "rate_reference").slice(0, 60) || null : null,
    refinanced: form.get("refinanced") === "on",
  };
  if (kind === "loan") {
    const termRaw = text(form, "term_months");
    if (!termRaw) {
      detail.term_months = null;
      detail.first_due_month = null;
    } else {
      const term = Number(termRaw);
      const paid = Number(text(form, "installments_paid") || "0");
      if (!Number.isInteger(term) || term < 1 || term > 600) return { error: "El plazo debe ser un número de cuotas entre 1 y 600." };
      if (!Number.isInteger(paid) || paid < 0 || paid > term) return { error: "Las cuotas pagadas deben estar entre 0 y el plazo total." };
      detail.term_months = term;
      detail.first_due_month = firstMonthFor(paid, dueDay, todayInBogota());
    }
  }
  return { detail };
}

export async function saveAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const kind = text(form, "kind") as AccountKind;
  if (!["savings", "cash", "credit_card", "loan"].includes(kind)) return { error: "Tipo de cuenta no válido." };
  const name = text(form, "name");
  if (!name) return { error: "Ponle un nombre a la cuenta." };
  const opening_balance = parsePesos(text(form, "opening_balance") || "0");
  if (opening_balance === null) return { error: "El saldo no es un número válido." };
  const opening_date = text(form, "opening_date");
  if (!DATE.test(opening_date)) return { error: "La fecha del saldo no es válida." };

  const debt = isDebt({ kind });
  const statement_day = kind === "credit_card" ? optionalDay(form, "statement_day") : null;
  const due_day = debt ? optionalDay(form, "due_day") : null;
  if (statement_day === "invalid" || due_day === "invalid") return { error: "Los días deben estar entre 1 y 31." };

  const rateRaw = debt ? text(form, "annual_rate").replace(",", ".") : "";
  const annual_rate = rateRaw ? Number(rateRaw) : null;
  if (annual_rate !== null && !(annual_rate >= 0 && annual_rate < 1000)) return { error: "La tasa no es válida." };
  const credit = creditDetail(form, kind, due_day);
  if ("error" in credit) return credit;
  // Only what was filled in, so creating an account keeps working before migration 0009 runs.
  const detail = Object.fromEntries(Object.entries(credit.detail).filter(([, v]) => v !== null && v !== false));

  const { error } = await supabase.from("accounts").insert({
    ...detail,
    kind,
    name,
    institution: text(form, "institution") || null,
    opening_balance,
    opening_date,
    credit_limit: kind === "credit_card" ? parsePesos(text(form, "credit_limit")) || null : null,
    monthly_payment: debt ? parsePesos(text(form, "monthly_payment")) || null : null,
    ...(kind === "loan" && parsePesos(text(form, "original_amount")) ? { original_amount: parsePesos(text(form, "original_amount")) } : {}),
    annual_rate,
    statement_day,
    due_day,
  });
  if (error) {
    return {
      error: /accounts_kind_check/.test(error.message) ? "Para registrar efectivo falta ejecutar la migración 0005 en Supabase." : accountWriteError(error.message),
    };
  }
  revalidatePath("/", "layout");
  return { message: `${name} quedó registrada.` };
}

export async function deleteAccount(form: FormData) {
  const supabase = await signedIn();
  const id = text(form, "id");
  const { data: account } = await supabase.from("accounts").select("kind").eq("id", id).maybeSingle();
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar la cuenta: ${error.message}`);
  revalidatePath("/", "layout");
  redirect(account && isDebt(account) ? "/deudas" : "/");
}

export async function saveTx(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const kind = text(form, "kind") as TxKind;
  const account_id = text(form, "account_id");
  if (!account_id) return { error: "Elige la cuenta." };
  const money = readAmount(form, "Escribe un monto mayor que cero.");
  if ("error" in money) return money;
  const { amount } = money;
  const occurred_on = text(form, "occurred_on");
  if (!DATE.test(occurred_on)) return { error: "La fecha no es válida." };

  const { data: account } = await supabase.from("accounts").select("kind").eq("id", account_id).maybeSingle();
  if (!account) return { error: "Esa cuenta ya no existe." };
  if (!allowedTxKinds(account.kind as AccountKind).includes(kind)) {
    return { error: "Ese tipo de movimiento no aplica a esa cuenta." };
  }

  let source_account_id: string | null = null;
  if (kind === "payment") {
    source_account_id = text(form, "source_account_id") || null;
    if (source_account_id) {
      const { data: source } = await supabase.from("accounts").select("kind").eq("id", source_account_id).maybeSingle();
      if (!source || isDebt(source)) return { error: "El pago debe salir de una cuenta de ahorros o de tu efectivo." };
    }
  }

  const row: Record<string, unknown> = {
    kind,
    account_id,
    source_account_id,
    amount,
    occurred_on,
    category: kind === "expense" ? text(form, "category") || null : null,
    description: text(form, "description") || null,
    ...currencyColumns(form, money),
  };
  // With an id the form edits that movement; its links to a bill or an income stay as they were.
  const id = text(form, "id");
  if (id && !UUID.test(id)) return { error: "Ese movimiento no existe." };
  if (id) {
    const { error } = await supabase.from("transactions").update(row).eq("id", id);
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    revalidatePath("/", "layout");
    return { message: "Movimiento actualizado." };
  }
  const { data, error } = await supabase.from("transactions").insert(row).select("id").single();
  if (error) return { error: `No se pudo guardar: ${error.message}` };
  revalidatePath("/", "layout");
  // «Dividir» needs to know which one, and only an expense can be divided.
  return { message: "Movimiento registrado.", id: kind === "expense" ? (data.id as string) : undefined };
}

export async function deleteTx(form: FormData) {
  const supabase = await signedIn();
  const { error } = await supabase.from("transactions").delete().eq("id", text(form, "id"));
  if (error) throw new Error(`No se pudo eliminar el movimiento: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function saveBill(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const name = text(form, "name");
  if (!name) return { error: "Ponle un nombre al recibo." };
  const id = text(form, "id");
  const { data: current } = id ? await supabase.from("bills").select("*").eq("id", id).maybeSingle() : { data: null };
  const schedule = readSchedule(form, { every: "every", day: "due_day", start: "starts_on" }, { every: current?.every, start: current?.starts_on }, halfStart(todayInBogota()));
  if ("error" in schedule) return schedule;
  const amountRaw = text(form, "amount");
  const amount = amountRaw ? parsePesos(amountRaw) : null;
  if (amountRaw && !amount) return { error: "El valor no es válido." };

  // Only when it is not plain monthly, so saving keeps working before migration 0017.
  const repeats = schedule.every !== "monthly" || (current?.every && current.every !== "monthly") ? { every: schedule.every, starts_on: schedule.start } : {};
  // The instalment of a card or loan of one's own (migration 0026).
  const pays = text(form, "pays_account");
  if (pays) {
    const { data: debt } = await supabase.from("accounts").select("kind").eq("id", pays).maybeSingle();
    if (!debt || !isDebt(debt)) return { error: "Elige una de tus tarjetas o créditos." };
  }
  const debtLink = form.has("pays_account") && (pays || current?.pays_account) ? { pays_account: pays || null } : {};
  const row: Record<string, unknown> = { name, due_day: schedule.day, amount, category: text(form, "category") || null, ...repeats, ...debtLink };
  const { error } = id ? await supabase.from("bills").update(row).eq("id", id) : await supabase.from("bills").insert(row);
  if (error && /pays_account/.test(error.message)) return { error: "Falta ejecutar la migración 0026 en Supabase." };
  if (error) return { error: recurrenceMissing(error.message) ?? `No se pudo guardar: ${error.message}` };
  revalidatePath("/", "layout");
  return { message: id ? `${name} quedó actualizado.` : `${name} quedó registrado.` };
}

/**
 * Edits a fixed bill or a scheduled income from its row in Pagos: name, amount (empty when it
 * varies) and day of the month. Nothing already recorded changes; an income keeps its months and account.
 */
export async function updateRecurring(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const type = text(form, "type");
  if (type !== "bill" && type !== "income") return { error: "Eso no se puede editar aquí." };
  const name = text(form, "name");
  if (!name) return { error: "Ponle un nombre." };
  // What is not monthly has its days in Programados: only name and amount come from its row.
  const keepsDay = !form.has("day");
  const day = optionalDay(form, "day");
  if (!keepsDay && (day === null || day === "invalid")) return { error: "El día debe estar entre 1 y 31." };
  const amountRaw = text(form, "amount");
  const amount = amountRaw ? parsePesos(amountRaw) : null;
  if (amountRaw && !amount) return { error: "El valor no es válido." };
  const { error } =
    type === "bill"
      ? await supabase.from("bills").update({ name, amount, ...(keepsDay ? {} : { due_day: day }) }).eq("id", text(form, "id"))
      : await supabase.from("incomes").update({ name, amount, ...(keepsDay ? {} : { day }) }).eq("id", text(form, "id"));
  if (error) return { error: `No se pudo guardar: ${error.message}` };
  revalidatePath("/", "layout");
  return { message: "Guardado." };
}

export async function deleteBill(form: FormData) {
  const supabase = await signedIn();
  const { error } = await supabase.from("bills").delete().eq("id", text(form, "id"));
  if (error) throw new Error(`No se pudo eliminar el recibo: ${error.message}`);
  revalidatePath("/", "layout");
}

/** Creates (or replaces) the user's token of one kind and returns it once. */
export async function createToken(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const kind = text(form, "kind");
  if (kind !== "wallet" && kind !== "calendar") return { error: "Tipo de token no válido." };

  const token = randomBytes(24).toString("base64url");
  const token_hash = createHash("sha256").update(token).digest("hex");
  const removed = await supabase.from("api_tokens").delete().eq("kind", kind);
  if (removed.error) return { error: `No se pudo reemplazar el token: ${removed.error.message}` };
  const { error } = await supabase.from("api_tokens").insert({ kind, token_hash });
  if (error) return { error: `No se pudo crear el token: ${error.message}` };
  revalidatePath("/ajustes");
  return { token };
}

export async function clearWalletName(form: FormData) {
  const supabase = await signedIn();
  const { error } = await supabase.from("accounts").update({ wallet_card_name: null }).eq("id", text(form, "id"));
  if (error) throw new Error(`No se pudo desvincular la tarjeta: ${error.message}`);
  revalidatePath("/", "layout");
}

/** Turns a Wallet payment that needed review into an expense, optionally remembering the card. */
export async function resolveInbox(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const amount = parsePesos(text(form, "amount"));
  if (!amount) return { error: "Escribe el monto." };
  const account_id = text(form, "account_id");
  if (!account_id) return { error: "Elige la cuenta o tarjeta." };

  const { data: item } = await supabase.from("wallet_inbox").select("*").eq("id", text(form, "id")).maybeSingle();
  if (!item) return { error: "Ese pago ya fue revisado." };

  if (form.get("remember") && item.card) {
    const linked = await supabase.from("accounts").update({ wallet_card_name: item.card }).eq("id", account_id);
    if (linked.error) {
      return { error: linked.error.code === "23505" ? `Ya hay otra cuenta vinculada a «${item.card}».` : linked.error.message };
    }
  }

  const { error } = await supabase.from("transactions").insert({
    kind: "expense",
    // When the phone reported it, not when it was reviewed: that places it against a checkpoint.
    created_at: item.received_at,
    account_id,
    amount,
    occurred_on: item.occurred_on,
    category: text(form, "category") || null,
    description: text(form, "description") || item.merchant,
    source: "wallet",
  });
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  const removed = await supabase.from("wallet_inbox").delete().eq("id", item.id);
  if (removed.error) return { error: `El gasto quedó registrado, pero no se pudo quitar de la bandeja: ${removed.error.message}` };
  revalidatePath("/", "layout");
  return { message: "Registrado." };
}

export async function discardInbox(form: FormData) {
  const supabase = await signedIn();
  const { error } = await supabase.from("wallet_inbox").delete().eq("id", text(form, "id"));
  if (error) throw new Error(`No se pudo descartar: ${error.message}`);
  revalidatePath("/", "layout");
}

/**
 * Ticks one item of the monthly checklist by recording its payment: an
 * expense for a fixed bill, or a debt payment for a card or loan.
 */
export async function markPaid(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const amount = parsePesos(text(form, "amount"));
  if (!amount) return { error: "Escribe cuánto pagaste." };
  const occurred_on = text(form, "occurred_on");
  if (!DATE.test(occurred_on)) return { error: "La fecha no es válida." };
  const id = text(form, "id");
  const account_id = text(form, "account_id") || null;
  // Paid early (or late) for another month's list: that month is kept with the movement.
  const month = text(form, "month");
  // What is not monthly also keeps the date it ticks.
  const forDate = text(form, "for_date");
  if (forDate && (!DATE.test(forDate) || forDate.slice(0, 7) !== month)) return { error: "Esa fecha del pago no es válida." };
  const forMonth = {
    ...(MONTH.test(month) && month !== occurred_on.slice(0, 7) ? { for_month: month } : {}),
    ...(forDate && ["bill", "goal", "income"].includes(text(form, "type")) ? { for_date: forDate } : {}),
    ...(text(form, "written_at") && form.get("type") !== "goal" ? { created_at: text(form, "written_at") } : {}),
  };

  if (form.get("type") === "goal") {
    const { data: goal } = await supabase.from("goals").select("id").eq("id", id).maybeSingle();
    if (!goal) return { error: "Esa meta ya no existe." };
    const { error } = await supabase.from("goal_deposits").insert({ goal_id: goal.id, amount, occurred_on, ...forMonth });
    if (error) return { error: forMonthMissing(error.message) ?? `No se pudo guardar: ${error.message}` };
  } else if (form.get("type") === "income") {
    if (!account_id) return { error: "Elige a qué cuenta llegó." };
    const [{ data: income }, { data: target }] = await Promise.all([
      supabase.from("incomes").select("id, name").eq("id", id).maybeSingle(),
      supabase.from("accounts").select("kind").eq("id", account_id).maybeSingle(),
    ]);
    if (!income) return { error: "Ese ingreso ya no existe." };
    if (!target || isDebt(target)) return { error: "El ingreso debe llegar a una cuenta de ahorros o a tu efectivo." };
    const { error } = await supabase.from("transactions").insert({ kind: "income", account_id, amount, occurred_on, income_id: income.id, description: income.name, ...forMonth });
    if (error) return { error: forMonthMissing(error.message) ?? missingTable(error.message, "0007") ?? `No se pudo guardar: ${error.message}` };
  } else if (form.get("type") === "bill") {
    const { data: bill } = await supabase.from("bills").select("*").eq("id", id).maybeSingle();
    if (!bill) return { error: "Ese pago fijo ya no existe." };
    if (bill.pays_account) {
      // The instalment of a card or loan: a payment that lowers it, out of savings or cash.
      if (account_id) {
        const { data: source } = await supabase.from("accounts").select("kind").eq("id", account_id).maybeSingle();
        if (!source || isDebt(source)) return { error: "La cuota debe salir de una cuenta de ahorros o de tu efectivo." };
      }
      const { error } = await supabase.from("transactions").insert({
        kind: "payment",
        account_id: bill.pays_account,
        source_account_id: account_id,
        amount,
        occurred_on,
        bill_id: bill.id,
        description: bill.name,
        ...forMonth,
      });
      if (error) return { error: forMonthMissing(error.message) ?? `No se pudo guardar: ${error.message}` };
      revalidatePath("/", "layout");
      return {};
    }
    if (!account_id) return { error: "Elige con qué pagaste." };
    const { error } = await supabase.from("transactions").insert({
      kind: "expense",
      account_id,
      amount,
      occurred_on,
      bill_id: bill.id,
      category: bill.category ?? "Recibos",
      description: bill.name,
      ...forMonth,
    });
    if (error) return { error: forMonthMissing(error.message) ?? `No se pudo guardar: ${error.message}` };
  } else {
    const { data: debt } = await supabase.from("accounts").select("kind").eq("id", id).maybeSingle();
    if (!debt || !isDebt(debt)) return { error: "Esa deuda ya no existe." };
    if (account_id) {
      const { data: source } = await supabase.from("accounts").select("kind").eq("id", account_id).maybeSingle();
      if (!source || isDebt(source)) return { error: "El pago debe salir de una cuenta de ahorros o de tu efectivo." };
    }
    const { error } = await supabase
      .from("transactions")
      .insert({ kind: "payment", account_id: id, source_account_id: account_id, amount, occurred_on, ...forMonth });
    if (error) return { error: forMonthMissing(error.message) ?? `No se pudo guardar: ${error.message}` };
  }
  revalidatePath("/", "layout");
  return {};
}

/** Unticks an item by deleting the payments that ticked it in that month (by their date, or marked for it). */
export async function unmarkPaid(form: FormData): Promise<FormState & { writtenAt?: string }> {
  const supabase = await signedIn();
  const month = text(form, "month");
  if (!MONTH.test(month)) throw new Error("Mes no válido.");
  const id = text(form, "id");
  const type = form.get("type");
  const failed = (message: string) => new Error(`No se pudo deshacer: ${message}`);
  // Read whole rows and pick in code: works the same before and after migration 0013.
  type Row = { id: string; occurred_on: string; for_month?: string | null; for_date?: string | null; category?: string | null; created_at?: string };
  // A date of something not monthly unticks only itself, never the month's other dates.
  const date = text(form, "for_date");
  const listed = new Set(text(form, "paid_ids").split(",").filter(Boolean));
  const ticking = (rows: Row[] | null) =>
    (rows ?? [])
      .filter((r) => paidMonth(r) === month && r.category !== ADJUSTMENT && (!date || r.for_date === date || listed.has(r.id)))
      .map((r) => r.id);

  if (type === "goal") {
    const { data, error: findError } = await supabase.from("goal_deposits").select("*").eq("goal_id", id).gt("amount", 0).order("occurred_on", { ascending: false });
    if (findError) throw failed(findError.message);
    const ids = ticking(data);
    if (ids.length === 0) return {};
    const { error } = await supabase.from("goal_deposits").delete().in("id", ids);
    if (error) throw failed(error.message);
    revalidatePath("/", "layout");
    return {};
  }

  // Find exactly the movements that ticked it; balance adjustments are never touched.
  // Newest first: what can be unticked is recent, and a daily payment passes 1000 rows.
  const base = supabase.from("transactions").select("*").order("occurred_on", { ascending: false });
  const { data: rows, error: findError } =
    type === "bill" ? await base.eq("bill_id", id) : type === "income" ? await base.eq("income_id", id) : await base.eq("account_id", id).eq("kind", "payment");
  if (findError) throw failed(findError.message);
  const ids = ticking(rows);
  if (ids.length === 0) return {};
  // A divided payment, deleted and marked again, would count in full on top of the person's share.
  const { data: divided } = await supabase.from("shared_links").select("tx_id").in("tx_id", ids).limit(1);
  if (divided?.length) return { error: "Este pago está dividido. Para cambiarlo, primero bórralo en Compartidos." };
  const { error } = await supabase.from("transactions").delete().in("id", ids);
  if (error) throw failed(error.message);
  revalidatePath("/", "layout");
  return { writtenAt: (rows as Row[]).find((r) => ids.includes(r.id))?.created_at };
}

const forMonthMissing = (message: string) => (/for_month/i.test(message) ? "Para marcar pagos de otro mes falta ejecutar la migración 0013 en Supabase." : null);

const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Edits a payment already ticked (amount, account, date): the month's movements that ticked it are
 * replaced by one with the new data. Checked before anything is deleted, so a typo loses nothing.
 */
export async function updatePaid(_prev: FormState, form: FormData): Promise<FormState> {
  const amount = parsePesos(text(form, "amount"));
  if (!amount) return { error: "Escribe el monto." };
  if (!DATE.test(text(form, "occurred_on"))) return { error: "La fecha no es válida." };
  const type = form.get("type");
  if ((type === "bill" || type === "income") && !text(form, "account_id") && !form.get("pays")) return { error: type === "bill" ? "Elige con qué pagaste." : "Elige a qué cuenta llegó." };
  try {
    const undone = await unmarkPaid(form);
    if (undone.error) return undone;
    form.delete("written_at");
    if (undone.writtenAt) form.set("written_at", undone.writtenAt);
  } catch {
    return { error: "No se pudo actualizar. Intenta de nuevo." };
  }
  const result = await markPaid({}, form);
  return result.error ? result : { message: "Actualizado." };
}

/** Edits an account's details and the look of its card. The opening balance is not editable: it anchors the history. */
export async function updateAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const id = text(form, "id");
  const { data: current } = await supabase.from("accounts").select("kind").eq("id", id).maybeSingle();
  if (!current) return { error: "Esa cuenta ya no existe." };
  const kind = current.kind as AccountKind;

  const name = text(form, "name");
  if (!name) return { error: "Ponle un nombre a la cuenta." };
  const color = text(form, "color") || null;
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { error: "El color no es válido." };
  const last4 = text(form, "last4") || null;
  if (last4 && !/^\d{4}$/.test(last4)) return { error: "Escribe exactamente 4 dígitos, o déjalo vacío." };
  const logo = text(form, "logo") || null;
  if (logo && (!LOGO.test(logo) || logo.length > 150000)) return { error: "La imagen no es válida o es muy grande." };

  const debt = isDebt({ kind });
  const statement_day = kind === "credit_card" ? optionalDay(form, "statement_day") : null;
  const due_day = debt ? optionalDay(form, "due_day") : null;
  if (statement_day === "invalid" || due_day === "invalid") return { error: "Los días deben estar entre 1 y 31." };
  const rateRaw = debt ? text(form, "annual_rate").replace(",", ".") : "";
  const annual_rate = rateRaw ? Number(rateRaw) : null;
  if (annual_rate !== null && !(annual_rate >= 0 && annual_rate < 1000)) return { error: "La tasa no es válida." };
  const credit = creditDetail(form, kind, due_day);
  if ("error" in credit) return credit;

  const { error } = await supabase
    .from("accounts")
    .update({
      ...credit.detail,
      name,
      institution: text(form, "institution") || null,
      color,
      last4: kind === "loan" ? null : last4,
      logo,
      credit_limit: kind === "credit_card" ? parsePesos(text(form, "credit_limit")) || null : null,
      monthly_payment: debt ? parsePesos(text(form, "monthly_payment")) || null : null,
      original_amount: kind === "loan" ? parsePesos(text(form, "original_amount")) || null : null,
      statement_day,
      due_day,
      annual_rate,
    })
    .eq("id", id);
  if (error) return { error: accountWriteError(error.message) };

  // «Datos» of a debt also carries its balance. Only a value changed from the one shown records an
  // adjustment, so saving the other fields never creates one by accident.
  const typed = text(form, "balance");
  const shown = text(form, "balance_shown");
  if (typed && shown && parsePesos(typed) !== Number(shown)) {
    const adjusted = await adjustBalance({}, form);
    if (adjusted.error) return { error: `Los datos quedaron guardados, pero el saldo no: ${adjusted.error}` };
  }
  revalidatePath("/", "layout");
  return { message: "Cambios guardados." };
}

/**
 * Creates or edits a card purchase in instalments. "Cuotas ya pagadas" becomes the month of the
 * first one. A new purchase can also be recorded as an expense on the card, so its balance includes it.
 */
export async function savePurchase(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const id = text(form, "id");
  const account_id = text(form, "account_id");
  const { data: card } = await supabase.from("accounts").select("kind, due_day").eq("id", account_id).maybeSingle();
  if (!card || card.kind !== "credit_card") return { error: "Esa tarjeta ya no existe." };

  const description = text(form, "description").slice(0, 80);
  if (!description) return { error: "Escribe qué compraste." };
  const amount = parsePesos(text(form, "amount"));
  if (!amount) return { error: "Escribe el valor de la compra." };
  const installments = Number(text(form, "installments"));
  if (!Number.isInteger(installments) || installments < 1 || installments > 120) return { error: "Las cuotas deben ser un número entre 1 y 120." };
  const paid = Number(text(form, "installments_paid") || "0");
  if (!Number.isInteger(paid) || paid < 0 || paid > installments) return { error: "Las cuotas pagadas deben estar entre 0 y el total de cuotas." };
  const rateRaw = text(form, "annual_rate").replace(",", ".");
  const annual_rate = rateRaw ? Number(rateRaw) : null;
  if (annual_rate !== null && !(annual_rate >= 0 && annual_rate < 1000)) return { error: "La tasa no es válida." };
  const rateType = text(form, "rate_type");
  if (rateType && rateType !== "fixed" && rateType !== "variable") return { error: "El tipo de tasa no es válido." };

  const row = {
    account_id,
    description,
    amount,
    installments,
    first_due_month: firstMonthFor(paid, card.due_day, todayInBogota()),
    monthly_payment: parsePesos(text(form, "monthly_payment")) || null,
    annual_rate,
    rate_type: rateType || null,
    refinanced: form.get("refinanced") === "on",
  };
  const { error } = id ? await supabase.from("card_purchases").update(row).eq("id", id) : await supabase.from("card_purchases").insert(row);
  if (error) return { error: accountWriteError(error.message) };

  if (!id && form.get("record_expense") === "on") {
    const { error: txError } = await supabase.from("transactions").insert({
      account_id,
      kind: "expense",
      amount,
      category: text(form, "category") || null,
      description,
      occurred_on: todayInBogota(),
      source: "manual",
    });
    if (txError) return { error: `La compra quedó registrada, pero no se pudo sumar al saldo: ${txError.message}` };
  }
  revalidatePath("/", "layout");
  return { message: id ? "Compra actualizada." : "Compra registrada." };
}

/** Marks an account (savings or cash) as the favourite for payments, or unmarks it. One at a time. */
export async function toggleFavorite(form: FormData) {
  const supabase = await signedIn();
  const id = text(form, "id");
  const { data: account } = await supabase.from("accounts").select("kind, favorite").eq("id", id).maybeSingle();
  if (!account || isDebt(account)) throw new Error("Solo una cuenta bancaria o el efectivo pueden ser la favorita.");
  if (account.favorite) {
    const { error } = await supabase.from("accounts").update({ favorite: false }).eq("id", id);
    if (error) throw new Error(accountWriteError(error.message));
  } else {
    // The previous favourite gives way first: only one is allowed.
    const { error: clearError } = await supabase.from("accounts").update({ favorite: false }).eq("favorite", true);
    if (clearError) throw new Error(accountWriteError(clearError.message));
    const { error } = await supabase.from("accounts").update({ favorite: true }).eq("id", id);
    if (error) throw new Error(accountWriteError(error.message));
  }
  revalidatePath("/", "layout");
}


/**
 * The order of one carousel after a card is dragged: each account gets its place. Row Level
 * Security keeps it to the person's own accounts. No revalidation: the screen already shows it.
 */
export async function reorderAccounts(ids: string[]): Promise<FormState> {
  const supabase = await signedIn();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
    return { error: "Orden no válido." };
  }
  const results = await Promise.all(ids.map((id, position) => supabase.from("accounts").update({ position }).eq("id", id)));
  const failed = results.find((r) => r.error)?.error;
  if (failed) return { error: /position/i.test(failed.message) ? "Para guardar el orden falta ejecutar la migración 0015 en Supabase." : `No se pudo guardar el orden: ${failed.message}` };
  return {};
}

export async function deletePurchase(form: FormData) {
  const supabase = await signedIn();
  const { error } = await supabase.from("card_purchases").delete().eq("id", text(form, "id"));
  if (error) throw new Error(`No se pudo eliminar la compra: ${error.message}`);
  revalidatePath("/", "layout");
}

/**
 * Sets an account to the balance the bank shows today by recording the
 * difference as a movement, so the history stays consistent.
 */
export async function adjustBalance(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const id = text(form, "id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Cuenta no válida." };
  const target = parsePesos(text(form, "balance"));
  if (target === null) return { error: "Escribe el saldo que te muestra el banco." };
  const occurred_on = text(form, "occurred_on") || todayInBogota();
  if (!DATE.test(occurred_on)) return { error: "La fecha no es válida." };

  // The balance is computed here, from the database, as of the chosen date: never trusted from the page.
  const { data: account } = await supabase.from("accounts").select("*").eq("id", id).maybeSingle();
  if (!account) return { error: "Esa cuenta ya no existe." };
  // Every movement, page by page: Supabase returns 1000 rows at most, and a balance computed
  // from a cut list would record a wrong adjustment.
  const read = await allPages<Tx>((from, to) =>
    supabase.from("transactions").select("*").or(`account_id.eq.${id},source_account_id.eq.${id}`).order("id").range(from, to),
  );
  if (read.error) return { error: `No se pudo leer la cuenta: ${read.error.message}` };
  const diff = target - balanceAt(account as Account, read.rows, occurred_on);

  const debt = isDebt(account);
  // For a debt, more owed is a charge (interest, fees, a purchase not yet recorded); less is a payment.
  const kind: TxKind = debt ? (diff > 0 ? "expense" : "payment") : diff > 0 ? "income" : "expense";
  const row = {
    kind,
    account_id: id,
    amount: Math.abs(diff),
    occurred_on,
    category: ADJUSTMENT,
    description: diff === 0 ? "Coincidía con lo registrado" : diff > 0 ? (debt ? "Subió la deuda: intereses o cargos" : "Saldo mayor al registrado") : debt ? "Bajó la deuda" : "Saldo menor al registrado",
  };
  // The bank's balance is kept as a checkpoint, also when it matches: from there on it is what counts.
  let { error } = await supabase.from("transactions").insert({ ...row, checkpoint: target });
  if (error && /checkpoint/i.test(error.message) && !/check constraint/i.test(error.message)) {
    // Before migration 0018: the difference, as before.
    if (diff === 0) return { message: "El saldo ya estaba al día." };
    ({ error } = await supabase.from("transactions").insert(row));
  }
  if (error) return { error: `No se pudo ajustar: ${error.message}` };
  revalidatePath("/", "layout");
  const later = lastCheckpoint({ id }, read.rows);
  return { message: later && later.occurred_on > occurred_on ? "Guardado. El saldo de hoy no cambia: tienes una actualización más reciente." : "Saldo actualizado." };
}

const goalsMissing = (message: string) =>
  periodMissing(message)
    ? periodMissing(message)
    : /plan_every|plan_start/i.test(message)
    ? "Falta ejecutar la migración 0017 en Supabase."
    : /plan_once/i.test(message)
    ? "Falta ejecutar la migración 0011 en Supabase."
    : /plan_amount|plan_day|plan_income_id|checklist_skips_item_type/i.test(message)
    ? "Falta ejecutar la migración 0010 en Supabase."
    : /relation .* does not exist|schema cache|could not find the table/i.test(message)
      ? "Falta ejecutar la migración 0006 en Supabase."
      : null;

type GoalPlan = { plan_amount: number | null; plan_day: number | null; plan_income_id: string | null; plan_once: boolean; plan_every?: Every; plan_start?: string | null };

/**
 * How a savings goal is reached (`plan_mode`): «monthly» (an amount on a day of each month, maybe from
 * an income), «once» (all on its date) or «none» (no plan, no pace).
 */
function goalPlan(form: FormData, before: { every?: Every; start?: string | null } = {}): { error: string } | { plan: GoalPlan } {
  const mode = text(form, "plan_mode") || "none";
  // The periodicity goes only when there is or was one, so this works before migration 0017.
  const changed = before.every && before.every !== "monthly";
  const cleared = changed ? { plan_every: "monthly" as const, plan_start: null } : {};
  if (mode === "once") return { plan: { plan_amount: null, plan_day: null, plan_income_id: null, plan_once: true, ...cleared } };
  if (mode !== "monthly") return { plan: { plan_amount: null, plan_day: null, plan_income_id: null, plan_once: false, ...cleared } };
  const plan_amount = parsePesos(text(form, "plan_amount"));
  if (!plan_amount) return { error: "Escribe cuánto vas a abonar cada vez." };
  // A plan starts today: a date that already passed is not owed.
  const schedule = readSchedule(form, { every: "plan_every", day: "plan_day", start: "plan_start" }, before, todayInBogota());
  if ("error" in schedule) return schedule;
  const plan_day = schedule.day;
  const repeats = schedule.every !== "monthly" ? { plan_every: schedule.every, plan_start: schedule.start } : cleared;
  const plan_income_id = text(form, "plan_income_id") || null;
  if (plan_income_id && !UUID.test(plan_income_id)) return { error: "Ese ingreso no es válido." };
  return { plan: { plan_amount, plan_day, plan_income_id, plan_once: false, ...repeats } };
}

export async function saveGoal(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const kind = text(form, "kind");
  if (kind !== "save" && kind !== "payoff") return { error: "Tipo de meta no válido." };
  const name = text(form, "name");
  if (!name) return { error: "Ponle un nombre a la meta." };
  const target_date = text(form, "target_date");
  if (!DATE.test(target_date)) return { error: "Elige la fecha límite." };

  let row: Record<string, unknown> = { kind, name, target_date, emoji: text(form, "emoji").slice(0, 8) || null, created_on: todayInBogota() };
  if (kind === "save") {
    const target_amount = parsePesos(text(form, "target_amount"));
    if (!target_amount) return { error: "Escribe cuánto quieres juntar." };
    const plan = goalPlan(form);
    if ("error" in plan) return plan;
    // Only with a plan, so creating a goal keeps working before migrations 0010 and 0011 run.
    const { plan_once, ...monthly } = plan.plan;
    row = { ...row, target_amount, ...(monthly.plan_amount ? monthly : {}), ...(plan_once ? { plan_once } : {}) };
  } else {
    const account_id = text(form, "account_id");
    const start_balance = Number(text(form, "start_balance"));
    if (!account_id) return { error: "Elige la deuda que quieres saldar." };
    row = { ...row, account_id, start_balance: Number.isFinite(start_balance) ? Math.max(0, Math.round(start_balance)) : null };
  }
  const { error } = await supabase.from("goals").insert(row);
  if (error) return { error: goalsMissing(error.message) ?? `No se pudo guardar: ${error.message}` };
  revalidatePath("/", "layout");
  return { message: "Meta creada." };
}

/** Edits a goal: its name, icon, date, amount (savings) and plan. A payoff goal keeps its debt. */
export async function updateGoal(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const id = text(form, "id");
  const { data: current } = await supabase.from("goals").select("*").eq("id", id).maybeSingle();
  if (!current) return { error: "Esa meta ya no existe." };
  const name = text(form, "name");
  if (!name) return { error: "Ponle un nombre a la meta." };
  const target_date = text(form, "target_date");
  if (!DATE.test(target_date)) return { error: "Elige la fecha límite." };
  let row: Record<string, unknown> = { name, target_date, emoji: text(form, "emoji").slice(0, 8) || null };
  if (current.kind === "save") {
    const target_amount = parsePesos(text(form, "target_amount"));
    if (!target_amount) return { error: "Escribe cuánto quieres juntar." };
    const plan = goalPlan(form, { every: current.plan_every, start: current.plan_start });
    if ("error" in plan) return plan;
    row = { ...row, target_amount, ...plan.plan };
  }
  const { error } = await supabase.from("goals").update(row).eq("id", id);
  if (error) return { error: goalsMissing(error.message) ?? `No se pudo guardar: ${error.message}` };
  revalidatePath("/", "layout");
  return { message: "Meta actualizada." };
}

export async function deleteDeposit(form: FormData) {
  const supabase = await signedIn();
  const { error } = await supabase.from("goal_deposits").delete().eq("id", text(form, "id"));
  if (error) throw new Error(`No se pudo borrar el abono: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function deleteGoal(form: FormData) {
  const supabase = await signedIn();
  const { error } = await supabase.from("goals").delete().eq("id", text(form, "id"));
  if (error) throw new Error(`No se pudo eliminar la meta: ${error.message}`);
  revalidatePath("/", "layout");
  // Also when deleted from its own screen, which no longer exists.
  redirect("/metas");
}

export async function addDeposit(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const amount = parsePesos(text(form, "amount"));
  if (!amount) return { error: "Escribe cuánto abonas." };
  const sign = form.get("withdraw") ? -1 : 1;
  const { error } = await supabase.from("goal_deposits").insert({ goal_id: text(form, "goal_id"), amount: sign * amount, occurred_on: todayInBogota() });
  if (error) return { error: goalsMissing(error.message) ?? `No se pudo guardar: ${error.message}` };
  revalidatePath("/", "layout");
  return { message: sign > 0 ? "Abono registrado." : "Retiro registrado." };
}

/** «Este mes no aplica»: the item stops counting as pending or late for that month. */
export async function skipItem(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const item_type = text(form, "type");
  const item_id = text(form, "id");
  const month = text(form, "month");
  if (!["bill", "debt", "income", "goal"].includes(item_type) || !UUID.test(item_id) || !MONTH.test(month)) return { error: "No se pudo omitir." };
  const note = text(form, "note").slice(0, 200) || null;
  const for_date = text(form, "for_date");
  if (for_date) {
    if (!["bill", "goal", "income"].includes(item_type) || !DATE.test(for_date)) return { error: "No se pudo omitir." };
    const { error } = await supabase.from("date_skips").upsert({ item_type, item_id, for_date, note }, { onConflict: "user_id,item_type,item_id,for_date" });
    if (error) return { error: recurrenceMissing(error.message) ?? `No se pudo omitir: ${error.message}` };
    revalidatePath("/", "layout");
    return { message: "Omitido esta vez." };
  }
  const { error } = await supabase.from("checklist_skips").upsert({ item_type, item_id, month, note }, { onConflict: "user_id,item_type,item_id,month" });
  if (error) return { error: missingTable(error.message, "0007") ?? `No se pudo omitir: ${error.message}` };
  revalidatePath("/", "layout");
  return { message: "Omitido este mes." };
}

export async function unskipItem(form: FormData) {
  const supabase = await signedIn();
  const table = text(form, "for_date") ? "date_skips" : "checklist_skips";
  const { error } = await supabase.from(table).delete().eq("id", text(form, "id"));
  if (error) throw new Error(`No se pudo deshacer: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function saveBudget(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const category = text(form, "category");
  if (!category) return { error: "Elige la categoría." };
  const amount = parsePesos(text(form, "amount"));
  if (!amount) return { error: "Escribe un tope mayor que cero." };
  const { error } = await supabase.from("budgets").upsert({ category, amount }, { onConflict: "user_id,category" });
  if (error) return { error: missingTable(error.message, "0007") ?? `No se pudo guardar: ${error.message}` };
  revalidatePath("/", "layout");
  return { message: `Presupuesto de ${category} guardado.` };
}

export async function deleteBudget(form: FormData) {
  const supabase = await signedIn();
  const { error } = await supabase.from("budgets").delete().eq("id", text(form, "id"));
  if (error) throw new Error(`No se pudo eliminar: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function saveIncome(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await signedIn();
  const name = text(form, "name");
  if (!name) return { error: "Ponle un nombre al ingreso." };
  const editingId = text(form, "id");
  const { data: current } = editingId ? await supabase.from("incomes").select("*").eq("id", editingId).maybeSingle() : { data: null };
  const before = { every: current?.every as Every | undefined, start: current?.starts_on as string | null | undefined };
  // «Algunos meses» and «una sola vez» are monthly: their day, and no periodicity.
  const fixed = (text(form, "repeat") || "monthly") === "monthly";
  const monthlyDay = optionalDay(form, "day");
  if (!fixed && (monthlyDay === null || monthlyDay === "invalid")) return { error: "El día debe estar entre 1 y 31." };
  const schedule = fixed
    ? readSchedule(form, { every: "every", day: "day", start: "starts_on" }, before, halfStart(todayInBogota()))
    : { every: "monthly" as const, day: monthlyDay as number, start: null };
  if ("error" in schedule) return schedule;
  const day = schedule.day;
  const amountRaw = text(form, "amount");
  const amount = amountRaw ? parsePesos(amountRaw) : null;
  if (amountRaw && !amount) return { error: "El valor no es válido." };
  const repeat = text(form, "repeat") || "monthly";
  const once_month = repeat === "once" ? text(form, "once_month") : null;
  if (once_month !== null && !MONTH.test(once_month)) return { error: "Elige el mes en que llega." };
  if (once_month !== null && once_month < todayInBogota().slice(0, 7)) return { error: "Ese mes ya pasó. Si ya lo recibiste, regístralo como ingreso en Movimientos." };
  const months = repeat === "some" ? form.getAll("months").map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12) : [];
  if (repeat === "some" && months.length === 0) return { error: "Marca los meses en que llega." };
  const account_id = text(form, "account_id") || null;
  if (account_id) {
    const { data: target } = await supabase.from("accounts").select("kind").eq("id", account_id).maybeSingle();
    if (!target || isDebt(target)) return { error: "El ingreso debe llegar a una cuenta de ahorros o a tu efectivo." };
  }
  const row = {
    name,
    day,
    amount,
    account_id,
    months: months.length === 0 || months.length === 12 ? null : [...new Set(months)].sort((a, b) => a - b),
    // Only sent for a one-time income (so recurring ones keep working before migration 0008 runs),
    // or cleared when an edit turns a one-time extra into a recurring income.
    ...(once_month ? { once_month } : text(form, "id") ? { once_month: null } : {}),
    // Only when it is or was not plain monthly, so saving keeps working before migration 0019.
    ...(schedule.every !== "monthly" || (before.every && before.every !== "monthly") ? { every: schedule.every, starts_on: schedule.start } : {}),
  };
  const id = text(form, "id");
  const { error } = id ? await supabase.from("incomes").update(row).eq("id", id) : await supabase.from("incomes").insert(row);
  if (error && periodMissing(error.message)) return { error: periodMissing(error.message)! };
  if (error && /\bevery\b|starts_on/i.test(error.message)) return { error: "Falta ejecutar la migración 0019 en Supabase." };
  if (error) return { error: missingTable(error.message, once_month ? "0008" : "0007") ?? `No se pudo guardar: ${error.message}` };
  revalidatePath("/", "layout");
  return { message: once_month ? `${name} quedó para ${once_month}.` : `${name} quedó programado.` };
}

export async function deleteIncome(form: FormData) {
  const supabase = await signedIn();
  const { error } = await supabase.from("incomes").delete().eq("id", text(form, "id"));
  if (error) throw new Error(`No se pudo eliminar: ${error.message}`);
  revalidatePath("/", "layout");
}
