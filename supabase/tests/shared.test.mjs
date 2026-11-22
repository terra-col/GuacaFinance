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

// ---- 0021: how it was divided

const saveExpense = (user, g, { entry = null, split = { mode: "percent", parts: [{ id: g.Ana, value: 10000 }] }, amount = 90000, shares = [{ member_id: g.Ana, amount }] } = {}) =>
  as(user, "select shared_save_expense($1, $2, 'Taxi', null, $3, $4, '2026-11-22', $5, $6) as id", [entry, g.id, amount, g.Ana, JSON.stringify(shares), split && JSON.stringify(split)]);

test("split: saved with the expense, under the same permissions", async () => {
  const g = await group();
  const entry = (await saveExpense(ANA, g))[0].id;
  assert.equal((await value(BETO, "select split from shared_entries where id = $1", [entry])).mode, "percent");
  await assert.rejects(saveExpense(EVA, g), /No haces parte/);
  await assert.rejects(saveExpense(EVA, g, { entry }), /No haces parte/);
  await assert.rejects(saveExpense(BETO, g, { entry }), /Solo quien lo registró o quien pagó/);
  await assert.rejects(saveExpense(null, g), /permission denied/);
  await assert.rejects(as(ANA, "update shared_entries set split = null where id = $1", [entry]), /permission denied/);
});

test("split: it never replaces the checked pesos, and only known ways are kept", async () => {
  const g = await group();
  await assert.rejects(saveExpense(ANA, g, { shares: [{ member_id: g.Ana, amount: 1 }] }), /sumar el total/);
  await assert.rejects(saveExpense(ANA, g, { split: { mode: "inventado", parts: [] } }), /check constraint/);
  await assert.rejects(saveExpense(ANA, g, { split: { parts: [] } }), /check constraint/);
  await assert.rejects(saveExpense(ANA, g, { split: { mode: "equal" } }), /check constraint/);
  assert.equal(await value(ANA, "select count(*)::int from shared_entries where group_id = $1", [g.id]), 0, "a failed one leaves nothing");
});

// ---- 0022: periods of any length

test("periods: the database takes the same as the app, and nothing else", async () => {
  const bill = (every) => as(ANA, "insert into bills (name, due_day, every, starts_on) values ('Seguro', 15, $1, '2026-11-15')", [every]);
  for (const every of ["monthly", "biweekly", "d3", "d99", "w1", "w2", "w52", "m4", "m12", "m99", "y1", "y10"]) await bill(every);
  for (const every of ["d1", "d2", "d100", "w0", "w53", "m1", "m2", "m3", "m6", "y11", "x2", "d3 "]) await assert.rejects(bill(every), /bills_every_check/, every);
  await assert.rejects(as(ANA, "insert into incomes (name, day, every, starts_on) values ('Salario', 15, 'z9', '2026-11-15')"), /incomes_every_check/);
});

// ---- 0023: invitations by phone, accounts between two, deleting, notices

const [DUE, FAKE] = ["7", "8"].map((c) => "00000000-0000-0000-0000-00000000000" + c);
await db.exec(
  "insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values " +
    "('" + DUE + "', 'dueno@example.com', now(), '{\"name\": \"Dario\", \"phone\": \"+573009998877\"}'), " +
    "('" + FAKE + "', 'sin@example.com', null, '{\"name\": \"Sin confirmar\", \"phone\": \"+573001112233\"}')",
);
const phoneGroup = async (phone = "+573009998877") => {
  const id = await value(ANA, "select shared_create_group_people('Grupo secreto', 'Ana', $1)", [JSON.stringify([{ name: "Dario", phone, known: null }])]);
  return { id, member: await value(ANA, "select id from shared_members where group_id = $1 and user_id is null", [id]) };
};
const invitesOf = (user) => as(user, "select * from shared_phone_invites()");

