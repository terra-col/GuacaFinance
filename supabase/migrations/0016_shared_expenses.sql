-- Gastos compartidos: grupos para dividir gastos y saldar (como Splitwise o Tricount).
--
-- Es lo único de Guaca que ven varias personas, así que:
--   * Un miembro lee solo sus grupos: nombres, gastos, partes y pagos. Nunca cuentas ni
--     movimientos de otra persona.
--   * Nadie escribe en estas tablas por la API: solo las funciones de abajo, que validan.
--   * Cada quien enlaza su propia plata: shared_links une un registro del grupo con un
--     movimiento suyo, y solo su dueño lo ve.
--
-- Un pago para saldar es un registro 'settlement' con una sola parte, la de quien recibe. Así el
-- saldo de cada miembro es siempre lo que pagó menos lo que le toca.
-- Un amigo sin cuenta es un miembro sin user_id; se une con un enlace de un uso que vence.

create schema if not exists private;

create table public.shared_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.shared_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.shared_groups (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default clock_timestamp(),
  unique (group_id, user_id),
  unique (id, group_id)
);
create unique index shared_members_name_idx on public.shared_members (group_id, lower(btrim(name)));
create index shared_members_user_idx on public.shared_members (user_id) where user_id is not null;

create table public.shared_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.shared_groups (id) on delete cascade,
  kind text not null check (kind in ('expense', 'settlement')),
  description text not null check (length(btrim(description)) between 1 and 120),
  category text check (length(category) <= 60),
  amount bigint not null check (amount between 1 and 9999999999999),
  paid_by uuid not null,
  occurred_on date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, group_id),
  foreign key (paid_by, group_id) references public.shared_members (id, group_id)
);
create index shared_entries_group_idx on public.shared_entries (group_id, occurred_on desc);

create table public.shared_shares (
  entry_id uuid not null,
  group_id uuid not null,
  member_id uuid not null,
  amount bigint not null check (amount > 0),
  primary key (entry_id, member_id),
  foreign key (entry_id, group_id) references public.shared_entries (id, group_id) on delete cascade,
  foreign key (member_id, group_id) references public.shared_members (id, group_id)
);
create index shared_shares_group_idx on public.shared_shares (group_id);
create index shared_shares_member_idx on public.shared_shares (member_id);

create table public.shared_links (
  tx_id uuid primary key references public.transactions (id) on delete cascade,
  entry_id uuid not null references public.shared_entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- false: era un movimiento que la persona ya tenía y dividió; al borrar la división se conserva.
  created_tx boolean not null,
  unique (entry_id, user_id)
);

create table private.shared_invites (
  member_id uuid primary key references public.shared_members (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null
);

alter table public.shared_groups enable row level security;
alter table public.shared_members enable row level security;
alter table public.shared_entries enable row level security;
alter table public.shared_shares enable row level security;
alter table public.shared_links enable row level security;
alter table private.shared_invites enable row level security;

-- Supabase da todos los permisos por defecto: aquí solo se puede leer.
revoke all on public.shared_groups, public.shared_members, public.shared_entries, public.shared_shares, public.shared_links
  from public, anon, authenticated;
grant select on public.shared_groups, public.shared_members, public.shared_entries, public.shared_shares, public.shared_links
  to authenticated;
revoke all on private.shared_invites from public, anon, authenticated;

-- Solo responde por quien pregunta. Security definer para que la política de miembros no se llame a sí misma.
create function public.is_shared_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shared_members m where m.group_id = p_group and m.user_id = auth.uid());
$$;

create policy "shared_groups: miembros" on public.shared_groups
  for select to authenticated using (public.is_shared_member(id));
create policy "shared_members: miembros" on public.shared_members
  for select to authenticated using (public.is_shared_member(group_id));
create policy "shared_entries: miembros" on public.shared_entries
  for select to authenticated using (public.is_shared_member(group_id));
create policy "shared_shares: miembros" on public.shared_shares
  for select to authenticated using (public.is_shared_member(group_id));
create policy "shared_links: solo el dueño" on public.shared_links
  for select to authenticated using (user_id = (select auth.uid()));

