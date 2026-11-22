-- Pagos de la casa, y salir de un grupo.
--
--   * Una casa es un grupo de Compartidos con house = true: las mismas personas, invitaciones,
--     avisos y reglas. No hay otra lista de miembros.
--   * Un recibo de la casa solo se ve. No crea deudas entre las personas, salvo que al pagarlo se
--     divida: ahí es un gasto de Compartidos y manda ese gasto.
--   * Nadie mueve la plata de otro. Cualquiera anota quién pagó; el movimiento lo crea solo quien
--     pagó, en una cuenta suya, y solo esa persona ve ese enlace.
--   * Un período queda pagado cuando un pago lo cierra (settles). Los demás son partes.
--   * La casa la lee solo quien sigue en el grupo. Los movimientos de quien sale siguen siendo suyos.
--   * Un pago fijo que pasa a la casa no se borra: termina en ese mes (ended_month) y conserva sus meses.

create schema if not exists private;

alter table public.shared_groups add column house boolean not null default false;
alter table public.shared_groups add constraint shared_groups_house_check check (not (house and direct));
alter table public.bills add column ended_month text check (ended_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

create table public.house_bills (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.shared_groups (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  amount bigint check (amount between 1 and 9999999999999),
  category text check (length(category) <= 60),
  due_day smallint not null check (due_day between 1 and 31),
  every text not null default 'monthly' check (
    every in ('daily', 'every2', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual')
    or every ~ '^(d([3-9]|[1-9][0-9])|w([1-9]|[1-4][0-9]|5[0-2])|m([45789]|[1-9][0-9])|y([1-9]|10))$'
  ),
  starts_on date,
  -- El responsable habitual: en su lista y en su plan del mes cuenta.
  responsible uuid,
  -- Si al pagarlo se propone dividir.
  split boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_month text check (ended_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint house_bills_every_needs_start check (every = 'monthly' or starts_on is not null),
  unique (id, group_id),
  foreign key (responsible, group_id) references public.shared_members (id, group_id) on delete set null (responsible)
);
create index house_bills_group_idx on public.house_bills (group_id);

create table public.house_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null,
  group_id uuid not null,
  for_month text not null check (for_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  for_date date,
  paid_by uuid not null,
  amount bigint not null check (amount between 1 and 9999999999999),
  occurred_on date not null,
  settles boolean not null default true,
  -- Dividido: manda el gasto de Compartidos. Si se borra, el pago se va con él.
  entry_id uuid unique references public.shared_entries (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (bill_id, group_id) references public.house_bills (id, group_id) on delete cascade,
  foreign key (paid_by, group_id) references public.shared_members (id, group_id)
);
create index house_payments_group_idx on public.house_payments (group_id, for_month);
create index house_payments_payer_idx on public.house_payments (paid_by);

create table public.house_links (
  tx_id uuid primary key references public.transactions (id) on delete cascade,
  payment_id uuid not null unique references public.house_payments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade
);

create table public.house_skips (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null,
  group_id uuid not null,
  for_month text not null check (for_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  for_date date,
  note text check (length(note) <= 200),
  created_at timestamptz not null default now(),
  unique nulls not distinct (bill_id, for_month, for_date),
  foreign key (bill_id, group_id) references public.house_bills (id, group_id) on delete cascade
);

alter table public.house_bills enable row level security;
alter table public.house_payments enable row level security;
alter table public.house_links enable row level security;
alter table public.house_skips enable row level security;
revoke all on public.house_bills, public.house_payments, public.house_links, public.house_skips from public, anon, authenticated;
grant select on public.house_bills, public.house_payments, public.house_links, public.house_skips to authenticated;

create policy "house_bills: miembros" on public.house_bills
  for select to authenticated using (public.is_shared_member(group_id));
create policy "house_payments: miembros" on public.house_payments
  for select to authenticated using (public.is_shared_member(group_id));
create policy "house_skips: miembros" on public.house_skips
  for select to authenticated using (public.is_shared_member(group_id));
create policy "house_links: solo el dueño" on public.house_links
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.shared_notices drop constraint shared_notices_kind_check;
alter table public.shared_notices add constraint shared_notices_kind_check check (
  kind in (
    'expense', 'payment', 'edited', 'removed', 'joined', 'you_joined', 'group_deleted', 'member_removed', 'you_removed',
    'member_left', 'house_on', 'house_bill', 'house_bill_edited', 'house_bill_ended', 'house_paid', 'house_unpaid', 'house_skipped'
  )
);

-- ---- Ayudas

create function private.this_month() returns text
language sql stable set search_path = '' as $$
  select to_char(now() at time zone 'America/Bogota', 'YYYY-MM');
$$;

-- El miembro que soy en una casa, con el grupo bajo candado.
create function private.house_me(p_group uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.shared_me(p_group);
begin
  perform 1 from public.shared_groups g where g.id = p_group for update;
  if not exists (select 1 from public.shared_groups g where g.id = p_group and g.house) then
    raise exception 'Ese grupo no es una casa.';
  end if;
  return v_me;
end;
$$;

-- Crea en una cuenta de quien llama el movimiento de un pago que hizo esa persona.
create function private.house_attach(p_payment uuid, p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_payment public.house_payments;
  v_bill public.house_bills;
  v_kind text;
  v_tx uuid;
begin
  select * into v_payment from public.house_payments where id = p_payment for update;
  if v_payment.paid_by is distinct from private.shared_me(v_payment.group_id) then
    raise exception 'Solo quien pagó puede registrarlo en su cuenta.';
  end if;
  if exists (select 1 from public.house_links l where l.payment_id = p_payment) then
    raise exception 'Ya lo registraste en una cuenta.';
  end if;
  select a.kind into v_kind from public.accounts a where a.id = p_account and a.user_id = v_user;
  if v_kind is null or v_kind = 'loan' then
    raise exception 'Elige una de tus cuentas válidas para ese pago.';
  end if;
  select * into v_bill from public.house_bills where id = v_payment.bill_id;
  insert into public.transactions (user_id, account_id, kind, amount, category, description, occurred_on)
  values (v_user, p_account, 'expense', v_payment.amount, coalesce(v_bill.category, 'Recibos'), v_bill.name, v_payment.occurred_on)
  returning id into v_tx;
  insert into public.house_links (tx_id, payment_id, user_id) values (v_tx, p_payment, v_user);
end;
$$;

-- ---- Configurar la casa

-- Sola o con personas: se pueden agregar después.
create function public.house_create(p_name text, p_my_name text, p_people jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
  v_person record;
begin
  if v_user is null then
    raise exception 'Inicia sesión de nuevo.';
  end if;
  if p_people is null or jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) > 29 then
    raise exception 'Una casa puede tener hasta 30 personas.';
  end if;
  insert into public.shared_groups (name, created_by, house) values (btrim(p_name), v_user, true) returning id into v_group;
  insert into public.shared_members (group_id, user_id, name) values (v_group, v_user, btrim(p_my_name));
  for v_person in select * from jsonb_to_recordset(p_people) as p(name text, phone text, known uuid) loop
    perform public.shared_add_person(v_group, v_person.name, v_person.phone, v_person.known);
  end loop;
  return v_group;
end;
$$;

-- Un grupo que ya existe se vuelve casa, o deja de serlo. Lo anotado no se pierde.
create function public.house_set(p_group uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_group public.shared_groups;
begin
  perform private.shared_me(p_group);
  select * into v_group from public.shared_groups where id = p_group for update;
  if v_group.direct then
    raise exception 'Una cuenta entre dos no puede ser casa: crea una con esa persona.';
  end if;
  if v_group.house is distinct from p_on then
    if not p_on and not (v_group.created_by is null or v_group.created_by = auth.uid()) then
      raise exception 'Solo quien creó el grupo puede dejar de usarlo como casa.';
    end if;
    update public.shared_groups set house = p_on where id = p_group;
    if p_on then
      perform private.shared_notify(p_group, 'house_on', null, v_group.name, null);
    end if;
  end if;
end;
$$;

-- ---- Recibos: los edita cualquiera de la casa

-- Un pago fijo propio pasa a ser ese recibo: termina este mes y lo que ya se le pagó de este mes en
-- adelante pasa a la casa, sin crear ni borrar movimientos.
create function private.house_adopt(p_own uuid, p_bill uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_month text := private.this_month();
  v_bill public.house_bills;
  v_me uuid;
  v_tx record;
  v_payment uuid;
begin
  perform 1 from public.bills b where b.id = p_own and b.user_id = v_user and b.ended_month is null for update;
  if not found then
    raise exception 'Ese pago fijo no es tuyo o ya pasó a una casa.';
  end if;
  select * into v_bill from public.house_bills where id = p_bill;
  v_me := private.shared_me(v_bill.group_id);

  for v_tx in
    select t.id, t.amount, t.occurred_on, t.for_date, coalesce(t.for_month, to_char(t.occurred_on, 'YYYY-MM')) as month
    from public.transactions t
    where t.bill_id = p_own and t.user_id = v_user and t.kind = 'expense'
      and t.category is distinct from 'Ajuste de saldo'
      and coalesce(t.for_month, to_char(t.occurred_on, 'YYYY-MM')) >= v_month
      and not exists (select 1 from public.house_links l where l.tx_id = t.id)
    order by t.occurred_on
  loop
    -- Lo que la casa ya tenía pagado no se repite.
    continue when exists (
      select 1 from public.house_payments p
      where p.bill_id = p_bill and p.settles and p.for_month = v_tx.month
        and (v_bill.every = 'monthly' or p.for_date is not distinct from v_tx.for_date)
    );
    insert into public.house_payments (bill_id, group_id, for_month, for_date, paid_by, amount, occurred_on, created_by)
    values (
      p_bill, v_bill.group_id, v_tx.month,
      case when v_bill.every <> 'monthly' then v_tx.for_date end,
      v_me, v_tx.amount, v_tx.occurred_on, v_user
    )
    returning id into v_payment;
    insert into public.house_links (tx_id, payment_id, user_id) values (v_tx.id, v_payment, v_user);
  end loop;

  -- Lo que esta vez no aplicaba sigue sin aplicar.
  if v_bill.every = 'monthly' then
    insert into public.house_skips (bill_id, group_id, for_month, note)
    select p_bill, v_bill.group_id, s.month, s.note
    from public.checklist_skips s
    where s.user_id = v_user and s.item_type = 'bill' and s.item_id = p_own and s.month >= v_month
    on conflict (bill_id, for_month, for_date) do nothing;
  else
    insert into public.house_skips (bill_id, group_id, for_month, for_date, note)
    select p_bill, v_bill.group_id, to_char(s.for_date, 'YYYY-MM'), s.for_date, s.note
    from public.date_skips s
    where s.user_id = v_user and s.item_type = 'bill' and s.item_id = p_own and to_char(s.for_date, 'YYYY-MM') >= v_month
    on conflict (bill_id, for_month, for_date) do nothing;
  end if;

  update public.bills set ended_month = v_month where id = p_own;
end;
$$;

create function public.house_save_bill(
  p_bill uuid,
  p_group uuid,
  p_name text,
  p_amount bigint,
  p_category text,
  p_due_day int,
  p_every text,
  p_starts_on date,
  p_responsible uuid,
  p_split boolean,
  p_from uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid := p_group;
  v_bill uuid := p_bill;
  v_category text := nullif(nullif(btrim(p_category), ''), 'Ajuste de saldo');
begin
  if p_bill is not null then
    select b.group_id into v_group from public.house_bills b where b.id = p_bill;
  end if;
  perform private.house_me(v_group);
  if p_responsible is not null and not exists (
    select 1 from public.shared_members m where m.id = p_responsible and m.group_id = v_group and m.removed_at is null
  ) then
    raise exception 'El responsable debe ser alguien de la casa.';
  end if;

  if p_bill is null then
    insert into public.house_bills (group_id, name, amount, category, due_day, every, starts_on, responsible, split, created_by)
    values (v_group, btrim(p_name), p_amount, v_category, p_due_day, p_every, p_starts_on, p_responsible, coalesce(p_split, false), auth.uid())
    returning id into v_bill;
  else
    update public.house_bills set
      name = btrim(p_name), amount = p_amount, category = v_category, due_day = p_due_day, every = p_every,
      starts_on = p_starts_on, responsible = p_responsible, split = coalesce(p_split, false)
    where id = p_bill and ended_month is null;
    if not found then
      raise exception 'Ese recibo ya no está.';
    end if;
  end if;

  if p_from is not null then
    perform private.house_adopt(p_from, v_bill);
  end if;
  perform private.shared_notify(v_group, case when p_bill is null then 'house_bill' else 'house_bill_edited' end, null, btrim(p_name), p_amount);
  return v_bill;
end;
$$;

-- Dos personas con el mismo recibo: el propio se une al de la casa.
create function public.house_merge_bill(p_own uuid, p_bill uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_bill public.house_bills;
begin
  select * into v_bill from public.house_bills where id = p_bill;
  perform private.house_me(v_bill.group_id);
  if v_bill.ended_month is not null then
    raise exception 'Ese recibo ya no está.';
  end if;
  perform private.house_adopt(p_own, p_bill);
end;
$$;

create function public.house_end_bill(p_bill uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_bill public.house_bills;
begin
  select * into v_bill from public.house_bills where id = p_bill;
  perform private.house_me(v_bill.group_id);
  if v_bill.ended_month is not null then
    return;
  end if;
  -- Sin historia se borra; con ella termina este mes.
  if exists (select 1 from public.house_payments p where p.bill_id = p_bill) then
    update public.house_bills set ended_month = private.this_month() where id = p_bill;
  else
    delete from public.house_bills where id = p_bill;
  end if;
  perform private.shared_notify(v_bill.group_id, 'house_bill_ended', null, v_bill.name, null);
end;
$$;

-- ---- Pagos

-- p_shares y p_split solo si se divide.
create function public.house_pay(
  p_bill uuid,
  p_month text,
  p_date date,
  p_paid_by uuid,
  p_amount bigint,
  p_occurred_on date,
  p_settles boolean,
  p_account uuid default null,
  p_shares jsonb default null,
  p_split jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_bill public.house_bills;
  v_me uuid;
  v_who text;
  v_entry uuid;
  v_payment uuid;
begin
  select * into v_bill from public.house_bills where id = p_bill;
  v_me := private.house_me(v_bill.group_id);
  select * into v_bill from public.house_bills where id = p_bill for update;
  if v_bill.id is null or (v_bill.ended_month is not null and p_month >= v_bill.ended_month) then
    raise exception 'Ese recibo ya no está.';
  end if;
  if p_date is not null and to_char(p_date, 'YYYY-MM') is distinct from p_month then
    raise exception 'Esa fecha no es de ese mes.';
  end if;
  if v_bill.every <> 'monthly' and p_date is null then
    raise exception 'Falta la fecha de ese recibo.';
  end if;
  if v_bill.every = 'monthly' and p_date is not null then
    raise exception 'Ese recibo es de cada mes: recarga la página.';
  end if;
  if not exists (
    select 1 from public.shared_members m where m.id = p_paid_by and m.group_id = v_bill.group_id and m.removed_at is null
  ) then
    raise exception 'Quien pagó no es de la casa.';
  end if;
  if p_account is not null and p_paid_by <> v_me then
    raise exception 'Solo quien pagó puede registrarlo en su cuenta.';
  end if;

  select m.name into v_who
  from public.house_payments p join public.shared_members m on m.id = p.paid_by
  where p.bill_id = p_bill and p.settles and p.for_month = p_month
    and (v_bill.every = 'monthly' or p.for_date = p_date)
  limit 1;
  if v_who is not null then
    raise exception 'Ya está marcado como pagado (pagó %).', v_who;
  end if;

  if jsonb_typeof(p_shares) = 'array' then
    v_entry := public.shared_save_expense(
      null, v_bill.group_id, v_bill.name, coalesce(v_bill.category, 'Recibos'),
      p_amount, p_paid_by, p_occurred_on, p_shares, p_split, p_account, null
    );
  end if;
  insert into public.house_payments (bill_id, group_id, for_month, for_date, paid_by, amount, occurred_on, settles, entry_id, created_by)
  values (p_bill, v_bill.group_id, p_month, p_date, p_paid_by, p_amount, p_occurred_on, coalesce(p_settles, true), v_entry, auth.uid())
  returning id into v_payment;
  delete from public.house_skips s where s.bill_id = p_bill and s.for_month = p_month and s.for_date is not distinct from p_date;

  if v_entry is null then
    if p_account is not null then
      perform private.house_attach(v_payment, p_account);
    end if;
    -- El dividido ya avisa como gasto del grupo.
    perform private.shared_notify(v_bill.group_id, 'house_paid', null, v_bill.name, p_amount);
  end if;
  return v_payment;
end;
$$;

-- El dividido se edita en Compartidos. El movimiento conserva cuándo se anotó.
create function public.house_update_payment(p_payment uuid, p_amount bigint, p_occurred_on date, p_settles boolean, p_account uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_payment public.house_payments;
  v_me uuid;
  v_link public.house_links;
  v_kind text;
begin
  select * into v_payment from public.house_payments where id = p_payment;
  v_me := private.house_me(v_payment.group_id);
  if not (v_payment.created_by is not distinct from v_user or v_payment.paid_by = v_me) then
    raise exception 'Solo quien lo anotó o quien pagó puede cambiarlo.';
  end if;
  if v_payment.entry_id is not null then
    raise exception 'Está dividido: edítalo en Compartidos.';
  end if;
  if coalesce(p_settles, true) and exists (
    select 1 from public.house_payments p
    where p.bill_id = v_payment.bill_id and p.id <> p_payment and p.settles
      and p.for_month = v_payment.for_month and p.for_date is not distinct from v_payment.for_date
  ) then
    raise exception 'Otro pago ya lo dejó como pagado.';
  end if;
  select * into v_link from public.house_links where payment_id = p_payment;
  if v_link.user_id <> v_user and p_amount <> v_payment.amount then
    raise exception 'Quien pagó ya lo registró en su cuenta: solo esa persona cambia el valor.';
  end if;
  update public.house_payments set amount = p_amount, occurred_on = p_occurred_on, settles = coalesce(p_settles, true)
  where id = p_payment;

  if v_link.user_id = v_user then
    if p_account is not null then
      select a.kind into v_kind from public.accounts a where a.id = p_account and a.user_id = v_user;
      if v_kind is null or v_kind = 'loan' then
        raise exception 'Elige una de tus cuentas válidas para ese pago.';
      end if;
    end if;
    update public.transactions t set
      amount = p_amount, occurred_on = p_occurred_on, account_id = coalesce(p_account, t.account_id)
    where t.id = v_link.tx_id and t.user_id = v_user;
  elsif v_link.tx_id is null and p_account is not null then
    perform private.house_attach(p_payment, p_account);
  end if;
end;
$$;

create function public.house_record(p_payment uuid, p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.house_payments;
begin
  select * into v_payment from public.house_payments where id = p_payment;
  perform private.house_me(v_payment.group_id);
  if v_payment.entry_id is not null then
    perform public.shared_record(v_payment.entry_id, p_account);
  else
    perform private.house_attach(p_payment, p_account);
  end if;
end;
$$;

create function public.house_unpay(p_payment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_payment public.house_payments;
  v_me uuid;
  v_link public.house_links;
begin
  select * into v_payment from public.house_payments where id = p_payment;
  v_me := private.house_me(v_payment.group_id);
  if v_payment.entry_id is not null then
    perform public.shared_delete_entry(v_payment.entry_id);
    return;
  end if;
  if not (v_payment.created_by is not distinct from v_user or v_payment.paid_by = v_me) then
    raise exception 'Solo quien lo anotó o quien pagó puede desmarcarlo.';
  end if;
  select * into v_link from public.house_links where payment_id = p_payment;
  if v_link.user_id <> v_user then
    raise exception 'Quien pagó ya lo registró en su cuenta: solo esa persona lo desmarca.';
  end if;
  if exists (select 1 from public.shared_links l where l.tx_id = v_link.tx_id) then
    raise exception 'Este pago está dividido. Primero bórralo en Compartidos.';
  end if;
  perform private.shared_notify(
    v_payment.group_id, 'house_unpaid', null,
    (select b.name from public.house_bills b where b.id = v_payment.bill_id), v_payment.amount
  );
  delete from public.house_payments where id = p_payment;
  delete from public.transactions t where t.id = v_link.tx_id and t.user_id = v_user;
end;
$$;

create function public.house_skip(p_bill uuid, p_month text, p_date date, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_bill public.house_bills;
begin
  select * into v_bill from public.house_bills where id = p_bill;
  perform private.house_me(v_bill.group_id);
  insert into public.house_skips (bill_id, group_id, for_month, for_date, note)
  values (p_bill, v_bill.group_id, p_month, p_date, nullif(btrim(p_note), ''))
  on conflict (bill_id, for_month, for_date) do update set note = excluded.note;
  perform private.shared_notify(v_bill.group_id, 'house_skipped', null, v_bill.name, null);
end;
$$;

create function public.house_unskip(p_skip uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.house_me((select s.group_id from public.house_skips s where s.id = p_skip));
  delete from public.house_skips where id = p_skip;
end;
$$;

-- ---- Que todo siga cuadrando

create function private.house_frozen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    perform private.shared_not_removed(old.paid_by);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  perform private.shared_not_removed(new.paid_by);
  return new;
end;
$$;
create trigger house_frozen
  before insert or delete or update of amount, paid_by on public.house_payments
  for each row execute function private.house_frozen();

-- El gasto dividido manda sobre su pago.
create function private.house_follow_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.house_payments p set amount = new.amount, paid_by = new.paid_by, occurred_on = new.occurred_on
  where p.entry_id = new.id and (p.amount, p.paid_by, p.occurred_on) is distinct from (new.amount, new.paid_by, new.occurred_on);
  return null;
end;
$$;
create trigger house_follow_entry
  after update of amount, paid_by, occurred_on on public.shared_entries
  for each row execute function private.house_follow_entry();

-- El movimiento editado en Movimientos manda sobre su pago, mientras la persona siga en la casa.
create function private.house_follow_tx() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_payment uuid;
begin
  select l.payment_id into v_payment
  from public.house_links l
  join public.house_payments p on p.id = l.payment_id
  join public.shared_members m on m.id = p.paid_by and m.removed_at is null
  where l.tx_id = new.id;
  if v_payment is null then
    return null;
  end if;
  if new.kind <> old.kind then
    raise exception 'Es un pago de la casa: desmárcalo en Pagos para cambiarle el tipo.';
  end if;
  update public.house_payments p set amount = new.amount, occurred_on = new.occurred_on
  where p.id = v_payment and (p.amount, p.occurred_on) is distinct from (new.amount, new.occurred_on);
  return null;
end;
$$;
create trigger house_follow_tx
  after update of amount, kind, occurred_on on public.transactions
  for each row execute function private.house_follow_tx();

-- Borrar el movimiento desmarca, igual que en los pagos fijos propios. No si se va con la cuenta
-- bancaria o con la de Guaca, si la persona salió o si la casa se eliminó: ahí la historia de los
-- demás se queda.
create function private.house_tx_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.house_payments;
begin
  select p.* into v_payment
  from public.house_links l
  join public.house_payments p on p.id = l.payment_id
  join public.shared_members m on m.id = p.paid_by and m.removed_at is null
  join public.shared_groups g on g.id = p.group_id and g.deleted_at is null
  where l.tx_id = old.id;
  if v_payment.id is not null
    and exists (select 1 from public.accounts a where a.id = old.account_id)
    and exists (select 1 from auth.users u where u.id = old.user_id) then
    delete from public.house_payments where id = v_payment.id;
    perform private.shared_notify(
      v_payment.group_id, 'house_unpaid', null,
      (select b.name from public.house_bills b where b.id = v_payment.bill_id), v_payment.amount
    );
  end if;
  return old;
end;
$$;
create trigger house_tx_deleted
  before delete on public.transactions
  for each row execute function private.house_tx_deleted();

-- ---- Salir y quitar, con la casa como parte de la historia

create function private.shared_has_history(p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shared_entries e where e.paid_by = p_member)
    or exists (select 1 from public.shared_shares s where s.member_id = p_member)
    or exists (select 1 from public.house_payments p where p.paid_by = p_member);
$$;

-- Saca a alguien: ya validado y con el grupo bajo candado.
create function private.shared_take_out(p_member public.shared_members) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select sum(e.amount) from public.shared_entries e where e.paid_by = p_member.id), 0)
   <> coalesce((select sum(s.amount) from public.shared_shares s where s.member_id = p_member.id), 0) then
    raise exception 'Primero salda lo que tiene pendiente en el grupo.';
  end if;
  delete from public.shared_requests where member_id = p_member.id;
  delete from private.shared_invites where member_id = p_member.id;
  -- También las que esa persona había hecho al grupo.
  delete from private.shared_phone_invites i
  using public.shared_members m
  where m.id = i.member_id and m.group_id = p_member.group_id and (i.member_id = p_member.id or i.inviter = p_member.user_id);
  update public.house_bills set responsible = null where responsible = p_member.id;
  if private.shared_has_history(p_member.id) then
    update public.shared_members set removed_at = clock_timestamp() where id = p_member.id;
  else
    delete from public.shared_members where id = p_member.id;
  end if;
end;
$$;

create or replace function public.shared_remove_person(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.shared_members;
begin
  select * into v_member from public.shared_members where id = p_member;
  perform private.shared_can_manage(v_member);
  perform 1 from public.shared_groups g where g.id = v_member.group_id for update;
  select * into v_member from public.shared_members where id = p_member for update;
  if v_member.removed_at is not null then
    raise exception 'Esa persona ya no está en el grupo.';
  end if;
  perform private.shared_notify(v_member.group_id, 'member_removed', null, v_member.name, null, v_member.user_id);
  if v_member.user_id is not null then
    insert into public.shared_notices (user_id, kind, group_id, group_name)
    select v_member.user_id, 'you_removed', g.id, g.name from public.shared_groups g where g.id = v_member.group_id;
  end if;
  perform private.shared_take_out(v_member);
end;
$$;

-- Si sale quien lo creó, queda a cargo quien lleve más tiempo con cuenta.
create function public.shared_leave(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.shared_me(p_group);
  v_group public.shared_groups;
  v_member public.shared_members;
  v_next uuid;
begin
  select * into v_group from public.shared_groups where id = p_group for update;
  if v_group.direct then
    raise exception 'Es una cuenta entre dos: elimínala en vez de salir.';
  end if;
  select * into v_member from public.shared_members where id = v_me for update;
  select m.user_id into v_next
  from public.shared_members m
  where m.group_id = p_group and m.id <> v_me and m.user_id is not null and m.removed_at is null
  order by m.created_at, m.id
  limit 1;
  if v_next is null then
    raise exception 'Nadie más se ha unido con su cuenta: en vez de salir, elimínalo.';
  end if;
  if coalesce((select sum(e.amount) from public.shared_entries e where e.paid_by = v_me), 0)
   <> coalesce((select sum(s.amount) from public.shared_shares s where s.member_id = v_me), 0) then
    raise exception 'Primero salda lo que tienes pendiente en el grupo.';
  end if;
  perform private.shared_notify(p_group, 'member_left', null, v_member.name, null);
  perform private.shared_take_out(v_member);
  if v_group.created_by = v_member.user_id or v_group.created_by is null then
    update public.shared_groups set created_by = v_next where id = p_group;
  end if;
end;
$$;

-- Igual que en la 0024, contando los pagos de la casa como historia.
create or replace function public.shared_remove_group(p_group uuid, p_erase boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_group public.shared_groups;
  v_others boolean;
begin
  perform private.shared_me(p_group);
  select * into v_group from public.shared_groups where id = p_group for update;
  if not (v_group.direct or v_group.created_by is null or v_group.created_by = v_user) then
    raise exception 'Solo quien creó el grupo puede eliminarlo.';
  end if;
  v_others := exists (select 1 from public.shared_members m where m.group_id = p_group and m.user_id <> v_user);

  if not exists (select 1 from public.shared_entries e where e.group_id = p_group)
    and not exists (select 1 from public.house_payments p where p.group_id = p_group) then
    perform private.shared_notify(p_group, 'group_deleted', null, v_group.name, null);
    delete from public.shared_groups where id = p_group;
    return;
  end if;

  if coalesce(p_erase, false) then
    if v_others then
      raise exception 'Ya hay otra persona en el grupo: su historia no se puede borrar.';
    end if;
    update public.shared_members set removed_at = null where group_id = p_group and removed_at is not null;
    -- Los que creó la casa. Uno adoptado de un pago fijo ya existía: se queda.
    delete from public.transactions t
    using public.house_links l, public.house_payments p
    where l.tx_id = t.id and p.id = l.payment_id and p.group_id = p_group and t.user_id = v_user and t.bill_id is null;
    delete from public.transactions t
    using public.shared_links l, public.shared_entries e
    where l.tx_id = t.id and e.id = l.entry_id and e.group_id = p_group
      and l.created_tx and t.user_id = v_user;
    -- Los pagos y gastos primero: apuntan a las personas, que se van con el grupo.
    delete from public.house_payments where group_id = p_group;
    delete from public.shared_entries where group_id = p_group;
    delete from public.shared_groups where id = p_group;
    return;
  end if;

  if v_others and exists (
    select 1
    from public.shared_members m
    where m.group_id = p_group
      and coalesce((select sum(e.amount) from public.shared_entries e where e.paid_by = m.id), 0)
       <> coalesce((select sum(s.amount) from public.shared_shares s where s.member_id = m.id), 0)
  ) then
    raise exception 'Todavía hay saldos pendientes. Márquenlos como saldados y luego elimínalo.';
  end if;
  perform private.shared_notify(p_group, 'group_deleted', null, v_group.name, null);
  delete from public.shared_requests where group_id = p_group;
  delete from private.shared_invites i using public.shared_members m where m.id = i.member_id and m.group_id = p_group;
  delete from private.shared_phone_invites i using public.shared_members m where m.id = i.member_id and m.group_id = p_group;
  update public.shared_groups set deleted_at = now() where id = p_group;
end;
$$;

-- El borrado de antes de la 0023 no conocía la historia de la casa.
create or replace function public.shared_delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.shared_me(p_group);
  perform 1 from public.shared_groups g where g.id = p_group for update;
  if not exists (select 1 from public.shared_groups g where g.id = p_group and g.created_by = auth.uid()) then
    raise exception 'Solo quien creó el grupo puede borrarlo.';
  end if;
  if exists (select 1 from public.shared_entries e where e.group_id = p_group)
    or exists (select 1 from public.house_payments p where p.group_id = p_group) then
    raise exception 'El grupo tiene gastos: bórralos antes de borrar el grupo.';
  end if;
  delete from public.shared_groups where id = p_group;
end;
$$;

-- El calendario suscrito: también los recibos de los que soy responsable, y no los que pasaron a una casa.
create or replace function public.calendar_feed(p_token text)
returns table (id uuid, name text, kind text, due_day smallint, monthly_payment bigint, every text, starts_on date)
language sql stable security definer set search_path = '' as $$
  with owner as (select public.token_owner(p_token, 'calendar') as uid)
  select a.id, a.name, a.kind, a.due_day, a.monthly_payment, 'monthly'::text, null::date
  from public.accounts a, owner
  where a.user_id = owner.uid and a.kind in ('credit_card', 'loan') and a.due_day is not null
  union all
  select b.id, b.name, 'bill', b.due_day, b.amount, b.every, b.starts_on
  from public.bills b, owner
  where b.user_id = owner.uid and b.ended_month is null
  union all
  select h.id, h.name, 'bill', h.due_day, h.amount, h.every, h.starts_on
  from public.house_bills h
  join public.shared_groups g on g.id = h.group_id and g.house and g.deleted_at is null
  join public.shared_members m on m.id = h.responsible and m.removed_at is null
  join owner on owner.uid = m.user_id
  where h.ended_month is null
  order by 4, 2;
$$;

revoke all on function
  private.this_month(),
  private.house_me(uuid),
  private.house_attach(uuid, uuid),
  private.house_adopt(uuid, uuid),
  private.house_frozen(),
  private.house_follow_entry(),
  private.house_follow_tx(),
  private.house_tx_deleted(),
  private.shared_has_history(uuid),
  private.shared_take_out(public.shared_members)
from public, anon, authenticated;
revoke all on function
  public.house_create(text, text, jsonb),
  public.house_set(uuid, boolean),
  public.house_save_bill(uuid, uuid, text, bigint, text, int, text, date, uuid, boolean, uuid),
  public.house_merge_bill(uuid, uuid),
  public.house_end_bill(uuid),
  public.house_pay(uuid, text, date, uuid, bigint, date, boolean, uuid, jsonb, jsonb),
  public.house_update_payment(uuid, bigint, date, boolean, uuid),
  public.house_record(uuid, uuid),
  public.house_unpay(uuid),
  public.house_skip(uuid, text, date, text),
  public.house_unskip(uuid),
  public.shared_leave(uuid)
from public, anon, authenticated;
grant execute on function
  public.house_create(text, text, jsonb),
  public.house_set(uuid, boolean),
  public.house_save_bill(uuid, uuid, text, bigint, text, int, text, date, uuid, boolean, uuid),
  public.house_merge_bill(uuid, uuid),
  public.house_end_bill(uuid),
  public.house_pay(uuid, text, date, uuid, bigint, date, boolean, uuid, jsonb, jsonb),
  public.house_update_payment(uuid, bigint, date, boolean, uuid),
  public.house_record(uuid, uuid),
  public.house_unpay(uuid),
  public.house_skip(uuid, text, date, text),
  public.house_unskip(uuid),
  public.shared_leave(uuid)
to authenticated;
