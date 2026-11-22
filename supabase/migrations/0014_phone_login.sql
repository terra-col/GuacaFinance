-- Entrar con el celular (y la contraseña de siempre) cuando el correo ya está verificado.
--
-- El celular se guarda en el perfil (user_metadata.phone, +57 y 10 dígitos). Un disparador lo
-- copia a private.phones, donde cada número pertenece a una sola cuenta. Al entrar con el celular,
-- el servidor de Guaca pide el correo de esa cuenta con phone_login_email y entra con correo y
-- contraseña como siempre (Supabase Auth valida la contraseña y limita los intentos).
--
-- private no está expuesto por la API. Las dos funciones públicas solo responden a quien tenga la
-- llave del servidor (GUACA_LOGIN_KEY); en la base queda solo su huella SHA-256, que se guarda
-- aparte (no va en el repositorio):
--   insert into private.app_keys (name, hash) values ('login', encode(sha256('<la llave>'::bytea), 'hex'))
--   on conflict (name) do update set hash = excluded.hash;

create schema if not exists private;
revoke all on schema private from public;

create table private.app_keys (
  name text primary key,
  hash text not null check (hash ~ '^[0-9a-f]{64}$')
);

create table private.phones (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text not null unique check (phone ~ '^\+573[0-9]{9}$')
);

-- Keeps private.phones in step with the phone in each profile. A number already used by
-- another account is not copied (the app checks before saving, so this only covers a race).
create function private.sync_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  wanted text := new.raw_user_meta_data ->> 'phone';
begin
  delete from private.phones where user_id = new.id and phone is distinct from wanted;
  if wanted ~ '^\+573[0-9]{9}$' then
    insert into private.phones (user_id, phone) values (new.id, wanted) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger sync_phone
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function private.sync_phone();

-- Phones already saved in profiles.
insert into private.phones (user_id, phone)
select distinct on (raw_user_meta_data ->> 'phone') id, raw_user_meta_data ->> 'phone'
from auth.users
where raw_user_meta_data ->> 'phone' ~ '^\+573[0-9]{9}$'
order by raw_user_meta_data ->> 'phone', created_at
on conflict do nothing;

create function private.key_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.app_keys
    where name = 'login' and p_key is not null and hash = encode(pg_catalog.sha256(convert_to(p_key, 'UTF8')), 'hex')
  );
$$;

-- The email of the account with that phone, only when its email is already verified.
create function public.phone_login_email(p_phone text, p_key text) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.key_ok(p_key) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (
    select u.email from private.phones p join auth.users u on u.id = p.user_id
    where p.phone = p_phone and u.email_confirmed_at is not null
  );
end;
$$;

-- Whether another account (not p_user) already has that phone.
create function public.phone_in_use(p_phone text, p_key text, p_user uuid default null) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.key_ok(p_key) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return exists (select 1 from private.phones where phone = p_phone and user_id is distinct from p_user);
end;
$$;

revoke all on function private.sync_phone(), private.key_ok(text) from public;
revoke all on function public.phone_login_email(text, text), public.phone_in_use(text, text, uuid) from public;
grant execute on function public.phone_login_email(text, text), public.phone_in_use(text, text, uuid) to anon, authenticated;
