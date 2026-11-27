-- Traslados entre cuentas propias: de la nómina al efectivo, del banco a Wise. Si las dos cuentas
-- tienen monedas distintas es un cambio de moneda.
--
--   * kind = 'transfer': sale de source_account_id y llega a account_id. Las dos son cuentas de
--     ahorros o efectivo de la misma persona. No es gasto ni ingreso.
--   * En pesos: amount. Con una cuenta en otra moneda, el movimiento va en esa moneda (0030):
--     original_amount es lo que sale o llega allá y amount son los pesos del otro lado; la tasa
--     es la del cambio.
--   * Dos monedas distintas del peso en un mismo traslado, no (0030 lo rechaza).
--   * Si se borra una de las dos cuentas, el traslado queda en la otra como un ajuste, para que su
--     saldo no cambie.

alter table public.transactions drop constraint transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in ('income', 'expense', 'payment', 'transfer'));

-- La cuenta de origen: en pagos y, ahora, en traslados (donde es obligatoria).
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.transactions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%source_account_id IS NULL%payment%'
      and pg_get_constraintdef(oid) not like '%transfer%'
  loop
    execute format('alter table public.transactions drop constraint %I', c);
  end loop;
end;
$$;
alter table public.transactions
  add constraint transactions_source_kind_check check (source_account_id is null or kind in ('payment', 'transfer')),
  add constraint transactions_transfer_source_check check (kind <> 'transfer' or source_account_id is not null);

-- Las dos puntas de un traslado son cuentas de ahorros o efectivo.
create function private.transfer_between_money() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'transfer' and (
    not exists (select 1 from public.accounts a where a.id = new.account_id and a.kind in ('savings', 'cash'))
    or not exists (select 1 from public.accounts a where a.id = new.source_account_id and a.kind in ('savings', 'cash'))
  ) then
    raise exception 'Un traslado va entre cuentas de ahorros o efectivo.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.transfer_between_money() from public, anon, authenticated;
create trigger transfer_between_money
  before insert or update of kind, account_id, source_account_id on public.transactions
  for each row execute function private.transfer_between_money();

-- Al borrar una cuenta, sus traslados quedan en la otra como ajuste (la otra conserva su saldo).
create function private.keep_transfers_of_deleted_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  -- Llegaba a la cuenta borrada: en el origen queda la salida.
  update public.transactions t
  set kind = 'expense',
      account_id = t.source_account_id,
      source_account_id = null,
      category = 'Ajuste de saldo',
      description = 'Traslado a ' || old.name || ' (cuenta eliminada)'
  where t.account_id = old.id and t.kind = 'transfer' and t.user_id = old.user_id;
  -- Salía de la cuenta borrada: en el destino queda la llegada.
  update public.transactions t
  set kind = 'income',
      source_account_id = null,
      category = 'Ajuste de saldo',
      description = 'Traslado desde ' || old.name || ' (cuenta eliminada)'
  where t.source_account_id = old.id and t.kind = 'transfer' and t.user_id = old.user_id;
  return old;
end;
$$;
revoke all on function private.keep_transfers_of_deleted_account() from public, anon, authenticated;
create trigger keep_transfers_of_deleted_account
  before delete on public.accounts
  for each row execute function private.keep_transfers_of_deleted_account();

-- La app pregunta por esta función antes de ofrecer traslados.
create function public.transfers_ready() returns boolean
language sql immutable set search_path = '' as $$ select true $$;
revoke all on function public.transfers_ready() from public, anon, authenticated;
grant execute on function public.transfers_ready() to authenticated;
