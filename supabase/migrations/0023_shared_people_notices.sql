-- Compartidos: cuentas entre dos, eliminar grupos, invitaciones por celular y avisos.
--
--   * Eliminar un grupo con historia no la borra: lo oculta (deleted_at). Si se borrara, lo que
--     cada quien pagó por otros volvería a contar como gasto suyo y los pagos para saldar como
--     gastos e ingresos. Solo se borra del todo lo vacío, o una prueba donde nadie más se unió.
--   * Los celulares no están verificados, así que un número nunca da acceso por sí solo:
--       1. quien dice tener ese número ve solo quién lo invitó, no el grupo ni sus gastos;
--       2. si acepta, quien invitó ve su nombre y su correo a medias, y confirma;
--       3. solo entonces entra.
--     Quien invita no puede saber si un número tiene cuenta, a menos que esa persona acepte.
--   * Los avisos de cada quien solo los ve esa persona, y solo los escriben los disparadores.

create schema if not exists private;

alter table public.shared_groups
  add column direct boolean not null default false,
  add column deleted_at timestamptz;

-- Todo lo que escribe en un grupo pasa por aquí: en uno eliminado ya no se escribe.
create or replace function private.shared_me(p_group uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid;
begin
  select m.id into v_me from public.shared_members m where m.group_id = p_group and m.user_id = auth.uid();
  if v_me is null then
    raise exception 'No haces parte de ese grupo.';
  end if;
  if exists (select 1 from public.shared_groups g where g.id = p_group and g.deleted_at is not null) then
    raise exception 'Ese grupo fue eliminado.';
  end if;
  return v_me;
end;
$$;

create function private.shared_direct_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.shared_groups g where g.id = new.group_id and g.direct)
    and (select count(*) from public.shared_members m where m.group_id = new.group_id) >= 2 then
    raise exception 'Es una cuenta solo entre dos. Para más personas, crea un grupo.';
  end if;
  return new;
end;
$$;
create trigger shared_direct_limit
  before insert on public.shared_members
  for each row execute function private.shared_direct_limit();

-- ---- Avisos

create table public.shared_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'payment', 'edited', 'removed', 'joined', 'you_joined', 'group_deleted')),
  group_id uuid references public.shared_groups (id) on delete set null,
  group_name text,
  entry_id uuid,
  actor_name text,
  detail text,
  amount bigint,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index shared_notices_user_idx on public.shared_notices (user_id, created_at desc);

alter table public.shared_notices enable row level security;
revoke all on public.shared_notices from public, anon, authenticated;
grant select on public.shared_notices to authenticated;
create policy "shared_notices: solo el dueño" on public.shared_notices
  for select to authenticated using (user_id = (select auth.uid()));