test("phone: shows who invites and nothing of the group; nobody gets in until the inviter confirms", async () => {
  const g = await phoneGroup();
  const found = await invitesOf(DUE);
  const invite = found[0];
  assert.deepEqual(Object.keys(invite).sort(), ["from_name", "id", "waiting"]);
  assert.equal(invite.from_name, "Ana");
  assert.ok(!JSON.stringify(found).includes("secreto"));
  assert.equal((await invitesOf(EVA)).length, 0);
  assert.equal((await as(ANA, "select * from shared_phone_claims()")).length, 0, "the inviter learns nothing before they accept");
  await assert.rejects(as(EVA, "select shared_phone_answer($1, true)", [invite.id]), /ya no está/);

  await as(DUE, "select shared_phone_answer($1, true)", [invite.id]);
  for (const table of ["shared_groups", "shared_members", "shared_entries"]) assert.equal((await as(DUE, "select * from " + table)).length, 0, table + ": still outside");
  await assert.rejects(as(DUE, "select shared_phone_confirm($1, true)", [invite.id]), /ya no está/, "nobody confirms themselves");
  await assert.rejects(as(EVA, "select shared_phone_confirm($1, true)", [invite.id]), /ya no está/);

  const claim = (await as(ANA, "select * from shared_phone_claims()")).find((c) => c.id === invite.id);
  assert.equal(claim.account_name, "Dario");
  assert.equal(claim.account_email, "du•••@example.com");
  assert.equal(await value(ANA, "select shared_phone_confirm($1, true)", [invite.id]), g.id);
  assert.equal((await as(DUE, "select * from shared_groups where id = $1", [g.id])).length, 1);
  assert.equal(await value(DUE, "select count(*)::int from shared_notices where group_id = $1 and kind = 'you_joined'", [g.id]), 1);
});

test("phone: an unconfirmed email gets nothing, and declining or rejecting leaves them out", async () => {
  await phoneGroup("+573001112233");
  assert.equal((await invitesOf(FAKE)).length, 0);
  const g = await phoneGroup();
  let invite = (await invitesOf(DUE))[0];
  await as(DUE, "select shared_phone_answer($1, false)", [invite.id]);
  assert.equal((await invitesOf(DUE)).length, 0);
  await as(ANA, "select shared_edit_person($1, 'Dario', '+573009998877', null)", [g.member]);
  invite = (await invitesOf(DUE))[0];
  await as(DUE, "select shared_phone_answer($1, true)", [invite.id]);
  await as(ANA, "select shared_phone_confirm($1, false)", [invite.id]);
  assert.equal((await as(DUE, "select * from shared_groups where id = $1", [g.id])).length, 0);
  assert.equal((await invitesOf(DUE)).length, 0);
});

test("phone: who changes number after accepting cannot be confirmed", async () => {
  const g = await phoneGroup();
  const [invite] = await invitesOf(DUE);
  await as(DUE, "select shared_phone_answer($1, true)", [invite.id]);
  await db.query("update auth.users set raw_user_meta_data = '{\"name\": \"Dario\"}' where id = $1", [DUE]);
  await assert.rejects(as(ANA, "select shared_phone_confirm($1, true)", [invite.id]), /ya no tiene ese celular/);
  assert.equal((await as(DUE, "select * from shared_groups where id = $1", [g.id])).length, 0);
});

test("phone: declining an invitation inside Guaca does not bring it back by phone", async () => {
  await db.query("update auth.users set raw_user_meta_data = $2 where id = $1", [DUE, JSON.stringify({ name: "Dario", phone: "+573009998877" })]);
  const first = await phoneGroup();
  for (const invite of await invitesOf(DUE)) {
    await as(DUE, "select shared_phone_answer($1, true)", [invite.id]);
    await as(ANA, "select shared_phone_confirm($1, true)", [invite.id]);
  }
  const known = await value(ANA, "select id from shared_members where group_id = $1 and id = $2", [first.id, first.member]);
  const id = await value(ANA, "select shared_create_group_people('Otro', 'Ana', $1)", [JSON.stringify([{ name: "Dario", phone: "+573009998877", known }])]);
  const member = await value(ANA, "select id from shared_members where group_id = $1 and user_id is null", [id]);
  await as(DUE, "select shared_respond($1, false)", [member]);
  assert.equal((await invitesOf(DUE)).length, 0);
});

test("phone and notices: nothing is readable or writable around the functions", async () => {
  for (const call of ["shared_phone_invites()", "shared_phone_claims()", "shared_pending_count()"]) await assert.rejects(as(null, "select * from " + call), /permission denied/, call);
  await assert.rejects(as(ANA, "select * from private.shared_phone_invites"), /permission denied/);
  await assert.rejects(as(ANA, "insert into shared_notices (user_id, kind) values ($1, 'expense')", [BETO]), /permission denied/);
  await assert.rejects(as(ANA, "update shared_groups set deleted_at = now()"), /permission denied/);
});

