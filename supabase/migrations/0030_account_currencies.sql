-- Cuentas en otra moneda: dólares en Wise, euros en un banco de allá, dírhams en efectivo.
--
--   * El peso sigue siendo la base: cada movimiento guarda su valor en pesos (amount) y, si es en
--     otra moneda, el original y la tasa (0026).
--   * Una cuenta en USD, EUR o AED lleva su saldo en esa moneda: el saldo inicial en su moneda
--     (opening_original; opening_balance queda en pesos con la tasa de ese día) y todos sus
--     movimientos en esa moneda. Para sumar al total la app la valora con la tasa de hoy.
--   * Los ajustes de saldo de una cuenta en otra moneda guardan el saldo del banco (checkpoint) en
--     centavos de su moneda; su valor en pesos es solo de referencia.
--   * Un pago desde una cuenta en dólares a una tarjeta en pesos va en dólares: sale el original
--     de la cuenta y baja la deuda en pesos. Dos monedas distintas del peso en un mismo movimiento,
--     no.
--   * La moneda de una cuenta no cambia una vez tiene movimientos.

alter table public.accounts
  add column currency text not null default 'COP' check (currency in ('COP', 'USD', 'EUR', 'AED')),
  add column opening_original numeric(16, 2),
  add constraint accounts_currency_opening_check check (
    (currency = 'COP' and opening_original is null)
    or (currency <> 'COP' and opening_original is not null and opening_original >= 0)
  );

-- Los movimientos de una cuenta en otra moneda van en esa moneda (salvo los ajustes de saldo).
create function private.tx_follows_account_currency() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_target text;
  v_source text;
begin
  if new.category is not distinct from 'Ajuste de saldo' then
    return new;
  end if;
  select a.currency into v_target from public.accounts a where a.id = new.account_id;
  if new.source_account_id is not null then
    select a.currency into v_source from public.accounts a where a.id = new.source_account_id;
  end if;
  if v_target is not null and v_target <> 'COP' and new.currency <> v_target then
    raise exception 'La cuenta es en %: el movimiento debe ir en esa moneda.', v_target using errcode = 'check_violation';
  end if;
  if v_source is not null and v_source <> 'COP' and new.currency <> v_source then
    raise exception 'La cuenta de origen es en %: el pago debe ir en esa moneda.', v_source using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.tx_follows_account_currency() from public, anon, authenticated;
create trigger tx_follows_account_currency
  before insert or update of account_id, source_account_id, currency, category on public.transactions
  for each row execute function private.tx_follows_account_currency();

-- Cambiar la moneda de una cuenta que ya tiene movimientos cambiaría su historia: no se permite.
create function private.account_currency_fixed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from public.transactions t where t.account_id = old.id or t.source_account_id = old.id) then
    raise exception 'La cuenta ya tiene movimientos: su moneda no se puede cambiar.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.account_currency_fixed() from public, anon, authenticated;
create trigger account_currency_fixed
  before update of currency on public.accounts
  for each row execute function private.account_currency_fixed();

-- La app pregunta por esta función antes de ofrecer cuentas en otra moneda.
create function public.account_currencies_ready() returns boolean
language sql immutable set search_path = '' as $$ select true $$;
revoke all on function public.account_currencies_ready() from public, anon, authenticated;
grant execute on function public.account_currencies_ready() to authenticated;
