-- Compartidos: editar grupos, personas, gastos y pagos, y asociar personas por su celular.
--
--   * shared_contacts es la agenda de cada quien: el nombre con el que tú tienes a esa persona y
--     su número. Solo la ve su dueño: los demás miembros no ven números.
--   * Nunca se busca una cuenta por celular: los números no están verificados y cualquiera podría
--     registrar el de otro. Un número queda asociado a una cuenta cuando esa persona acepta un
--     enlace. Desde ahí se le puede invitar dentro de Guaca a otros grupos.
--   * Nadie entra a un grupo sin aceptar: su parte cuenta en sus gastos.

create schema if not exists private;

create table public.shared_contacts (
  user_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid not null references public.shared_members (id) on delete cascade,
  name text check (length(btrim(name)) between 1 and 60),
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  primary key (user_id, member_id)
);

create table public.shared_requests (
  member_id uuid primary key,
  group_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, user_id),
  foreign key (member_id, group_id) references public.shared_members (id, group_id) on delete cascade
);

alter table public.shared_contacts enable row level security;
alter table public.shared_requests enable row level security;
revoke all on public.shared_contacts, public.shared_requests from public, anon, authenticated;
grant select on public.shared_contacts, public.shared_requests to authenticated;

create policy "shared_contacts: solo el dueño" on public.shared_contacts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "shared_requests: el grupo y el invitado" on public.shared_requests
  for select to authenticated using (user_id = (select auth.uid()) or public.is_shared_member(group_id));