test("notices: for the others of the group, never for who did it nor outsiders", async () => {
  const g = await group();
  const entry = await add(ANA, g);
  const count = (user) => value(user, "select count(*)::int from shared_notices where group_id = $1 and entry_id = $2", [g.id, entry]);
  assert.deepEqual([await count(ANA), await count(BETO), await count(EVA)], [0, 1, 0]);
  assert.ok((await value(BETO, "select shared_pending_count()")) >= 1);
  await as(EVA, "select shared_read_notices(now() + interval '1 day')");
  assert.equal(await value(BETO, "select count(*)::int from shared_notices where entry_id = $1 and read_at is null", [entry]), 1);
  await as(BETO, "select shared_read_notices(now() + interval '1 day')");
  assert.equal(await value(BETO, "select shared_pending_count()"), 0);
});

test("between two: one per account, and never a third", async () => {
  const g = await group();
  const id = await value(ANA, "select shared_create_direct('Ana', 'Beto', null, $1)", [g.Beto]);
  assert.equal(await value(ANA, "select shared_create_direct('Ana', 'Beto', null, $1)", [g.Beto]), id);
  assert.equal(await value(ANA, "select direct from shared_groups where id = $1", [id]), true);
  await assert.rejects(as(ANA, "select shared_add_member($1, 'Caro')", [id]), /solo entre dos/);
  await assert.rejects(as(EVA, "select shared_create_direct('Eva', 'Beto', null, $1)", [g.Beto]), /ya compartes un grupo/);
});

test("deleting: history stays for the totals and the group takes no more writes", async () => {
  const g = await group();
  const acct = await account(ANA);
  const entry = await add(ANA, g, { shares: [{ member_id: g.Ana, amount: 300000 }], account: acct });
  await assert.rejects(as(EVA, "select shared_remove_group($1, false)", [g.id]), /No haces parte/);
  await assert.rejects(as(BETO, "select shared_remove_group($1, false)", [g.id]), /Solo quien creó/);
  await assert.rejects(as(ANA, "select shared_remove_group($1, true)", [g.id]), /no se puede borrar/);
  await as(ANA, "select shared_remove_group($1, false)", [g.id]);
  assert.equal((await as(BETO, "select * from shared_entries where id = $1", [entry])).length, 1);
  assert.equal(await value(ANA, "select count(*)::int from transactions where account_id = $1", [acct]), 1);
  assert.equal(await value(BETO, "select count(*)::int from shared_notices where group_id = $1 and kind = 'group_deleted'", [g.id]), 1);
  await assert.rejects(add(ANA, g), /fue eliminado/);
  await assert.rejects(as(ANA, "select shared_delete_entry($1)", [entry]), /fue eliminado/);
  await assert.rejects(as(BETO, "select shared_rename_group($1, 'Otro')", [g.id]), /fue eliminado/);
});

test("deleting: not with someone else's balance pending", async () => {
  const g = await group();
  await add(ANA, g);
  await assert.rejects(as(ANA, "select shared_remove_group($1, false)", [g.id]), /saldos pendientes/);
});

test("deleting a test of one's own: everything the group created goes, what one already had stays", async () => {
  const id = await value(ANA, "select shared_create_group('Prueba', 'Ana', array['Nadie'])");
  const me = await value(ANA, "select id from shared_members where group_id = $1 and user_id is not null", [id]);
  const acct = await account(ANA);
  const shares = JSON.stringify([{ member_id: me, amount: 9000 }]);
  const own = await value(ANA, "insert into transactions (account_id, kind, amount, occurred_on) values ($1, 'expense', 9000, '2026-11-22') returning id", [acct]);
  await as(ANA, "select shared_add_entry($1, 'expense', 'Creado', null, 9000, $2, '2026-11-22', $3, $4, null)", [id, me, shares, acct]);
  await as(ANA, "select shared_add_entry($1, 'expense', 'Mío', null, 9000, $2, '2026-11-22', $3, null, $4)", [id, me, shares, own]);
  await as(ANA, "select shared_remove_group($1, true)", [id]);
  assert.equal((await as(ANA, "select * from shared_groups where id = $1", [id])).length, 0);
  assert.deepEqual((await as(ANA, "select id from transactions where account_id = $1", [acct])).map((t) => t.id), [own]);
});

// ---- 0024: taking a person out, deleting a contact

