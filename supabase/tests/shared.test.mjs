// Shared expenses are the one place where people see each other's rows, so these tests attack it.
// Its own database, with Supabase's default privileges (everything in public granted to anon and
// authenticated): the migration's revokes are what has to hold.
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
  grant usage on schema auth, public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);
for (const file of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(file, dir), "utf8"));

const [ANA, BETO, CARO, EVA] = ["a", "b", "c", "e"].map((c) => `00000000-0000-0000-0000-00000000000${c}`);
await db.exec(`insert into auth.users (id) values ('${ANA}'), ('${BETO}'), ('${CARO}'), ('${EVA}')`);

const as = async (user, sql, params = []) => {
  await db.exec(`reset role; set request.jwt.sub = '${user ?? ""}'; set role ${user ? "authenticated" : "anon"}`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
};
const value = async (...args) => Object.values((await as(...args))[0])[0];
const hash = (token) => createHash("sha256").update(token).digest("hex");
const account = (user, kind = "savings") => value(user, "insert into accounts (kind, name, opening_balance) values ($1, 'Cuenta', 1000000) returning id", [kind]);

async function group() {
  const id = await value(ANA, "select shared_create_group('Cena', 'Ana', array['Beto', 'Caro'])");
  const members = await as(ANA, "select id, name from shared_members where group_id = $1", [id]);
  const of = Object.fromEntries(members.map((m) => [m.name, m.id]));
  for (const [user, name] of [[BETO, "Beto"]]) {
    const token = `token-${id}-${name}`;
    await as(ANA, "select shared_invite($1, $2)", [of[name], hash(token)]);
    await as(user, "select shared_join($1)", [token]);
  }
  return { id, ...of };
}
const add = (user, g, { kind = "expense", amount = 300000, by = g.Ana, shares, account: acc = null, tx = null, category = "Restaurantes" } = {}) =>
  value(user, "select shared_add_entry($1, $2, 'Cena', $3, $4, $5, '2026-11-22', $6, $7, $8)", [
    g.id, kind, category, amount, by,
    JSON.stringify(shares ?? [g.Ana, g.Beto, g.Caro].map((member_id) => ({ member_id, amount: amount / 3 }))),
    acc, tx,
  ]);

test("shared: an outsider sees nothing and can do nothing in a group", async () => {
  const g = await group();
  const entry = await add(ANA, g);
  for (const table of ["shared_groups", "shared_members", "shared_entries", "shared_shares", "shared_links"]) {
    assert.equal((await as(EVA, `select * from ${table}`)).length, 0, table);
  }
  await assert.rejects(add(EVA, g), /No haces parte/);
  await assert.rejects(as(EVA, "select shared_add_member($1, 'Eva')", [g.id]), /No haces parte/);
  await assert.rejects(as(EVA, "select shared_remove_member($1)", [g.Caro]), /No haces parte/);
  await assert.rejects(as(EVA, "select shared_delete_group($1)", [g.id]), /No haces parte/);
  await assert.rejects(as(EVA, "select shared_invite($1, $2)", [g.Caro, hash("eva")]), /No haces parte/);
  await assert.rejects(as(EVA, "select shared_delete_entry($1)", [entry]), /No haces parte/);
  await assert.rejects(as(EVA, "select shared_record($1, $2)", [entry, await account(EVA)]), /No haces parte/);
});

test("shared: without a session nothing is readable or callable", async () => {
  for (const table of ["shared_groups", "shared_members", "shared_entries", "shared_shares", "shared_links"]) {
    await assert.rejects(as(null, `select * from ${table}`), /permission denied/, table);
  }
  await assert.rejects(as(null, "select shared_create_group('X', 'Yo', array['Otro'])"), /permission denied/);
  await assert.rejects(as(null, "select shared_invite_preview('x')"), /permission denied/);
  await assert.rejects(as(null, "select shared_join('x')"), /permission denied/);
});

test("shared: not even a member writes the tables directly", async () => {
  const g = await group();
  const entry = await add(ANA, g);
  const bank = await account(BETO);
  const tx = await value(BETO, "insert into transactions (account_id, kind, amount) values ($1, 'expense', 300000) returning id", [bank]);
  for (const [sql, params] of [
    ["insert into shared_members (group_id, user_id, name) values ($1, auth.uid(), 'Intruso')", [g.id]],
    ["update shared_members set user_id = auth.uid() where id = $1", [g.Caro]],
    ["update shared_entries set amount = 1 where id = $1", [entry]],
    ["delete from shared_entries where id = $1", [entry]],
    ["update shared_shares set amount = 1 where entry_id = $1", [entry]],
    ["insert into shared_links (tx_id, entry_id, user_id, created_tx) values ($1, $2, auth.uid(), true)", [tx, entry]],
    ["select * from private.shared_invites", []],
    ["select private.shared_attach($1, null, $2)", [entry, tx]],
  ]) {
    await assert.rejects(as(BETO, sql, params), /permission denied/, sql);
  }
});

test("shared: members see the group, never each other's accounts, movements or links", async () => {
  const g = await group();
  const bank = await account(ANA);
  const entry = await add(ANA, g, { account: bank });
  assert.equal((await as(BETO, "select * from shared_shares where entry_id = $1", [entry])).length, 3);
  assert.equal((await as(BETO, "select * from accounts where id = $1", [bank])).length, 0);
  assert.equal((await as(BETO, "select * from transactions where account_id = $1", [bank])).length, 0);
  assert.equal((await as(BETO, "select * from shared_links where entry_id = $1", [entry])).length, 0);
  const [link] = await as(ANA, "select t.kind, t.amount, l.created_tx from shared_links l join transactions t on t.id = l.tx_id where l.entry_id = $1", [entry]);
  assert.deepEqual([link.kind, Number(link.amount), link.created_tx], ["expense", 300000, true]);
});

test("shared: nobody moves someone else's money", async () => {
  const g = await group();
  const anas = await account(ANA);
  const anasTx = await value(ANA, "insert into transactions (account_id, kind, amount) values ($1, 'expense', 300000) returning id", [anas]);
  await assert.rejects(add(BETO, g, { by: g.Beto, account: anas }), /tus cuentas/);
  await assert.rejects(add(BETO, g, { by: g.Beto, tx: anasTx }), /no se puede dividir/);
  await assert.rejects(add(BETO, g, { by: g.Ana, account: await account(BETO) }), /Solo quien pagó/);
  await assert.rejects(add(ANA, g, { account: await account(ANA, "loan") }), /tus cuentas/);
});

test("shared: shares add up, are positive, unique and from the group", async () => {
  const g = await group();
  const other = await group();
  const bad = [
    [{ member_id: g.Ana, amount: 299999 }],
    [{ member_id: g.Ana, amount: 400000 }, { member_id: g.Beto, amount: -100000 }],
    [{ member_id: g.Ana, amount: 150000 }, { member_id: g.Ana, amount: 150000 }],
    [{ member_id: other.Caro, amount: 300000 }],
    [{ member_id: null, amount: 300000 }],
    [],
  ];
  for (const shares of bad) await assert.rejects(add(ANA, g, { shares }), /partes/, JSON.stringify(shares));
  await assert.rejects(add(ANA, g, { by: other.Ana }), /no es del grupo/);
  await assert.rejects(add(ANA, g, { kind: "settlement", by: g.Beto, shares: [{ member_id: g.Beto, amount: 300000 }] }), /de una persona a otra/);
  await assert.rejects(add(ANA, g, { kind: "settlement" }), /de una persona a otra/);
});

test("shared: the adjustment category cannot hide an expense from the others", async () => {
  const g = await group();
  const entry = await add(ANA, g, { category: "Ajuste de saldo" });
  assert.equal(await value(BETO, "select category from shared_entries where id = $1", [entry]), null);
});

test("shared: a settlement is recorded by each side in their own account, once", async () => {
  const g = await group();
  const entry = await add(BETO, g, { kind: "settlement", amount: 100000, by: g.Beto, shares: [{ member_id: g.Ana, amount: 100000 }], account: await account(BETO) });
  await assert.rejects(as(ANA, "select shared_record($1, $2)", [entry, await account(ANA, "credit_card")]), /tus cuentas/);
  const bank = await account(ANA);
  await as(ANA, "select shared_record($1, $2)", [entry, bank]);
  assert.equal(await value(ANA, "select kind from transactions where account_id = $1", [bank]), "income");
  await assert.rejects(as(ANA, "select shared_record($1, $2)", [entry, bank]), /Ya lo registraste/);
  await assert.rejects(as(BETO, "select shared_delete_entry($1)", [entry]), /Otra persona/, "it would move Ana's balance");
});

test("shared: deleting undoes the movement it created, and keeps one that already existed", async () => {
  const g = await group();
  const bank = await account(ANA);
  const created = await add(ANA, g, { account: bank });
  await assert.rejects(as(BETO, "select shared_delete_entry($1)", [created]), /Solo quien lo registró/);
  await as(ANA, "select shared_delete_entry($1)", [created]);
  assert.equal((await as(ANA, "select * from transactions where account_id = $1", [bank])).length, 0);

  const tx = await value(ANA, "insert into transactions (account_id, kind, amount) values ($1, 'expense', 300000) returning id", [bank]);
  const divided = await add(ANA, g, { tx });
  await assert.rejects(add(ANA, g, { tx }), /ya está dividido/);
  await as(ANA, "select shared_delete_entry($1)", [divided]);
  assert.equal((await as(ANA, "select * from transactions where id = $1", [tx])).length, 1);
});

test("shared: an existing movement must be an expense of the same amount, never an adjustment", async () => {
  const g = await group();
  const bank = await account(ANA);
  const make = (kind, amount, category = null) => value(ANA, "insert into transactions (account_id, kind, amount, category) values ($1, $2, $3, $4) returning id", [bank, kind, amount, category]);
  await assert.rejects(add(ANA, g, { tx: await make("expense", 5000) }), /mismo del movimiento/);
  await assert.rejects(add(ANA, g, { tx: await make("income", 300000) }), /no se puede dividir/);
  await assert.rejects(add(ANA, g, { tx: await make("expense", 300000, "Ajuste de saldo") }), /no se puede dividir/);
});

test("shared: a linked movement keeps its amount, the rest can change", async () => {
  const g = await group();
  const bank = await account(ANA);
  await add(ANA, g, { account: bank });
  await assert.rejects(as(ANA, "update transactions set amount = 5 where account_id = $1", [bank]), /Compartidos/);
  await as(ANA, "update transactions set category = 'Ocio' where account_id = $1", [bank]);
});

test("shared: deleting one's account or movement leaves the group's expense intact", async () => {
  const g = await group();
  const bank = await account(ANA);
  const entry = await add(ANA, g, { account: bank });
  await as(ANA, "delete from accounts where id = $1", [bank]);
  assert.equal((await as(BETO, "select * from shared_entries where id = $1", [entry])).length, 1);
  assert.equal((await as(ANA, "select * from shared_links where entry_id = $1", [entry])).length, 0);
});

test("shared: invitations are single use, expire, and never take a second place", async () => {
  const g = await group();
  const token = `caro-${g.id}`;
  await as(ANA, "select shared_invite($1, $2)", [g.Caro, hash(token)]);
  assert.deepEqual(await as(CARO, "select * from shared_invite_preview($1)", [token]), [{ group_name: "Cena", member_name: "Caro" }]);
  assert.equal((await as(CARO, "select * from shared_entries where group_id = $1", [g.id])).length, 0, "a preview is not a membership");
  assert.equal(await value(ANA, "select shared_join($1)", [token]), g.id);
  assert.equal(await value(ANA, "select user_id from shared_members where id = $1", [g.Caro]), null, "Ana did not take Caro's place");

  await db.exec("update private.shared_invites set expires_at = now() - interval '1 minute'");
  await assert.rejects(as(CARO, "select shared_join($1)", [token]), /venció/);
  assert.equal((await as(CARO, "select * from shared_invite_preview($1)", [token])).length, 0);

  const fresh = `caro-2-${g.id}`;
  await as(ANA, "select shared_invite($1, $2)", [g.Caro, hash(fresh)]);
  await as(CARO, "select shared_join($1)", [fresh]);
  await assert.rejects(as(EVA, "select shared_join($1)", [fresh]), /venció|usó/);
  await assert.rejects(as(ANA, "select shared_invite($1, $2)", [g.Caro, hash("otro")]), /ya se unió/);
});

test("shared: people and groups with history are not deleted", async () => {
  const g = await group();
  const extra = await value(ANA, "select shared_add_member($1, 'Dani')", [g.id]);
  await assert.rejects(as(ANA, "select shared_add_member($1, ' dani ')", [g.id]), /duplicate key/);
  await as(ANA, "select shared_remove_member($1)", [extra]);
  await assert.rejects(as(ANA, "select shared_remove_member($1)", [g.Beto]), /ya se unió/);
  await assert.rejects(as(BETO, "select shared_delete_group($1)", [g.id]), /Solo quien creó/);
  const entry = await add(ANA, g);
  await assert.rejects(as(ANA, "select shared_remove_member($1)", [g.Caro]), /ya está en gastos/);
  await assert.rejects(as(ANA, "select shared_delete_group($1)", [g.id]), /tiene gastos/);
  await as(ANA, "select shared_delete_entry($1)", [entry]);
  await as(ANA, "select shared_delete_group($1)", [g.id]);
});

test("shared: deleting a user keeps the history of the others", async () => {
  const user = "00000000-0000-0000-0000-00000000000f";
  await db.exec(`insert into auth.users (id) values ('${user}')`);
  const g = await group();
  const spot = await value(ANA, "select shared_add_member($1, 'Fer')", [g.id]);
  await as(ANA, "select shared_invite($1, $2)", [spot, hash("fer")]);
  await as(user, "select shared_join('fer')");
  const entry = await add(user, g, { amount: 90000, by: spot, shares: [{ member_id: g.Ana, amount: 90000 }], account: await account(user) });
  await db.exec(`delete from auth.users where id = '${user}'`);
  assert.equal((await as(ANA, "select * from shared_entries where id = $1", [entry])).length, 1);
  assert.equal(await value(ANA, "select user_id from shared_members where id = $1", [spot]), null);
});

// ---- 0020: editing and contacts

const update = (user, entry, g, { amount = 300000, by = g.Ana, account: acc = null, shares, category = "Restaurantes", description = "Cena", date = "2026-11-22" } = {}) =>
  as(user, "select shared_update_entry($1, $2, $3, $4, $5, $6, $7, $8)", [
    entry, description, category, amount, by, date,
    JSON.stringify(shares ?? [g.Ana, g.Beto, g.Caro].map((member_id) => ({ member_id, amount: amount / 3 }))),
    acc,
  ]);
const movements = (user, acc) => as(user, "select * from transactions where account_id = $1", [acc]);

test("edit: outsiders, anonymous and uninvolved members cannot", async () => {
  const g = await group();
  const entry = await add(ANA, g);
  await assert.rejects(update(EVA, entry, g), /No haces parte/);
  await assert.rejects(update(null, entry, g), /permission denied/);
  await assert.rejects(update(BETO, entry, g), /Solo quien lo registró o quien pagó/);
  await assert.rejects(as(EVA, "select shared_rename_group($1, 'Mío')", [g.id]), /No haces parte/);
  await assert.rejects(as(EVA, "select shared_edit_person($1, 'X', null, null)", [g.Caro]), /No haces parte/);
  await assert.rejects(as(EVA, "select shared_add_person($1, 'X', null, null)", [g.id]), /No haces parte/);
});

test("edit: who paid can fix what someone else wrote down", async () => {
  const g = await group();
  const entry = await add(ANA, g, { by: g.Beto });
  await update(BETO, entry, g, { by: g.Beto, amount: 330000 });
  assert.equal(Number(await value(ANA, "select amount from shared_entries where id = $1", [entry])), 330000);
});

test("edit: one's own movement follows, with its moment and the category one gave it", async () => {
  const g = await group();
  const bank = await account(ANA);
  const entry = await add(ANA, g, { account: bank });
  await as(ANA, "update transactions set category = 'Ocio' where account_id = $1", [bank]);
  const [before] = await movements(ANA, bank);
  const other = await account(ANA);
  await update(ANA, entry, g, { amount: 360000, account: other });
  assert.equal((await movements(ANA, bank)).length, 0);
  const [after] = await movements(ANA, other);
  assert.deepEqual([after.id, Number(after.amount), after.category], [before.id, 360000, "Ocio"]);
  assert.deepEqual(after.created_at, before.created_at);
  await update(ANA, entry, g, { amount: 360000, category: "Mercado" });
  assert.equal((await movements(ANA, other))[0].category, "Mercado", "changed in the group: it follows");
});

test("edit: never moves someone else's money", async () => {
  const g = await group();
  const betos = await account(BETO);
  const entry = await add(ANA, g, { by: g.Beto });
  await as(BETO, "select shared_record($1, $2)", [entry, betos]);
  await assert.rejects(update(ANA, entry, g, { by: g.Beto, amount: 600000 }), /Otra persona ya lo registró/);
  await assert.rejects(update(ANA, entry, g, { by: g.Ana }), /Otra persona ya lo registró/);
  await update(ANA, entry, g, { by: g.Beto, shares: [{ member_id: g.Ana, amount: 300000 }] });
  assert.equal(Number((await movements(BETO, betos))[0].amount), 300000, "the split changed, not Beto's movement");

  const mine = await add(ANA, g, { account: await account(ANA) });
  await assert.rejects(update(ANA, mine, g, { account: betos }), /tus cuentas/);
});

test("edit: no longer the payer, the movement the group made goes and one's own stays", async () => {
  const g = await group();
  const made = await account(ANA);
  const first = await add(ANA, g, { account: made });
  await update(ANA, first, g, { by: g.Beto });
  assert.equal((await movements(ANA, made)).length, 0);

  const bank = await account(ANA);
  const tx = await value(ANA, "insert into transactions (account_id, kind, amount) values ($1, 'expense', 300000) returning id", [bank]);
  const second = await add(ANA, g, { tx });
  await update(ANA, second, g, { by: g.Caro });
  assert.equal((await movements(ANA, bank)).length, 1);
  assert.equal((await as(ANA, "select 1 from shared_links where tx_id = $1", [tx])).length, 0);
});

test("edit: which entries others recorded, and only to members", async () => {
  const g = await group();
  const entry = await add(ANA, g, { by: g.Beto });
  await as(BETO, "select shared_record($1, $2)", [entry, await account(BETO)]);
  assert.deepEqual(await value(ANA, "select shared_recorded_by_others($1)", [g.id]), [entry]);
  assert.deepEqual(await value(BETO, "select shared_recorded_by_others($1)", [g.id]), [], "one's own does not count");
  assert.deepEqual(await value(EVA, "select shared_recorded_by_others($1)", [g.id]), [], "an outsider learns nothing");
});

test("edit: shares keep their rules, and nothing changes when they fail", async () => {
  const g = await group();
  const other = await group();
  const entry = await add(ANA, g);
  for (const shares of [[{ member_id: g.Ana, amount: 1 }], [{ member_id: other.Caro, amount: 300000 }], []]) {
    await assert.rejects(update(ANA, entry, g, { shares }), /partes/);
  }
  assert.equal((await as(ANA, "select 1 from shared_shares where entry_id = $1", [entry])).length, 3);
  await update(ANA, entry, g, { category: "Ajuste de saldo" });
  assert.equal(await value(ANA, "select category from shared_entries where id = $1", [entry]), null);
});

test("edit: a settlement keeps who pays whom", async () => {
  const g = await group();
  const entry = await add(ANA, g, { kind: "settlement", amount: 100000, by: g.Beto, shares: [{ member_id: g.Ana, amount: 100000 }] });
  await update(ANA, entry, g, { amount: 90000, by: g.Caro, shares: [{ member_id: g.Caro, amount: 90000 }] });
  assert.equal(await value(ANA, "select paid_by from shared_entries where id = $1", [entry]), g.Beto);
  const [share] = await as(ANA, "select member_id, amount from shared_shares where entry_id = $1", [entry]);
  assert.deepEqual([share.member_id, Number(share.amount)], [g.Ana, 90000]);
});

test("edit: a linked movement still cannot drift from the group by itself", async () => {
  const g = await group();
  const bank = await account(ANA);
  await add(ANA, g, { account: bank });
  await assert.rejects(as(ANA, "update transactions set amount = 310000 where account_id = $1", [bank]), /edítalo allá/);
  await assert.rejects(as(ANA, "update transactions set kind = 'income' where account_id = $1", [bank]), /edítalo allá/);
});

test("groups and people: names; the one of someone who joined is theirs", async () => {
  const g = await group();
  await as(BETO, "select shared_rename_group($1, ' Viaje ')", [g.id]);
  assert.equal(await value(ANA, "select name from shared_groups where id = $1", [g.id]), "Viaje");
  await as(ANA, "select shared_edit_person($1, 'Beto Pérez', '+573001234567', null)", [g.Beto]);
  assert.equal(await value(ANA, "select name from shared_members where id = $1", [g.Beto]), "Beto", "only how Ana sees them");
  await as(ANA, "select shared_edit_person($1, 'Carolina', '+573111111111', null)", [g.Caro]);
  assert.equal(await value(BETO, "select name from shared_members where id = $1", [g.Caro]), "Carolina");
  await as(BETO, "select shared_edit_person($1, 'Alberto', null, null)", [g.Beto]);
  assert.equal(await value(ANA, "select name from shared_members where id = $1", [g.Beto]), "Alberto");
});

test("contacts: a phone is seen only by who saved it, and no table is written directly", async () => {
  const g = await group();
  await as(ANA, "select shared_edit_person($1, 'Caro', '+573222222222', null)", [g.Caro]);
  assert.equal((await as(ANA, "select phone from shared_contacts where member_id = $1", [g.Caro])).length, 1);
  assert.equal((await as(BETO, "select phone from shared_contacts where member_id = $1", [g.Caro])).length, 0);
  await assert.rejects(as(null, "select * from shared_contacts"), /permission denied/);
  await assert.rejects(as(BETO, "insert into shared_contacts (user_id, member_id, phone) values (auth.uid(), $1, '+573222222222')", [g.Caro]), /permission denied/);
  await assert.rejects(as(BETO, "insert into shared_requests (member_id, group_id, user_id) values ($1, $2, auth.uid())", [g.Caro, g.id]), /permission denied/);
  await assert.rejects(as(ANA, "select shared_edit_person($1, 'Caro', '300 abc', null)", [g.Caro]), /check constraint/);
});

test("requests: only someone I already share with, and nobody joins without accepting", async () => {
  const known = await group();
  const people = JSON.stringify([{ name: "Beto", phone: "+573001234567", known: known.Beto }, { name: "Dani", phone: null, known: null }]);
  const id = await value(ANA, "select shared_create_group_people('Finca', 'Ana', $1)", [people]);
  assert.equal((await as(BETO, "select * from shared_groups where id = $1", [id])).length, 0, "not in until accepted");
  const pending = (await as(BETO, "select * from shared_my_requests()")).find((r) => r.group_name === "Finca");
  assert.deepEqual([pending.member_name, pending.invited_by_name], ["Beto", "Ana"]);
  assert.equal((await as(EVA, "select * from shared_my_requests()")).length, 0);
  await assert.rejects(as(EVA, "select shared_respond($1, true)", [pending.member_id]), /ya no está/);
  assert.equal(await value(BETO, "select shared_respond($1, true)", [pending.member_id]), id);
  assert.equal((await as(BETO, "select * from shared_groups where id = $1", [id])).length, 1);

  const evas = await value(EVA, "select shared_create_group('De Eva', 'Eva', array['Alguien'])");
  await assert.rejects(as(EVA, "select shared_add_person($1, 'Beto', null, $2)", [evas, known.Beto]), /ya compartes un grupo/);
  await assert.rejects(as(ANA, "select shared_add_person($1, 'Otro Beto', null, $2)", [id, known.Beto]), /ya está en el grupo/);
  await assert.rejects(as(ANA, "select shared_edit_person($1, 'Caro', null, $2)", [known.Caro, known.Caro]), /ya compartes un grupo/);
});

test("requests: saying no leaves the place free", async () => {
  const known = await group();
  const id = await value(ANA, "select shared_create_group('Asado', 'Ana', array['Dani'])");
  const spot = await value(ANA, "select shared_add_person($1, 'Beto', null, $2)", [id, known.Beto]);
  assert.equal(await value(BETO, "select shared_respond($1, false)", [spot]), null);
  assert.equal(await value(ANA, "select user_id from shared_members where id = $1", [spot]), null);
  assert.equal((await as(BETO, "select * from shared_my_requests() where member_id = $1", [spot])).length, 0);
});

test("deleting a user also takes their contacts and requests", async () => {
  const user = "00000000-0000-0000-0000-000000000009";
  await db.exec(`insert into auth.users (id) values ('${user}')`);
  const id = await value(user, "select shared_create_group_people('Solo', 'Yo', $1)", [JSON.stringify([{ name: "Amigo", phone: "+573009999999", known: null }])]);
  assert.ok(id);
  await db.exec(`delete from auth.users where id = '${user}'`);
  assert.equal((await db.query("select 1 from shared_contacts where user_id = $1", [user])).rows.length, 0);
});