-- Invita dentro de Guaca a alguien con quien ya comparto un grupo (p_known es su lugar allá).
create function private.shared_request(p_member uuid, p_known uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.shared_members;
  v_known public.shared_members;
begin
  select * into v_member from public.shared_members where id = p_member for update;
  perform private.shared_me(v_member.group_id);
  if v_member.user_id is not null then
    raise exception 'Esa persona ya se unió.';
  end if;
  select * into v_known from public.shared_members where id = p_known;
  if v_known.user_id is null or not public.is_shared_member(v_known.group_id) then
    raise exception 'Solo puedes invitar así a alguien con quien ya compartes un grupo.';
  end if;
  if exists (select 1 from public.shared_members m where m.group_id = v_member.group_id and m.user_id = v_known.user_id)
    or exists (
      select 1 from public.shared_requests r
      where r.group_id = v_member.group_id and r.user_id = v_known.user_id and r.member_id <> p_member
    ) then
    raise exception 'Esa persona ya está en el grupo o ya está invitada.';
  end if;
  insert into public.shared_requests (member_id, group_id, user_id, invited_by)
  values (p_member, v_member.group_id, v_known.user_id, auth.uid())
  on conflict (member_id) do update set user_id = excluded.user_id, invited_by = excluded.invited_by, created_at = now();
end;
$$;

create function private.shared_save_contact(p_member uuid, p_name text, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.shared_contacts (user_id, member_id, name, phone)
  values (auth.uid(), p_member, nullif(btrim(p_name), ''), nullif(p_phone, ''))
  on conflict (user_id, member_id) do update set name = excluded.name, phone = excluded.phone;
end;
$$;

-- p_people: [{"name": "…", "phone": "+57…" | null, "known": "<su lugar en otro grupo>" | null}]
create function public.shared_create_group_people(p_name text, p_my_name text, p_people jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid;
  v_person record;
  v_member uuid;
begin
  if p_people is null or jsonb_typeof(p_people) <> 'array' then
    raise exception 'Agrega al menos una persona.';
  end if;
  v_group := public.shared_create_group(
    p_name,
    p_my_name,
    array(select p.name from jsonb_to_recordset(p_people) as p(name text))
  );
  for v_person in select * from jsonb_to_recordset(p_people) as p(name text, phone text, known uuid) loop
    select m.id into v_member from public.shared_members m
    where m.group_id = v_group and lower(btrim(m.name)) = lower(btrim(v_person.name));
    perform private.shared_save_contact(v_member, v_person.name, v_person.phone);
    if v_person.known is not null then
      perform private.shared_request(v_member, v_person.known);
    end if;
  end loop;
  return v_group;
end;
$$;

create function public.shared_add_person(p_group uuid, p_name text, p_phone text, p_known uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
begin
  v_member := public.shared_add_member(p_group, p_name);
  perform private.shared_save_contact(v_member, p_name, p_phone);
  if p_known is not null then
    perform private.shared_request(v_member, p_known);
  end if;
  return v_member;
end;
$$;

create function public.shared_rename_group(p_group uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.shared_me(p_group);
  update public.shared_groups set name = btrim(p_name) where id = p_group;
end;
$$;

-- El propio nombre y el de quien no tiene cuenta cambian para todo el grupo. El de quien ya tiene
-- cuenta es suyo: ahí solo cambia cómo lo veo yo.
create function public.shared_edit_person(p_member uuid, p_name text, p_phone text, p_known uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.shared_members;
  v_me uuid;
  v_shown text;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Escribe el nombre.';
  end if;
  select * into v_member from public.shared_members where id = p_member for update;
  v_me := private.shared_me(v_member.group_id);
  if v_me = p_member then
    update public.shared_members set name = btrim(p_name) where id = p_member;
    return;
  end if;
  if v_member.user_id is null then
    select coalesce(c.name, v_member.name) into v_shown
    from (select 1) as one
    left join public.shared_contacts c on c.member_id = p_member and c.user_id = auth.uid();
    if btrim(p_name) is distinct from v_shown then
      update public.shared_members set name = btrim(p_name) where id = p_member;
    end if;
  end if;
  perform private.shared_save_contact(p_member, p_name, p_phone);
  if p_known is not null and v_member.user_id is null then
    perform private.shared_request(p_member, p_known);
  end if;
end;
$$;

create function public.shared_my_requests()
returns table (member_id uuid, group_name text, member_name text, invited_by_name text)
language sql stable security definer set search_path = '' as $$
  select r.member_id, g.name, m.name,
    (select i.name from public.shared_members i where i.group_id = r.group_id and i.user_id = r.invited_by)
  from public.shared_requests r
  join public.shared_members m on m.id = r.member_id and m.user_id is null
  join public.shared_groups g on g.id = r.group_id
  where r.user_id = auth.uid()
  order by r.created_at desc;
$$;

create function public.shared_respond(p_member uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_member public.shared_members;
begin
  select m.* into v_member
  from public.shared_requests r
  join public.shared_members m on m.id = r.member_id
  where r.member_id = p_member and r.user_id = v_user
  for update of m;
  if v_member.id is null then
    raise exception 'Esa invitación ya no está.';
  end if;
  delete from public.shared_requests where member_id = p_member;
  if not coalesce(p_accept, false) then
    return null;
  end if;
  if exists (select 1 from public.shared_members m where m.group_id = v_member.group_id and m.user_id = v_user) then
    return v_member.group_id;
  end if;
  if v_member.user_id is not null then
    raise exception 'Alguien ya ocupó ese lugar con el enlace. Pide otra invitación.';
  end if;
  update public.shared_members set user_id = v_user where id = p_member;
  delete from private.shared_invites where member_id = p_member;
  return v_member.group_id;
end;
$$;

-- El valor de un movimiento enlazado solo puede ser el de su registro en el grupo.
create or replace function private.shared_guard_tx() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.amount <> old.amount or new.kind <> old.kind)
    and exists (
      select 1 from public.shared_links l
      join public.shared_entries e on e.id = l.entry_id
      where l.tx_id = old.id and (new.kind <> old.kind or new.amount <> e.amount)
    ) then
    raise exception 'Este movimiento está en Compartidos: edítalo allá.';
  end if;
  return new;
end;
$$;

-- Edita un gasto o un pago. Puede quien lo registró o quien pagó. Nunca mueve la plata de otro: si
-- alguien más ya lo registró en su cuenta, el valor y quién pagó quedan fijos. En un pago para
-- saldar no cambian las personas.
create function public.shared_update_entry(
  p_entry uuid,
  p_description text,
  p_category text,
  p_amount bigint,
  p_paid_by uuid,
  p_occurred_on date,
  p_shares jsonb,
  p_account uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_old public.shared_entries;
  v_new public.shared_entries;
  v_me uuid;
  v_receiver uuid;
  v_payer uuid;
  v_link public.shared_links;
  v_account_kind text;
  v_count int;
  v_sum numeric;
begin
  select * into v_old from public.shared_entries where id = p_entry for update;
  v_me := private.shared_me(v_old.group_id);
  if not (v_old.created_by is not distinct from v_user or v_old.paid_by = v_me) then
    raise exception 'Solo quien lo registró o quien pagó puede editarlo.';
  end if;

  if v_old.kind = 'settlement' then
    select s.member_id into v_receiver from public.shared_shares s where s.entry_id = p_entry;
    v_payer := v_old.paid_by;
  else
    v_payer := p_paid_by;
    if not exists (select 1 from public.shared_members m where m.id = v_payer and m.group_id = v_old.group_id) then
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
        or not exists (select 1 from public.shared_members m where m.id = s.member_id and m.group_id = v_old.group_id)
    ) or v_count <> (select count(distinct s.member_id) from jsonb_to_recordset(p_shares) as s(member_id uuid, amount bigint)) then
      raise exception 'Las partes no son válidas.';
    end if;
  end if;

  if (p_amount is distinct from v_old.amount or v_payer is distinct from v_old.paid_by)
    and exists (select 1 from public.shared_links l where l.entry_id = p_entry and l.user_id <> v_user) then
    raise exception 'Otra persona ya lo registró en su cuenta: el valor y quién pagó no se pueden cambiar.';
  end if;

  select * into v_link from public.shared_links where entry_id = p_entry and user_id = v_user;
  -- Ya no pagué yo: el movimiento que creó el grupo se va; el que yo ya tenía se queda.
  if v_link.tx_id is not null and v_old.paid_by = v_me and v_payer <> v_me then
    if v_link.created_tx then
      delete from public.transactions where id = v_link.tx_id and user_id = v_user;
    else
      delete from public.shared_links where tx_id = v_link.tx_id;
    end if;
    v_link := null;
  end if;

  update public.shared_entries set
    description = btrim(p_description),
    category = case when kind = 'expense' then nullif(nullif(btrim(p_category), ''), 'Ajuste de saldo') end,
    amount = p_amount,
    paid_by = v_payer,
    occurred_on = p_occurred_on
  where id = p_entry
  returning * into v_new;

  delete from public.shared_shares where entry_id = p_entry;
  if v_old.kind = 'settlement' then
    insert into public.shared_shares (entry_id, group_id, member_id, amount)
    values (p_entry, v_old.group_id, v_receiver, p_amount);
  else
    insert into public.shared_shares (entry_id, group_id, member_id, amount)
    select p_entry, v_old.group_id, s.member_id, s.amount
    from jsonb_to_recordset(p_shares) as s(member_id uuid, amount bigint);
  end if;

  if v_link.tx_id is not null then
    if v_link.created_tx and p_account is not null then
      select a.kind into v_account_kind from public.accounts a where a.id = p_account and a.user_id = v_user;
      if v_account_kind is null or v_account_kind = 'loan'
        or (v_old.kind = 'settlement' and v_account_kind not in ('savings', 'cash')) then
        raise exception 'Elige una de tus cuentas válidas para ese movimiento.';
      end if;
    end if;
    -- Solo lo que se cambió: la categoría o el nombre que le di a mi movimiento se respetan.
    update public.transactions t set
      amount = v_new.amount,
      occurred_on = case when v_new.occurred_on <> v_old.occurred_on then v_new.occurred_on else t.occurred_on end,
      description = case when v_new.description <> v_old.description then v_new.description else t.description end,
      category = case when v_new.category is distinct from v_old.category then v_new.category else t.category end,
      account_id = case when v_link.created_tx then coalesce(p_account, t.account_id) else t.account_id end
    where t.id = v_link.tx_id and t.user_id = v_user;
  elsif p_account is not null then
    perform private.shared_attach(p_entry, p_account, null);
  end if;
  return p_entry;
end;
$$;

-- Cuáles registros ya puso otra persona en su cuenta (solo cuáles: ni quién ni en qué cuenta).
create function public.shared_recorded_by_others(p_group uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct e.id), '{}')
  from public.shared_entries e
  join public.shared_links l on l.entry_id = e.id and l.user_id <> auth.uid()
  where e.group_id = p_group and public.is_shared_member(p_group);
$$;

revoke all on function private.shared_request(uuid, uuid), private.shared_save_contact(uuid, text, text), private.shared_guard_tx()
  from public, anon, authenticated;
revoke all on function
  public.shared_create_group_people(text, text, jsonb),
  public.shared_add_person(uuid, text, text, uuid),
  public.shared_rename_group(uuid, text),
  public.shared_edit_person(uuid, text, text, uuid),
  public.shared_my_requests(),
  public.shared_respond(uuid, boolean),
  public.shared_recorded_by_others(uuid),
  public.shared_update_entry(uuid, text, text, bigint, uuid, date, jsonb, uuid)
from public, anon, authenticated;
grant execute on function
  public.shared_create_group_people(text, text, jsonb),
  public.shared_add_person(uuid, text, text, uuid),
  public.shared_rename_group(uuid, text),
  public.shared_edit_person(uuid, text, text, uuid),
  public.shared_my_requests(),
  public.shared_respond(uuid, boolean),
  public.shared_recorded_by_others(uuid),
  public.shared_update_entry(uuid, text, text, bigint, uuid, date, jsonb, uuid)
to authenticated;