/** A group where Beto paid exactly his own part: at zero, with history. */
async function groupWithHistory() {
  const g = await group();
  const entry = await add(BETO, g, { by: g.Beto, amount: 50000, shares: [{ member_id: g.Beto, amount: 50000 }], account: await account(BETO) });
  return { ...g, entry };
}

test("remove: only who may, and never with something pending", async () => {
  const g = await group();
  await assert.rejects(as(EVA, "select shared_remove_person($1)", [g.Caro]), /No haces parte/);
  await assert.rejects(as(null, "select shared_remove_person($1)", [g.Caro]), /permission denied/);
  await assert.rejects(as(ANA, "select shared_remove_person($1)", [g.Ana]), /contigo/);
  await assert.rejects(as(BETO, "select shared_remove_person($1)", [g.Ana]), /solo lo puede quitar quien creó/);
  await add(ANA, g);
  await assert.rejects(as(ANA, "select shared_remove_person($1)", [g.Beto]), /Primero salda/);
  await assert.rejects(as(ANA, "select shared_remove_person($1)", [g.Caro]), /Primero salda/);
});

test("remove: without history the place is deleted", async () => {
  const g = await group();
  await as(BETO, "select shared_remove_person($1)", [g.Caro]);
  assert.equal((await as(ANA, "select * from shared_members where id = $1", [g.Caro])).length, 0);
  await as(ANA, "select shared_remove_person($1)", [g.Beto]);
  for (const table of ["shared_members", "shared_entries"]) assert.equal((await as(BETO, "select * from " + table + " where group_id = $1", [g.id])).length, 0, table);
  assert.equal((await as(BETO, "select * from shared_groups where id = $1", [g.id])).length, 0);
});

test("remove: who leaves keeps what was, and reads nothing that comes after", async () => {
  const g = await groupWithHistory();
  await as(ANA, "select shared_remove_person($1)", [g.Beto]);
  assert.equal((await as(BETO, "select * from shared_entries where id = $1", [g.entry])).length, 1, "their past");
  assert.equal((await as(BETO, "select * from shared_shares where entry_id = $1", [g.entry])).length, 1, "their own share, for their totals");
  assert.equal((await as(BETO, "select * from shared_links where entry_id = $1", [g.entry])).length, 1);
  assert.equal(await value(BETO, "select is_shared_member($1)", [g.id]), false);

  await new Promise((resolve) => setTimeout(resolve, 20));
  const later = await add(ANA, g, { amount: 9000, shares: [{ member_id: g.Ana, amount: 9000 }] });
  const someone = await value(ANA, "select shared_add_member($1, 'Nueva')", [g.id]);
  assert.equal((await as(BETO, "select * from shared_entries where id = $1", [later])).length, 0, "nothing after");
  assert.equal((await as(BETO, "select * from shared_shares where entry_id = $1", [later])).length, 0);
  assert.equal((await as(BETO, "select * from shared_members where id = $1", [someone])).length, 0);
  assert.equal(await value(BETO, "select count(*)::int from shared_notices where entry_id = $1", [later]), 0, "nor notices");
  assert.equal(await value(BETO, "select count(*)::int from shared_notices where group_id = $1 and kind = 'you_removed'", [g.id]), 1);

  await assert.rejects(as(BETO, "select shared_add_member($1, 'Intruso')", [g.id]), /No haces parte/);
  await assert.rejects(as(BETO, "select shared_delete_entry($1)", [g.entry]), /No haces parte/);
  await assert.rejects(as(BETO, "select shared_create_direct('Beto', 'Ana', null, $1)", [g.Ana]), /ya compartes un grupo/, "nor use it as a shared group");
});

