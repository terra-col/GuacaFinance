-- Compartidos: quitar a una persona de un grupo y eliminar un contacto.
--
--   * Quien no tiene historia en el grupo se borra. Quien la tiene queda con removed_at: sale del
--     grupo y lo que ya pasó sigue igual, para que no le cambie lo gastado ni los saldos a nadie.
--   * Solo se quita a quien está al día, y lo suyo queda fijo: ni gastos nuevos con esa persona
--     ni cambios a los viejos. Así su saldo no se puede mover sin que se entere.
--   * A quien se quitó le queda la lectura de lo de antes (para sus totales); nada posterior.
--   * Eliminar un contacto es de cada quien: lo saca de su lista y cierra su cuenta entre dos.
--     No lo saca de los grupos, que son de todos.

alter table public.shared_members add column removed_at timestamptz;

-- Miembro es quien sigue.
create or replace function public.is_shared_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shared_members m
    where m.group_id = p_group and m.user_id = auth.uid() and m.removed_at is null
  );
$$;

create or replace function private.shared_me(p_group uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid;
begin
  select m.id into v_me from public.shared_members m
  where m.group_id = p_group and m.user_id = auth.uid() and m.removed_at is null;
  if v_me is null then
    raise exception 'No haces parte de ese grupo.';
  end if;
  if exists (select 1 from public.shared_groups g where g.id = p_group and g.deleted_at is not null) then
    raise exception 'Ese grupo fue eliminado.';
  end if;
  return v_me;
end;
$$;

-- ---- Qué se lee: todo quien sigue; hasta el día en que salió, quien se fue.

create function public.shared_reads(p_group uuid, p_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shared_members m
    where m.group_id = p_group and m.user_id = auth.uid() and (m.removed_at is null or p_at <= m.removed_at)
  );
$$;
revoke all on function public.shared_reads(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.shared_reads(uuid, timestamptz) to authenticated;

drop policy "shared_groups: miembros" on public.shared_groups;
create policy "shared_groups: miembros" on public.shared_groups
  for select to authenticated using (public.shared_reads(id, created_at));

drop policy "shared_members: miembros" on public.shared_members;
create policy "shared_members: miembros" on public.shared_members
  for select to authenticated using (public.shared_reads(group_id, created_at));

drop policy "shared_entries: miembros" on public.shared_entries;
create policy "shared_entries: miembros" on public.shared_entries
  for select to authenticated using (public.shared_reads(group_id, created_at));

-- Las partes, las de los gastos que se leen.
drop policy "shared_shares: miembros" on public.shared_shares;
create policy "shared_shares: miembros" on public.shared_shares
  for select to authenticated using (exists (select 1 from public.shared_entries e where e.id = entry_id));

-- ---- Lo de quien salió no cambia

create function private.shared_not_removed(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_removed timestamptz;
begin
  -- El candado evita que entre un gasto mientras a esa persona la están quitando.
  select m.removed_at into v_removed from public.shared_members m where m.id = p_member for share;
  if v_removed is not null then
    raise exception 'Ahí está alguien que ya no es del grupo. Para cambiarlo, vuelve a agregar a esa persona.';
  end if;
end;
$$;

create function private.shared_frozen_share() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform private.shared_not_removed(old.member_id);
    return old;
  end if;
  perform private.shared_not_removed(new.member_id);
  return new;
end;
$$;
create trigger shared_frozen_share
  before insert or delete on public.shared_shares
  for each row execute function private.shared_frozen_share();

create function private.shared_frozen_entry() returns trigger
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
create trigger shared_frozen_entry
  before insert or delete or update of amount, paid_by on public.shared_entries
  for each row execute function private.shared_frozen_entry();

-- ---- Avisos: dos más, y a quien salió ya no le llegan

alter table public.shared_notices drop constraint shared_notices_kind_check;
alter table public.shared_notices add constraint shared_notices_kind_check check (
  kind in ('expense', 'payment', 'edited', 'removed', 'joined', 'you_joined', 'group_deleted', 'member_removed', 'you_removed')
);

create or replace function private.shared_notify(p_group uuid, p_kind text, p_entry uuid, p_detail text, p_amount bigint, p_except uuid default null)
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
    and m.removed_at is null
    and m.user_id is distinct from auth.uid()
    and m.user_id is distinct from p_except;
end;
$$;

-- ---- Quitar y volver a agregar

-- A quien no tiene cuenta, cualquiera del grupo; a quien ya entró, solo quien creó el grupo.
create function private.shared_can_manage(p_member public.shared_members) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.shared_me(p_member.group_id);
  v_group public.shared_groups;
begin
  if p_member.id = v_me then
    raise exception 'No puedes hacer eso contigo.';
  end if;
  select * into v_group from public.shared_groups where id = p_member.group_id;
  if v_group.direct then
    raise exception 'Es una cuenta entre dos: elimina la cuenta o el contacto.';
  end if;
  if p_member.user_id is not null and v_group.created_by is not null and v_group.created_by <> auth.uid() then
    raise exception 'A quien ya se unió solo lo puede quitar quien creó el grupo.';
  end if;
end;
$$;

create function public.shared_remove_person(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.shared_members;
  v_history boolean;
begin
  select * into v_member from public.shared_members where id = p_member;
  perform private.shared_can_manage(v_member);
  perform 1 from public.shared_groups g where g.id = v_member.group_id for update;
  select * into v_member from public.shared_members where id = p_member for update;
  if v_member.removed_at is not null then
    raise exception 'Esa persona ya no está en el grupo.';
  end if;

  if coalesce((select sum(e.amount) from public.shared_entries e where e.paid_by = p_member), 0)
   <> coalesce((select sum(s.amount) from public.shared_shares s where s.member_id = p_member), 0) then
    raise exception 'Primero salda lo que tiene pendiente en el grupo.';
  end if;
  v_history := exists (select 1 from public.shared_entries e where e.paid_by = p_member)
    or exists (select 1 from public.shared_shares s where s.member_id = p_member);

  perform private.shared_notify(v_member.group_id, 'member_removed', null, v_member.name, null, v_member.user_id);
  if v_member.user_id is not null then
    insert into public.shared_notices (user_id, kind, group_id, group_name)
    select v_member.user_id, 'you_removed', g.id, g.name from public.shared_groups g where g.id = v_member.group_id;
  end if;

  delete from public.shared_requests where member_id = p_member;
  delete from private.shared_invites where member_id = p_member;
  -- También las que esa persona había hecho al grupo.
  delete from private.shared_phone_invites i
  using public.shared_members m
  where m.id = i.member_id and m.group_id = v_member.group_id and (i.member_id = p_member or i.inviter = v_member.user_id);

  if v_history then
    update public.shared_members set removed_at = clock_timestamp() where id = p_member;
  else
    delete from public.shared_members where id = p_member;
  end if;
end;
$$;

-- Quien tiene cuenta vuelve solo si acepta: devuelve false mientras tanto.
create function public.shared_restore_person(p_member uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.shared_members;
begin
  select * into v_member from public.shared_members where id = p_member for update;
  perform private.shared_can_manage(v_member);
  if v_member.removed_at is null then
    raise exception 'Esa persona ya está en el grupo.';
  end if;
  if v_member.user_id is null then
    update public.shared_members set removed_at = null where id = p_member;
    return true;
  end if;
  insert into public.shared_requests (member_id, group_id, user_id, invited_by)
  values (p_member, v_member.group_id, v_member.user_id, auth.uid())
  on conflict (member_id) do update set invited_by = excluded.invited_by, created_at = now();
  return false;
end;
$$;

create or replace function public.shared_my_requests()
returns table (member_id uuid, group_name text, member_name text, invited_by_name text)
language sql stable security definer set search_path = '' as $$
  select r.member_id, g.name, m.name,
    (select i.name from public.shared_members i where i.group_id = r.group_id and i.user_id = r.invited_by)
  from public.shared_requests r
  join public.shared_members m on m.id = r.member_id
    and (m.user_id is null or (m.user_id = r.user_id and m.removed_at is not null))
  join public.shared_groups g on g.id = r.group_id
  where r.user_id = auth.uid()
  order by r.created_at desc;
$$;

create or replace function public.shared_respond(p_member uuid, p_accept boolean) returns uuid
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
  if v_member.user_id = v_user then
    update public.shared_members set removed_at = null where id = p_member;
    perform private.shared_notify(v_member.group_id, 'joined', null, v_member.name, null, v_user);
    return v_member.group_id;
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

-- Igual que en la 0023; al borrar una prueba, los que se habían quitado también se van.
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

  if not exists (select 1 from public.shared_entries e where e.group_id = p_group) then
    perform private.shared_notify(p_group, 'group_deleted', null, v_group.name, null);
    delete from public.shared_groups where id = p_group;
    return;
  end if;

  if coalesce(p_erase, false) then
    if v_others then
      raise exception 'Ya hay otra persona en el grupo: su historia no se puede borrar.';
    end if;
    update public.shared_members set removed_at = null where group_id = p_group and removed_at is not null;
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

-- ---- Contactos eliminados: de cada quien

create table public.shared_hidden_contacts (
  user_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid not null references public.shared_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, member_id)
);
alter table public.shared_hidden_contacts enable row level security;
revoke all on public.shared_hidden_contacts from public, anon, authenticated;
grant select on public.shared_hidden_contacts to authenticated;
create policy "shared_hidden_contacts: solo el dueño" on public.shared_hidden_contacts
  for select to authenticated using (user_id = (select auth.uid()));

-- p_members: todos los lugares de esa persona. p_directs: las cuentas entre dos que se cierran, con
-- las mismas reglas de eliminar un grupo. Todo o nada.
create function public.shared_delete_contact(p_members uuid[], p_directs uuid[], p_erase boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_direct uuid;
begin
  if v_user is null or coalesce(cardinality(p_members), 0) not between 1 and 500 then
    raise exception 'Ese contacto no es válido.';
  end if;
  if exists (
    select 1 from unnest(p_members) as p(id)
    where not exists (
      select 1 from public.shared_members m
      join public.shared_members mine on mine.group_id = m.group_id and mine.user_id = v_user
      where m.id = p.id and m.user_id is distinct from v_user
    )
  ) then
    raise exception 'Ese contacto no es tuyo.';
  end if;

  foreach v_direct in array coalesce(p_directs, '{}') loop
    if not exists (
      select 1 from public.shared_groups g
      join public.shared_members m on m.group_id = g.id
      where g.id = v_direct and g.direct and m.id = any (p_members)
    ) then
      raise exception 'Esa cuenta no es con ese contacto.';
    end if;
    perform public.shared_remove_group(v_direct, p_erase);
  end loop;

  -- Los que quedan: lo borrado del todo ya no hay que esconderlo.
  insert into public.shared_hidden_contacts (user_id, member_id)
  select v_user, m.id from public.shared_members m where m.id = any (p_members)
  on conflict do nothing;
end;
$$;

revoke all on function
  private.shared_not_removed(uuid),
  private.shared_frozen_share(),
  private.shared_frozen_entry(),
  private.shared_can_manage(public.shared_members)
from public, anon, authenticated;
revoke all on function
  public.shared_remove_person(uuid),
  public.shared_restore_person(uuid),
  public.shared_delete_contact(uuid[], uuid[], boolean)
from public, anon, authenticated;
grant execute on function
  public.shared_remove_person(uuid),
  public.shared_restore_person(uuid),
  public.shared_delete_contact(uuid[], uuid[], boolean)
to authenticated;