-- El miembro que soy en un grupo; falla si no soy de ese grupo.
create function private.shared_me(p_group uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid;
begin
  select m.id into v_me from public.shared_members m where m.group_id = p_group and m.user_id = auth.uid();
  if v_me is null then
    raise exception 'No haces parte de ese grupo.';
  end if;
  return v_me;
end;
$$;

create function public.shared_create_group(p_name text, p_my_name text, p_others text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
  v_other text;
begin
  if v_user is null then
    raise exception 'Inicia sesión de nuevo.';
  end if;
  if coalesce(cardinality(p_others), 0) not between 1 and 29 then
    raise exception 'Agrega entre 1 y 29 personas.';
  end if;
  insert into public.shared_groups (name, created_by) values (btrim(p_name), v_user) returning id into v_group;
  insert into public.shared_members (group_id, user_id, name) values (v_group, v_user, btrim(p_my_name));
  foreach v_other in array p_others loop
    insert into public.shared_members (group_id, name) values (v_group, btrim(v_other));
  end loop;
  return v_group;
end;
$$;

create function public.shared_add_member(p_group uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
begin
  perform private.shared_me(p_group);
  perform 1 from public.shared_groups g where g.id = p_group for update;
  if (select count(*) from public.shared_members m where m.group_id = p_group) >= 30 then
    raise exception 'Un grupo puede tener hasta 30 personas.';
  end if;
  insert into public.shared_members (group_id, name) values (p_group, btrim(p_name)) returning id into v_member;
  return v_member;
end;
$$;

create function public.shared_remove_member(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.shared_members;
begin
  select * into v_member from public.shared_members where id = p_member for update;
  perform private.shared_me(v_member.group_id);
  if v_member.user_id is not null then
    raise exception 'Esa persona ya se unió con su cuenta: no se puede quitar.';
  end if;
  if exists (select 1 from public.shared_entries e where e.paid_by = p_member)
    or exists (select 1 from public.shared_shares s where s.member_id = p_member) then
    raise exception 'Esa persona ya está en gastos del grupo: no se puede quitar.';
  end if;
  delete from public.shared_members where id = p_member;
end;
$$;

create function public.shared_delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.shared_me(p_group);
  perform 1 from public.shared_groups g where g.id = p_group for update;
  if not exists (select 1 from public.shared_groups g where g.id = p_group and g.created_by = auth.uid()) then
    raise exception 'Solo quien creó el grupo puede borrarlo.';
  end if;
  if exists (select 1 from public.shared_entries e where e.group_id = p_group) then
    raise exception 'El grupo tiene gastos: bórralos antes de borrar el grupo.';
  end if;
  delete from public.shared_groups where id = p_group;
end;
$$;

-- El servidor genera el enlace y aquí solo queda su huella. Uno vigente por persona.
create function public.shared_invite(p_member uuid, p_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.shared_members;
begin
  select * into v_member from public.shared_members where id = p_member;
  perform private.shared_me(v_member.group_id);
  if v_member.user_id is not null then
    raise exception 'Esa persona ya se unió.';
  end if;
  insert into private.shared_invites (member_id, token_hash, expires_at)
  values (p_member, p_hash, now() + interval '7 days')
  on conflict (member_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at;
end;
$$;

-- Antes de unirse se ve solo el nombre del grupo y el lugar que se ocuparía.
create function public.shared_invite_preview(p_token text)
returns table (group_name text, member_name text)
language sql stable security definer set search_path = '' as $$
  select g.name, m.name
  from private.shared_invites i
  join public.shared_members m on m.id = i.member_id and m.user_id is null
  join public.shared_groups g on g.id = m.group_id
  where auth.uid() is not null
    and i.expires_at > now()
    and i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

create function public.shared_join(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_member public.shared_members;
begin
  if v_user is null then
    raise exception 'Inicia sesión de nuevo.';
  end if;
  select m.* into v_member
  from private.shared_invites i
  join public.shared_members m on m.id = i.member_id
  where i.expires_at > now() and i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update of m, i;
  if v_member.id is null or v_member.user_id is not null then
    raise exception 'El enlace venció o ya se usó. Pide uno nuevo.';
  end if;
  -- Quien ya está en el grupo (quien invitó y abrió su propio enlace) no ocupa el lugar de otro.
  if exists (select 1 from public.shared_members m where m.group_id = v_member.group_id and m.user_id = v_user) then
    return v_member.group_id;
  end if;
  update public.shared_members set user_id = v_user where id = v_member.id;
  delete from private.shared_invites where member_id = v_member.id;
  return v_member.group_id;
end;
$$;

-- Enlaza un registro con la plata de quien llama: un movimiento nuevo en una cuenta suya, o uno
-- que ya tenía (p_tx). Solo quien pagó, o quien recibió un pago para saldar.
create function private.shared_attach(p_entry uuid, p_account uuid, p_tx uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_entry public.shared_entries;
  v_me uuid;
  v_kind text;
  v_account_kind text;
  v_tx public.transactions;
begin
  select * into v_entry from public.shared_entries where id = p_entry for update;
  v_me := private.shared_me(v_entry.group_id);
  if v_entry.paid_by = v_me then
    v_kind := 'expense';
  elsif v_entry.kind = 'settlement'
    and exists (select 1 from public.shared_shares s where s.entry_id = p_entry and s.member_id = v_me) then
    v_kind := 'income';
  else
    raise exception 'Solo quien pagó o recibió la plata puede registrarla en su cuenta.';
  end if;
  if exists (select 1 from public.shared_links l where l.entry_id = p_entry and l.user_id = v_user) then
    raise exception 'Ya lo registraste en una cuenta.';
  end if;

  if p_tx is not null then
    select * into v_tx from public.transactions where id = p_tx and user_id = v_user for update;
    if v_tx.id is null or v_entry.kind <> 'expense' or v_tx.kind <> 'expense' or v_tx.category = 'Ajuste de saldo' then
      raise exception 'Ese movimiento no se puede dividir.';
    end if;
    if v_tx.amount <> v_entry.amount then
      raise exception 'El valor dividido debe ser el mismo del movimiento.';
    end if;
    if exists (select 1 from public.shared_links l where l.tx_id = p_tx) then
      raise exception 'Ese movimiento ya está dividido.';
    end if;
    insert into public.shared_links (tx_id, entry_id, user_id, created_tx) values (p_tx, p_entry, v_user, false);
    return;
  end if;

  select a.kind into v_account_kind from public.accounts a where a.id = p_account and a.user_id = v_user;
  if v_account_kind is null or v_account_kind = 'loan'
    or (v_entry.kind = 'settlement' and v_account_kind not in ('savings', 'cash')) then
    raise exception 'Elige una de tus cuentas válidas para ese movimiento.';
  end if;
  insert into public.transactions (user_id, account_id, kind, amount, category, description, occurred_on)
  values (v_user, p_account, v_kind, v_entry.amount, v_entry.category, v_entry.description, v_entry.occurred_on)
  returning * into v_tx;
  insert into public.shared_links (tx_id, entry_id, user_id, created_tx) values (v_tx.id, p_entry, v_user, true);
end;
$$;

-- p_shares: [{"member_id": "…", "amount": 100000}, …]
create function public.shared_add_entry(
  p_group uuid,
  p_kind text,
  p_description text,
  p_category text,
  p_amount bigint,
  p_paid_by uuid,
  p_occurred_on date,
  p_shares jsonb,
  p_account uuid default null,
  p_tx uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid;
  v_entry uuid;
  v_count int;
  v_sum numeric;
begin
  v_me := private.shared_me(p_group);
  perform 1 from public.shared_groups g where g.id = p_group for update;
  if not exists (select 1 from public.shared_members m where m.id = p_paid_by and m.group_id = p_group) then
    raise exception 'Quien pagó no es del grupo.';
  end if;
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' then
    raise exception 'Las partes no son válidas.';
  end if;
  select count(*), sum(s.amount) into v_count, v_sum
  from jsonb_to_recordset(p_shares) as s(member_id uuid, amount bigint);
  if v_count not between 1 and 30 or v_sum is distinct from p_amount::numeric then
    raise exception 'Las partes deben sumar el total.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_shares) as s(member_id uuid, amount bigint)
    where s.amount is null or s.amount <= 0
      or not exists (select 1 from public.shared_members m where m.id = s.member_id and m.group_id = p_group)
  ) or v_count <> (select count(distinct s.member_id) from jsonb_to_recordset(p_shares) as s(member_id uuid, amount bigint)) then
    raise exception 'Las partes no son válidas.';
  end if;
  if p_kind = 'settlement' and (
    v_count <> 1
    or exists (select 1 from jsonb_to_recordset(p_shares) as s(member_id uuid, amount bigint) where s.member_id = p_paid_by)
  ) then
    raise exception 'Un pago para saldar va de una persona a otra.';
  end if;

  insert into public.shared_entries (group_id, kind, description, category, amount, paid_by, occurred_on, created_by)
  values (
    p_group, p_kind, btrim(p_description),
    -- La categoría de los ajustes sacaría el gasto de los totales de los demás.
    case when p_kind = 'expense' then nullif(nullif(btrim(p_category), ''), 'Ajuste de saldo') end,
    p_amount, p_paid_by, p_occurred_on, auth.uid()
  )
  returning id into v_entry;
  insert into public.shared_shares (entry_id, group_id, member_id, amount)
  select v_entry, p_group, s.member_id, s.amount from jsonb_to_recordset(p_shares) as s(member_id uuid, amount bigint);

  if p_account is not null or p_tx is not null then
    perform private.shared_attach(v_entry, p_account, p_tx);
  end if;
  return v_entry;
end;
$$;

create function public.shared_record(p_entry uuid, p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.shared_attach(p_entry, p_account, null);
end;
$$;

create function public.shared_delete_entry(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_entry public.shared_entries;
  v_me uuid;
begin
  select * into v_entry from public.shared_entries where id = p_entry for update;
  v_me := private.shared_me(v_entry.group_id);
  if not (v_entry.created_by is not distinct from v_user or (v_entry.created_by is null and v_entry.paid_by = v_me)) then
    raise exception 'Solo quien lo registró puede borrarlo.';
  end if;
  -- Nunca se mueve el saldo de otra persona.
  if exists (select 1 from public.shared_links l where l.entry_id = p_entry and l.user_id <> v_user) then
    raise exception 'Otra persona ya lo registró en su cuenta: debe borrar ese movimiento primero.';
  end if;
  delete from public.transactions t
  using public.shared_links l
  where l.tx_id = t.id and l.entry_id = p_entry and l.created_tx and t.user_id = v_user;
  delete from public.shared_entries where id = p_entry;
end;
$$;

-- Un movimiento enlazado no cambia de valor ni de tipo: dejaría de cuadrar con el grupo.
create function private.shared_guard_tx() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.amount <> old.amount or new.kind <> old.kind)
    and exists (select 1 from public.shared_links l where l.tx_id = old.id) then
    raise exception 'Este movimiento está en Compartidos: bórralo allá y créalo de nuevo para cambiar su valor.';
  end if;
  return new;
end;
$$;

create trigger shared_guard_tx
  before update of amount, kind on public.transactions
  for each row execute function private.shared_guard_tx();

revoke all on function private.shared_me(uuid), private.shared_attach(uuid, uuid, uuid), private.shared_guard_tx()
  from public, anon, authenticated;
revoke all on function
  public.is_shared_member(uuid),
  public.shared_create_group(text, text, text[]),
  public.shared_add_member(uuid, text),
  public.shared_remove_member(uuid),
  public.shared_delete_group(uuid),
  public.shared_invite(uuid, text),
  public.shared_invite_preview(text),
  public.shared_join(text),
  public.shared_add_entry(uuid, text, text, text, bigint, uuid, date, jsonb, uuid, uuid),
  public.shared_record(uuid, uuid),
  public.shared_delete_entry(uuid)
from public, anon, authenticated;
grant execute on function
  public.is_shared_member(uuid),
  public.shared_create_group(text, text, text[]),
  public.shared_add_member(uuid, text),
  public.shared_remove_member(uuid),
  public.shared_delete_group(uuid),
  public.shared_invite(uuid, text),
  public.shared_invite_preview(text),
  public.shared_join(text),
  public.shared_add_entry(uuid, text, text, text, bigint, uuid, date, jsonb, uuid, uuid),
  public.shared_record(uuid, uuid),
  public.shared_delete_entry(uuid)
to authenticated;