test("remove: their balance cannot be moved afterwards", async () => {
  const g = await groupWithHistory();
  const both = await add(ANA, g, { amount: 2000, shares: [{ member_id: g.Ana, amount: 2000 }] });
  await as(ANA, "select shared_remove_person($1)", [g.Beto]);
  await assert.rejects(add(ANA, g, { amount: 9000, shares: [{ member_id: g.Beto, amount: 9000 }] }), /ya no es del grupo/);
  await assert.rejects(add(ANA, g, { amount: 9000, by: g.Beto, shares: [{ member_id: g.Ana, amount: 9000 }] }), /ya no es del grupo/);
  const update = (entry, by, member) =>
    as(ANA, "select shared_update_entry($1, 'Cambio', null, 2000, $2, '2026-11-22', $3)", [entry, by, JSON.stringify([{ member_id: member, amount: 2000 }])]);
  await assert.rejects(update(both, g.Beto, g.Ana), /ya no es del grupo/);
  await assert.rejects(update(both, g.Ana, g.Beto), /ya no es del grupo/);

  const h = await group();
  const mixed = await add(ANA, h, { amount: 6000, shares: [{ member_id: h.Beto, amount: 6000 }] });
  await add(ANA, h, { kind: "settlement", amount: 6000, by: h.Beto, shares: [{ member_id: h.Ana, amount: 6000 }] });
  await as(ANA, "select shared_remove_person($1)", [h.Beto]);
  await assert.rejects(as(ANA, "select shared_delete_entry($1)", [mixed]), /ya no es del grupo/);
});

test("restore: with an account only by accepting, without one at once", async () => {
  const g = await groupWithHistory();
  await as(ANA, "select shared_remove_person($1)", [g.Beto]);
  await assert.rejects(as(BETO, "select shared_restore_person($1)", [g.Beto]), /No haces parte/);
  assert.equal(await value(ANA, "select shared_restore_person($1)", [g.Beto]), false);
  assert.equal(await value(BETO, "select is_shared_member($1)", [g.id]), false, "not before accepting");
  assert.equal(await value(BETO, "select count(*)::int from shared_my_requests() where member_id = $1", [g.Beto]), 1);
  assert.equal(await value(BETO, "select shared_respond($1, true)", [g.Beto]), g.id);
  assert.equal(await value(BETO, "select is_shared_member($1)", [g.id]), true);

  await add(ANA, g, { amount: 7000, shares: [{ member_id: g.Caro, amount: 7000 }] });
  await add(ANA, g, { kind: "settlement", amount: 7000, by: g.Caro, shares: [{ member_id: g.Ana, amount: 7000 }] });
  await as(ANA, "select shared_remove_person($1)", [g.Caro]);
  assert.equal(await value(BETO, "select shared_restore_person($1)", [g.Caro]), true);
});

test("remove: a test group is still erased whole", async () => {
  const id = await value(ANA, "select shared_create_group('Prueba', 'Ana', array['Nadie'])");
  const other = await value(ANA, "select id from shared_members where group_id = $1 and user_id is null", [id]);
  await as(ANA, "select shared_add_entry($1, 'expense', 'Algo', null, 5000, $2, '2026-11-22', $3, null, null)", [id, other, JSON.stringify([{ member_id: other, amount: 5000 }])]);
  await as(ANA, "select shared_remove_person($1)", [other]);
  await as(ANA, "select shared_remove_group($1, true)", [id]);
  assert.equal((await as(ANA, "select * from shared_groups where id = $1", [id])).length, 0);
});

test("contact: deleting it is only for oneself", async () => {
  const g = await group();
  await assert.rejects(as(EVA, "select shared_delete_contact($1, '{}', false)", [[g.Beto]]), /no es tuyo/);
  await assert.rejects(as(ANA, "select shared_delete_contact($1, '{}', false)", [[g.Ana]]), /no es tuyo/);
  await assert.rejects(as(ANA, "select shared_delete_contact($1, $2, false)", [[g.Beto], [g.id]]), /no es con ese contacto/, "never a group");
  await as(ANA, "select shared_delete_contact($1, '{}', false)", [[g.Beto]]);
  assert.equal(await value(ANA, "select count(*)::int from shared_hidden_contacts where member_id = $1", [g.Beto]), 1);
  assert.equal(await value(BETO, "select count(*)::int from shared_hidden_contacts where member_id = $1", [g.Beto]), 0);
  assert.equal(await value(BETO, "select is_shared_member($1)", [g.id]), true, "still in the group");
  await assert.rejects(as(ANA, "insert into shared_hidden_contacts values ($1, $2)", [BETO, g.Ana]), /permission denied/);
});

test("contact: closes the account between two, all or nothing", async () => {
  const id = await value(ANA, "select shared_create_direct('Ana', 'Gina', null, null)");
  const gina = await value(ANA, "select id from shared_members where group_id = $1 and user_id is null", [id]);
  await as(ANA, "select shared_delete_contact($1, $2, false)", [[gina], [id]]);
  assert.equal((await as(ANA, "select * from shared_groups where id = $1", [id])).length, 0);
});
