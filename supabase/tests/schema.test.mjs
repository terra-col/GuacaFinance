// Runs the real migrations in an in-process Postgres (PGlite) with a minimal
// stand-in for Supabase's auth schema and roles, then exercises RLS and the
// token-gated functions the way the app and the iPhone Shortcut reach them.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const dir = new URL("../migrations/", import.meta.url);
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
`);
for (const file of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(file, dir), "utf8"));
await db.exec("grant usage on schema public to anon, authenticated");

const ANA = "00000000-0000-0000-0000-00000000000a";
const BETO = "00000000-0000-0000-0000-00000000000b";
await db.exec(`insert into auth.users values ('${ANA}'), ('${BETO}')`);

const as = async (user, sql, params = []) => {
  await db.exec(`reset role; set request.jwt.sub = '${user ?? ""}'; set role ${user ? "authenticated" : "anon"}`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
};
const hash = (token) => createHash("sha256").update(token).digest("hex");

const [visa] = await as(ANA, "insert into accounts (kind, name, opening_balance, due_day, wallet_card_name) values ('credit_card', 'Visa', 100, 20, 'Visa Oro') returning id");
const [betoCard] = await as(BETO, "insert into accounts (kind, name, wallet_card_name) values ('credit_card', 'Master', 'Visa Oro') returning id");
await as(ANA, "insert into api_tokens (kind, token_hash) values ('wallet', $1), ('calendar', $2)", [hash("w-ana"), hash("c-ana")]);

const [internet] = await as(ANA, "insert into bills (name, amount, due_day, category) values ('Internet', 90000, 5, 'Hogar') returning id");
const [betoBill] = await as(BETO, "insert into bills (name, due_day) values ('Luz', 12) returning id");

test("bills: a movement can reference the user's own bill but not someone else's", async () => {
  await assert.rejects(as(ANA, "insert into transactions (account_id, kind, amount, bill_id) values ($1, 'expense', 5, $2)", [visa.id, betoBill.id]), /row-level security/);
  const rows = await as(ANA, "insert into transactions (account_id, kind, amount, bill_id) values ($1, 'expense', 5, $2) returning id", [visa.id, internet.id]);
  await as(ANA, "delete from transactions where id = $1", [rows[0].id]);
  assert.equal((await as(BETO, "select * from bills")).length, 1);
});

test("a user only sees their own accounts, and a visitor without a session sees none", async () => {
  assert.equal((await as(ANA, "select * from accounts")).length, 1);
  await assert.rejects(as(null, "select * from accounts"), /permission denied/);
});

test("RLS: a movement cannot point at someone else's account", async () => {
  await assert.rejects(as(ANA, "insert into transactions (account_id, kind, amount) values ($1, 'expense', 5)", [betoCard.id]), /row-level security/);
});

const ingest = (token, card, merchant, amount) =>
  as(null, "select wallet_ingest($1, $2, $3, $4) as r", [token, card, merchant, amount]).then((rows) => rows[0].r);

test("wallet_ingest: a bad token gets nothing and writes nothing", async () => {
  assert.equal(await ingest("nope", "Visa Oro", "Éxito", 5000), null);
  assert.equal(await ingest("c-ana", "Visa Oro", "Éxito", 5000), null, "a calendar token is not a wallet token");
  assert.equal((await as(ANA, "select * from transactions")).length, 0);
});

test("wallet_ingest: a known card posts an expense on the owner's account, matched case-insensitively", async () => {
  assert.deepEqual(await ingest("w-ana", " visa oro ", "Éxito", 85000), { status: "posted", category: null });
  const [tx] = await as(ANA, "select * from transactions");
  assert.deepEqual([tx.account_id, tx.kind, Number(tx.amount), tx.description, tx.source], [visa.id, "expense", 85000, "Éxito", "wallet"]);
  assert.equal((await as(BETO, "select * from transactions")).length, 0, "Beto's card has the same Wallet name but is untouched");
});

test("wallet_ingest: an immediate repeat is a duplicate", async () => {
  assert.deepEqual(await ingest("w-ana", "Visa Oro", "Éxito", 85000), { status: "duplicate" });
  assert.equal((await as(ANA, "select * from transactions")).length, 1);
});

test("wallet_ingest: reuses the category last given to that merchant", async () => {
  await as(ANA, "update transactions set category = 'Mercado'");
  assert.deepEqual(await ingest("w-ana", "Visa Oro", "éxito", 12000), { status: "posted", category: "Mercado" });
});

test("wallet_ingest: zero amount or unknown card goes to the review inbox, not the balance", async () => {
  assert.deepEqual(await ingest("w-ana", "Visa Oro", "", 0), { status: "review" });
  assert.deepEqual(await ingest("w-ana", "Tarjeta nueva", "Rappi", 30000), { status: "review" });
  const inbox = await as(ANA, "select card, merchant, amount from wallet_inbox order by received_at");
  assert.deepEqual(inbox.map((r) => [r.card, r.merchant, r.amount === null ? null : Number(r.amount)]), [
    ["Visa Oro", null, null],
    ["Tarjeta nueva", "Rappi", 30000],
  ]);
  assert.equal((await as(ANA, "select * from transactions")).length, 2);
});

test("calendar_feed: only the token owner's debts with a due day, and no balances", async () => {
  const rows = await as(null, "select * from calendar_feed('c-ana')");
  assert.deepEqual(rows.map((r) => [r.name, r.kind, r.due_day]), [["Internet", "bill", 5], ["Visa", "credit_card", 20]]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["due_day", "every", "id", "kind", "monthly_payment", "name", "starts_on"]);
  assert.equal((await as(null, "select * from calendar_feed('w-ana')")).length, 0);
});

test("token_owner is not callable from outside", async () => {
  await assert.rejects(as(null, "select token_owner('w-ana', 'wallet')"), /permission denied/);
});

test("two accounts of one user cannot share a Wallet card name", async () => {
  await assert.rejects(as(ANA, "insert into accounts (kind, name, wallet_card_name) values ('savings', 'Débito', 'VISA ORO')"), /duplicate key/);
});

test("card look: color, last 4 digits and logo are validated", async () => {
  const set = (col, value) => as(ANA, `update accounts set ${col} = $1 where id = $2`, [value, visa.id]);
  await set("color", "#6D4AFF");
  await set("last4", "4417");
  await set("logo", "data:image/png;base64,iVBORw0KGgo=");
  await set("original_amount", 20000000);
  await assert.rejects(set("color", "red"), /check constraint/);
  await assert.rejects(set("last4", "44a7"), /check constraint/);
  await assert.rejects(set("logo", "https://example.com/logo.png"), /check constraint/, "only uploaded images, never a link to fetch");
  await assert.rejects(set("logo", "data:image/svg+xml;base64,PHN2Zz4="), /check constraint/, "no SVG: it can carry scripts");
  await assert.rejects(set("logo", "data:image/png;base64," + "A".repeat(150000)), /check constraint/);
  await assert.rejects(set("original_amount", 0), /check constraint/);
  const [row] = await as(ANA, "select color, last4 from accounts where id = $1", [visa.id]);
  assert.deepEqual([row.color, row.last4], ["#6D4AFF", "4417"]);
});

test("cash accounts are allowed and can fund a payment to a debt", async () => {
  const [cash] = await as(ANA, "insert into accounts (kind, name, opening_balance) values ('cash', 'Billetera', 300000) returning id");
  await as(ANA, "insert into transactions (account_id, source_account_id, kind, amount) values ($1, $2, 'payment', 50000)", [visa.id, cash.id]);
  await assert.rejects(as(ANA, "insert into accounts (kind, name) values ('crypto', 'X')"), /check constraint/);
});

test("goals: a save goal needs an amount, a payoff goal needs one's own debt", async () => {
  const [goal] = await as(ANA, "insert into goals (kind, name, target_amount, target_date) values ('save', 'Armario', 2000000, '2027-02-01') returning id");
  await as(ANA, "insert into goal_deposits (goal_id, amount) values ($1, 300000)", [goal.id]);
  await as(ANA, "insert into goals (kind, name, account_id, target_date, start_balance) values ('payoff', 'Visa en cero', $1, '2027-04-30', 100)", [visa.id]);
  await assert.rejects(as(ANA, "insert into goals (kind, name, target_date) values ('save', 'Sin monto', '2027-01-01')"), /check constraint/);
  await assert.rejects(as(ANA, "insert into goals (kind, name, account_id, target_date) values ('payoff', 'Ajena', $1, '2027-01-01')", [betoCard.id]), /row-level security/);
  await assert.rejects(as(BETO, "insert into goal_deposits (goal_id, amount) values ($1, 5)", [goal.id]), /row-level security/);
  assert.equal((await as(BETO, "select * from goals")).length, 0);
});

test("budgets: one per category per user", async () => {
  await as(ANA, "insert into budgets (category, amount) values ('Ocio', 1200000)");
  await assert.rejects(as(ANA, "insert into budgets (category, amount) values ('Ocio', 1)"), /duplicate key/);
  await as(BETO, "insert into budgets (category, amount) values ('Ocio', 10)");
  assert.equal((await as(ANA, "select * from budgets")).length, 1);
});

test("skips: one per item and month, month format checked", async () => {
  await as(ANA, "insert into checklist_skips (item_type, item_id, month, note) values ('debt', $1, '2026-11', 'Rediferida')", [visa.id]);
  await assert.rejects(as(ANA, "insert into checklist_skips (item_type, item_id, month) values ('debt', $1, '2026-11')", [visa.id]), /duplicate key/);
  await assert.rejects(as(ANA, "insert into checklist_skips (item_type, item_id, month) values ('debt', $1, '2026-13')", [visa.id]), /check constraint/);
});

test("incomes: months must be real months; a received income must be one's own", async () => {
  const [salary] = await as(ANA, "insert into incomes (name, amount, day) values ('Salario', 7000000, 30) returning id");
  await as(ANA, "insert into incomes (name, amount, day, months) values ('Prima', 3000000, 20, '{6,12}')");
  await assert.rejects(as(ANA, "insert into incomes (name, day, months) values ('X', 1, '{13}')"), /check constraint/);
  const [cash] = await as(ANA, "select id from accounts where kind = 'cash' limit 1");
  await as(ANA, "insert into transactions (account_id, kind, amount, income_id) values ($1, 'income', 7000000, $2)", [cash.id, salary.id]);
  const [beto] = await as(BETO, "insert into incomes (name, day) values ('Ajeno', 1) returning id");
  await assert.rejects(as(ANA, "insert into transactions (account_id, kind, amount, income_id) values ($1, 'income', 1, $2)", [cash.id, beto.id]), /row-level security/);
});

test("credit detail: term, first month, rate type and refinanced are validated", async () => {
  const [loan] = await as(ANA, "insert into accounts (kind, name, opening_balance) values ('loan', 'Vehículo', 30000000) returning id");
  await as(ANA, "update accounts set term_months = 60, first_due_month = '2025-03', rate_type = 'variable', rate_reference = 'IBR + 6', refinanced = true where id = $1", [loan.id]);
  const [row] = await as(ANA, "select term_months, first_due_month, rate_type, refinanced from accounts where id = $1", [loan.id]);
  assert.deepEqual([row.term_months, row.first_due_month, row.rate_type, row.refinanced], [60, "2025-03", "variable", true]);
  const bad = (sql) => assert.rejects(as(ANA, sql, [loan.id]), /check constraint/);
  await bad("update accounts set term_months = 0 where id = $1");
  await bad("update accounts set first_due_month = '2025-13' where id = $1");
  await bad("update accounts set rate_type = 'mixta' where id = $1");
});

test("card purchases: only on one's own credit cards", async () => {
  const insert = (user, account) =>
    as(user, "insert into card_purchases (account_id, description, amount, installments, first_due_month) values ($1, 'Televisor', 2400000, 12, '2026-09') returning id", [account]);
  await insert(ANA, visa.id);
  await assert.rejects(insert(ANA, betoCard.id), /row-level security/, "someone else's card");
  const [savings] = await as(ANA, "insert into accounts (kind, name) values ('savings', 'Nómina') returning id");
  await assert.rejects(insert(ANA, savings.id), /row-level security/, "only credit cards have purchases in instalments");
  await assert.rejects(as(ANA, "insert into card_purchases (account_id, description, amount, installments, first_due_month) values ($1, 'X', 1, 0, '2026-09')", [visa.id]), /check constraint/);
  assert.equal((await as(BETO, "select * from card_purchases")).length, 0);
});

test("incomes: a one-time income has one month, never a yearly pattern too", async () => {
  await as(ANA, "insert into incomes (name, amount, day, once_month) values ('Horas extra', 450000, 30, '2026-12')");
  await assert.rejects(as(ANA, "insert into incomes (name, day, once_month) values ('X', 1, '2026-13')"), /check constraint/);
  await assert.rejects(as(ANA, "insert into incomes (name, day, once_month, months) values ('X', 1, '2026-12', '{12}')"), /check constraint/);
});

test("goal plans: amount and day go together, the income must be one's own, and goals can be skipped", async () => {
  const [salary] = await as(ANA, "select id from incomes where name = 'Salario'");
  const [betoIncome] = await as(BETO, "select id from incomes limit 1");
  const [closet] = await as(ANA, "insert into goals (kind, name, target_amount, target_date, plan_amount, plan_day, plan_income_id) values ('save', 'Armario', 1200000, '2027-06-30', 100000, 30, $1) returning id", [salary.id]);
  await assert.rejects(as(ANA, "insert into goals (kind, name, target_amount, target_date, plan_amount) values ('save', 'X', 1, '2027-01-01', 100)"), /check constraint/, "an amount without a day");
  await assert.rejects(as(ANA, "insert into goals (kind, name, target_amount, target_date, plan_amount, plan_day) values ('save', 'X', 1, '2027-01-01', 100, 32)"), /check constraint/);
  await assert.rejects(as(ANA, "update goals set plan_income_id = $1 where id = $2", [betoIncome.id, closet.id]), /row-level security/, "someone else's income");
  await as(ANA, "insert into checklist_skips (item_type, item_id, month) values ('goal', $1, '2026-12')", [closet.id]);
});

test("goal plans: a one-time goal has no monthly plan", async () => {
  await as(ANA, "insert into goals (kind, name, target_amount, target_date, plan_once) values ('save', 'Deuda JuanFe', 800000, '2026-12-31', true)");
  await assert.rejects(as(ANA, "insert into goals (kind, name, target_amount, target_date, plan_once, plan_amount, plan_day) values ('save', 'X', 1, '2027-01-01', true, 100, 5)"), /check constraint/);
});

test("favorite account: one per person, and only one that holds money", async () => {
  const [nomina] = await as(ANA, "insert into accounts (kind, name, favorite) values ('savings', 'Nómina fav', true) returning id");
  await assert.rejects(as(ANA, "insert into accounts (kind, name, favorite) values ('cash', 'Billetera fav', true)"), /duplicate key/, "a second favorite");
  await assert.rejects(as(ANA, "update accounts set favorite = true where id = $1", [visa.id]), /check constraint|duplicate key/, "a card cannot be the favorite");
  await as(BETO, "insert into accounts (kind, name, favorite) values ('savings', 'De Beto', true)");
  await as(ANA, "update accounts set favorite = false where id = $1", [nomina.id]);
});

test("paid for another month: the month is optional and must be a real month", async () => {
  const [row] = await as(ANA, "insert into transactions (account_id, kind, amount, bill_id, occurred_on, for_month) values ($1, 'expense', 90000, $2, '2026-11-30', '2026-12') returning for_month", [visa.id, internet.id]);
  assert.equal(row.for_month, "2026-12");
  await assert.rejects(as(ANA, "insert into transactions (account_id, kind, amount, for_month) values ($1, 'expense', 1, '2026-13')", [visa.id]), /check constraint/);
  const [closet] = await as(ANA, "select id from goals where name = 'Armario'");
  await as(ANA, "insert into goal_deposits (goal_id, amount, occurred_on, for_month) values ($1, 100000, '2026-11-30', '2026-12')", [closet.id]);
  await assert.rejects(as(ANA, "insert into goal_deposits (goal_id, amount, for_month) values ($1, 1, '26-12')", [closet.id]), /check constraint/);
});

test("phone login: the phone follows the profile, one account per number, and only the server key gets the email", async () => {
  const KEY = "llave-de-prueba";
  await db.exec(`insert into private.app_keys (name, hash) values ('login', encode(sha256('${KEY}'::bytea), 'hex'))`);
  await db.exec(`update auth.users set email = 'ana@example.com', email_confirmed_at = now(), raw_user_meta_data = '{"phone": "+573001234567"}' where id = '${ANA}'`);
  await db.exec(`update auth.users set email = 'beto@example.com', raw_user_meta_data = '{"phone": "+573001234567"}' where id = '${BETO}'`);

  const email = async (phone, key = KEY) => (await as(null, "select public.phone_login_email($1, $2) as email", [phone, key]))[0].email;
  assert.equal(await email("+573001234567"), "ana@example.com");
  assert.equal(await email("+573009999999"), null);
  await assert.rejects(email("+573001234567", "otra"), /not allowed/, "without the server key");
  await assert.rejects(as(null, "select * from private.phones"), /permission denied/, "the table is not reachable");

  const inUse = async (phone, user) => (await as(null, "select public.phone_in_use($1, $2, $3) as used", [phone, KEY, user]))[0].used;
  assert.equal(await inUse("+573001234567", BETO), true, "Ana has it, so Beto could not take it");
  assert.equal(await inUse("+573001234567", ANA), false, "it is Ana's own");

  // An unverified email never logs in by phone; a changed phone moves with the profile.
  await db.exec(`update auth.users set email_confirmed_at = null where id = '${ANA}'`);
  assert.equal(await email("+573001234567"), null);
  await db.exec(`update auth.users set email_confirmed_at = now(), raw_user_meta_data = '{"phone": "+573111111111"}' where id = '${ANA}'`);
  assert.equal(await email("+573111111111"), "ana@example.com");
  assert.equal(await email("+573001234567"), null, "the old number is free again");
});

test("account order: a position per account, never negative, only on one's own", async () => {
  await as(ANA, "update accounts set position = 2 where id = $1", [visa.id]);
  assert.equal((await as(ANA, "select position from accounts where id = $1", [visa.id]))[0].position, 2);
  await assert.rejects(as(ANA, "update accounts set position = -1 where id = $1", [visa.id]), /check constraint/);
  await as(BETO, "update accounts set position = 0 where id = $1", [visa.id]);
  assert.equal((await as(ANA, "select position from accounts where id = $1", [visa.id]))[0].position, 2, "Beto cannot reorder Ana's cards");
});

test("periodicity: monthly by default, the rest need a date, and only known ones", async () => {
  const [plain] = await as(ANA, "insert into bills (name, due_day) values ('Agua', 9) returning every, starts_on");
  assert.deepEqual([plain.every, plain.starts_on], ["monthly", null], "a bill saved as before stays monthly");
  await as(ANA, "insert into bills (name, due_day, every, starts_on) values ('Universidad', 15, 'semiannual', '2027-01-15')");
  await assert.rejects(as(ANA, "insert into bills (name, due_day, every) values ('X', 15, 'quarterly')"), /check constraint/, "no date");
  await assert.rejects(as(ANA, "insert into bills (name, due_day, every, starts_on) values ('X', 15, 'weekly', '2027-01-15')"), /check constraint/);
  const [closet] = await as(ANA, "select id, plan_every from goals where name = 'Armario'");
  assert.equal(closet.plan_every, "monthly");
  await assert.rejects(as(ANA, "update goals set plan_every = 'daily' where id = $1", [closet.id]), /check constraint/);
});

test("periodicity: one skip per date, each person their own, none without a session", async () => {
  const sql = "insert into date_skips (item_type, item_id, for_date) values ('bill', $1, '2026-11-15')";
  await as(ANA, sql, [internet.id]);
  await assert.rejects(as(ANA, sql, [internet.id]), /duplicate key/);
  await as(ANA, "insert into date_skips (item_type, item_id, for_date) values ('bill', $1, '2026-11-30')", [internet.id]);
  assert.equal((await as(BETO, "select * from date_skips")).length, 0);
  await assert.rejects(as(ANA, "insert into date_skips (user_id, item_type, item_id, for_date) values ($1, 'bill', $2, '2026-12-15')", [BETO, internet.id]), /row-level security/);
  await assert.rejects(as(null, "select * from date_skips"), /permission denied/);
});

test("periodicity: the calendar feed still works with its token only, and carries the periodicity", async () => {
  const rows = await as(null, "select * from calendar_feed('c-ana')");
  assert.equal(rows.find((r) => r.name === "Universidad").every, "semiannual");
  assert.equal(rows.find((r) => r.name === "Visa").every, "monthly");
  assert.equal((await as(null, "select * from calendar_feed('nope')")).length, 0);
});