-- A los demás miembros con cuenta; nunca a quien lo hizo.
create function private.shared_notify(p_group uuid, p_kind text, p_entry uuid, p_detail text, p_amount bigint, p_except uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_group public.shared_groups;
  v_actor text;
begin
  select * into v_group from public.shared_groups where id = p_group;
  -- El grupo se está borrando entero.
  if v_group.id is null then
    return;
  end if;
  select m.name into v_actor from public.shared_members m where m.group_id = p_group and m.user_id = auth.uid();
  -- Editar cinco veces es un solo aviso sin leer.
  if p_kind = 'edited' then
    delete from public.shared_notices n where n.entry_id = p_entry and n.kind = 'edited' and n.read_at is null;
  end if;
  insert into public.shared_notices (user_id, kind, group_id, group_name, entry_id, actor_name, detail, amount)
  select m.user_id, p_kind, p_group, v_group.name, p_entry, v_actor, p_detail, p_amount
  from public.shared_members m
  where m.group_id = p_group
    and m.user_id is not null
    and m.user_id is distinct from auth.uid()
    and m.user_id is distinct from p_except;
end;
$$;

create function private.shared_notice_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.shared_notify(new.group_id, case new.kind when 'settlement' then 'payment' else 'expense' end, new.id, new.description, new.amount);
  elsif tg_op = 'UPDATE' then
    perform private.shared_notify(new.group_id, 'edited', new.id, new.description, new.amount);
  else
    perform private.shared_notify(old.group_id, 'removed', old.id, old.description, old.amount);
  end if;
  return null;
end;
$$;
create trigger shared_notice_entry
  after insert or delete or update of description, amount, paid_by, occurred_on on public.shared_entries
  for each row execute function private.shared_notice_entry();

create function private.shared_notice_joined() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.shared_notify(new.group_id, 'joined', null, new.name, null, new.user_id);
  -- Lo confirmó quien invitó: a quien entra también le llega.
  if new.user_id is distinct from auth.uid() then
    insert into public.shared_notices (user_id, kind, group_id, group_name)
    select new.user_id, 'you_joined', g.id, g.name from public.shared_groups g where g.id = new.group_id;
  end if;
  return null;
end;
$$;
create trigger shared_notice_joined
  after update of user_id on public.shared_members
  for each row when (old.user_id is null and new.user_id is not null)
  execute function private.shared_notice_joined();

create function public.shared_read_notices(p_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.shared_notices set read_at = now()
  where user_id = auth.uid() and read_at is null and created_at <= p_until;
  delete from public.shared_notices
  where user_id = auth.uid() and read_at is not null and created_at < now() - interval '90 days';
end;
$$;

-- ---- Invitaciones por celular

create table private.shared_phone_invites (
  id uuid primary key default gen_random_uuid(),
  inviter uuid not null references auth.users (id) on delete cascade,
  member_id uuid not null references public.shared_members (id) on delete cascade,
  phone text not null check (phone ~ '^\+573[0-9]{9}$'),
  created_at timestamptz not null default now(),
  declined boolean not null default false,
  claimant uuid references auth.users (id) on delete set null,
  unique (inviter, member_id)
);
create index shared_phone_invites_phone_idx on private.shared_phone_invites (phone);
alter table private.shared_phone_invites enable row level security;
revoke all on private.shared_phone_invites from public, anon, authenticated;

-- Guardar a alguien sin cuenta con su celular lo deja invitado. Guardarlo otra vez es volver a invitarlo.
create or replace function private.shared_save_contact(p_member uuid, p_name text, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.shared_contacts (user_id, member_id, name, phone)
  values (auth.uid(), p_member, nullif(btrim(p_name), ''), nullif(p_phone, ''))
  on conflict (user_id, member_id) do update set name = excluded.name, phone = excluded.phone;

  if p_phone ~ '^\+573[0-9]{9}$'
    and exists (select 1 from public.shared_members m where m.id = p_member and m.user_id is null) then
    insert into private.shared_phone_invites as i (inviter, member_id, phone)
    values (auth.uid(), p_member, p_phone)
    on conflict (inviter, member_id) do update set
      phone = excluded.phone,
      created_at = now(),
      declined = false,
      claimant = case when i.phone = excluded.phone then i.claimant end;
  else
    delete from private.shared_phone_invites where inviter = auth.uid() and member_id = p_member;
  end if;
end;
$$;

-- Invitada dentro de Guaca, ya no hace falta por celular: si dice «Ahora no», no le vuelve a salir.
create function private.shared_request_replaces_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.shared_phone_invites where member_id = new.member_id;
  return null;
end;
$$;
create trigger shared_request_replaces_phone
  after insert or update on public.shared_requests
  for each row execute function private.shared_request_replaces_phone();

-- El celular de quien pregunta, solo si su correo está confirmado.
create function private.my_phone() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or to_regclass('private.phones') is null then
    return null;
  end if;
  return (
    select p.phone from private.phones p join auth.users u on u.id = p.user_id
    where p.user_id = auth.uid() and u.email_confirmed_at is not null
  );
end;
$$;

-- Las que me corresponden: solo quién invita. Ni grupo, ni gastos, ni otros nombres.
create function public.shared_phone_invites()
returns table (id uuid, from_name text, waiting boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_phone text := private.my_phone();
begin
  if v_phone is null then
    return;
  end if;
  return query
    select i.id, host.name, i.claimant is not null
    from private.shared_phone_invites i
    join public.shared_members m on m.id = i.member_id and m.user_id is null
    join public.shared_groups g on g.id = m.group_id and g.deleted_at is null
    join public.shared_members host on host.group_id = m.group_id and host.user_id = i.inviter
    where i.phone = v_phone
      and i.inviter <> auth.uid()
      and not i.declined
      and (i.claimant is null or i.claimant = auth.uid())
      and i.created_at > now() - interval '30 days'
      and not exists (select 1 from public.shared_requests r where r.member_id = m.id)
      and not exists (select 1 from public.shared_members x where x.group_id = m.group_id and x.user_id = auth.uid())
    order by i.created_at desc
    limit 20;
end;
$$;

create function public.shared_phone_answer(p_invite uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.shared_phone_invites() s where s.id = p_invite) then
    raise exception 'Esa invitación ya no está.';
  end if;
  update private.shared_phone_invites set
    declined = not coalesce(p_accept, false),
    claimant = case when p_accept then auth.uid() end
  where id = p_invite;
end;
$$;

-- A quien invitó: quién aceptó, con lo justo para reconocerlo.
create function public.shared_phone_claims()
returns table (id uuid, member_name text, group_name text, account_name text, account_email text)
language sql stable security definer set search_path = '' as $$
  select i.id, m.name, g.name,
    left(coalesce(u.raw_user_meta_data ->> 'name', ''), 60),
    left(split_part(u.email, '@', 1), 2) || '•••@' || split_part(u.email, '@', 2)
  from private.shared_phone_invites i
  join public.shared_members m on m.id = i.member_id and m.user_id is null
  join public.shared_groups g on g.id = m.group_id and g.deleted_at is null
  join public.shared_members host on host.group_id = m.group_id and host.user_id = i.inviter
  join auth.users u on u.id = i.claimant
  where i.inviter = auth.uid() and not i.declined
  order by i.created_at desc;
$$;

create function public.shared_phone_confirm(p_invite uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invite private.shared_phone_invites;
  v_member public.shared_members;
begin
  select * into v_invite from private.shared_phone_invites
  where id = p_invite and inviter = auth.uid() and claimant is not null and not declined
  for update;
  if v_invite.id is null then
    raise exception 'Esa solicitud ya no está.';
  end if;
  select * into v_member from public.shared_members where id = v_invite.member_id for update;
  perform private.shared_me(v_member.group_id);
  if not coalesce(p_accept, false) then
    update private.shared_phone_invites set declined = true, claimant = null where id = p_invite;
    return null;
  end if;
  if not exists (
    select 1 from private.phones p join auth.users u on u.id = p.user_id
    where p.user_id = v_invite.claimant and p.phone = v_invite.phone and u.email_confirmed_at is not null
  ) then
    raise exception 'Esa cuenta ya no tiene ese celular. Vuelve a invitar a la persona.';
  end if;
  if v_member.user_id is not null then
    raise exception 'Alguien ya ocupó ese lugar.';
  end if;
  if exists (select 1 from public.shared_members m where m.group_id = v_member.group_id and m.user_id = v_invite.claimant) then
    raise exception 'Esa cuenta ya está en el grupo.';
  end if;
  update public.shared_members set user_id = v_invite.claimant where id = v_member.id;
  delete from private.shared_phone_invites where member_id = v_member.id;
  delete from private.shared_invites where member_id = v_member.id;
  delete from public.shared_requests where member_id = v_member.id;
  return v_member.group_id;
end;
$$;

-- El número de la campana: avisos sin leer y lo que espera mi respuesta.
create function public.shared_pending_count() returns int
language sql stable security definer set search_path = '' as $$
  select (
    (select count(*) from public.shared_notices n where n.user_id = auth.uid() and n.read_at is null)
    + (select count(*) from public.shared_my_requests())
    + (select count(*) from public.shared_phone_invites() i where not i.waiting)
    + (select count(*) from public.shared_phone_claims())
  )::int;
$$;

-- ---- Cuentas entre dos

-- Con alguien que ya tiene cuenta (p_known) hay una sola.
create function public.shared_create_direct(p_my_name text, p_name text, p_phone text, p_known uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_other uuid;
  v_group uuid;
begin
  if p_known is not null then
    select m.user_id into v_other from public.shared_members m
    where m.id = p_known and public.is_shared_member(m.group_id);
    if v_other is null or v_other = auth.uid() then
      raise exception 'Solo puedes invitar así a alguien con quien ya compartes un grupo.';
    end if;
    select g.id into v_group
    from public.shared_groups g
    join public.shared_members mine on mine.group_id = g.id and mine.user_id = auth.uid()
    where g.direct and g.deleted_at is null
      and (
        exists (select 1 from public.shared_members o where o.group_id = g.id and o.user_id = v_other)
        or exists (select 1 from public.shared_requests r where r.group_id = g.id and r.user_id = v_other)
      )
    limit 1;
    if v_group is not null then
      return v_group;
    end if;
  end if;
  v_group := public.shared_create_group_people(
    left(btrim(p_my_name) || ' y ' || btrim(p_name), 60),
    p_my_name,
    jsonb_build_array(jsonb_build_object('name', p_name, 'phone', p_phone, 'known', p_known))
  );
  update public.shared_groups set direct = true where id = v_group;
  return v_group;
end;
$$;

-- ---- Eliminar un grupo

-- p_erase: fue una prueba; se borra todo, con los movimientos que el grupo creó en mis cuentas.
create function public.shared_remove_group(p_group uuid, p_erase boolean) returns void
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

  if not exists (select 1 from public.shared_entries e where e.group_id = p_group) then
    perform private.shared_notify(p_group, 'group_deleted', null, v_group.name, null);
    delete from public.shared_groups where id = p_group;
    return;
  end if;

  if coalesce(p_erase, false) then
    if v_others then
      raise exception 'Ya hay otra persona en el grupo: su historia no se puede borrar.';
    end if;
    delete from public.transactions t
    using public.shared_links l, public.shared_entries e
    where l.tx_id = t.id and e.id = l.entry_id and e.group_id = p_group
      and l.created_tx and t.user_id = v_user;
    -- Los gastos primero: sus partes apuntan a las personas, que se van con el grupo.
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

revoke all on function
  private.shared_direct_limit(),
  private.shared_request_replaces_phone(),
  private.shared_notify(uuid, text, uuid, text, bigint, uuid),
  private.shared_notice_entry(),
  private.shared_notice_joined(),
  private.shared_save_contact(uuid, text, text),
  private.shared_me(uuid),
  private.my_phone()
from public, anon, authenticated;
revoke all on function
  public.shared_read_notices(timestamptz),
  public.shared_phone_invites(),
  public.shared_phone_answer(uuid, boolean),
  public.shared_phone_claims(),
  public.shared_phone_confirm(uuid, boolean),
  public.shared_pending_count(),
  public.shared_create_direct(text, text, text, uuid),
  public.shared_remove_group(uuid, boolean)
from public, anon, authenticated;
grant execute on function
  public.shared_read_notices(timestamptz),
  public.shared_phone_invites(),
  public.shared_phone_answer(uuid, boolean),
  public.shared_phone_claims(),
  public.shared_phone_confirm(uuid, boolean),
  public.shared_pending_count(),
  public.shared_create_direct(text, text, text, uuid),
  public.shared_remove_group(uuid, boolean)
to authenticated;
