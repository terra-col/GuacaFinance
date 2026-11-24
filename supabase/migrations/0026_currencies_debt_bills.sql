-- Divisas y pagos fijos que son la cuota de una tarjeta o un crédito.
--
--   * El peso sigue siendo la moneda de todo: saldos, totales y deudas compartidas se suman en pesos.
--     Un movimiento o un gasto compartido en USD, EUR o AED guarda además su valor original y la tasa
--     con la que se pasó a pesos el día que se anotó. Esa tasa no cambia después.
--   * El valor en pesos tiene que ser el original por la tasa (redondeado al peso).
--   * Un pago fijo con pays_account es la cuota de esa deuda: marcarlo es un pago que baja la deuda,
--     no un gasto. Solo puede apuntar a una tarjeta o un crédito de quien lo tiene.

alter table public.transactions
  add column currency text not null default 'COP' check (currency in ('COP', 'USD', 'EUR', 'AED')),
  add column original_amount numeric(16, 2),
  add column rate numeric(14, 4),
  add constraint transactions_currency_amount_check check (
    (currency = 'COP' and original_amount is null and rate is null)
    or (currency <> 'COP' and original_amount > 0 and rate > 0 and abs(amount - round(original_amount * rate)) <= 1)
  );

alter table public.shared_entries
  add column currency text not null default 'COP' check (currency in ('COP', 'USD', 'EUR', 'AED')),
  add column original_amount numeric(16, 2),
  add column rate numeric(14, 4),
  add constraint shared_entries_currency_amount_check check (
    (currency = 'COP' and original_amount is null and rate is null)
    or (currency <> 'COP' and original_amount > 0 and rate > 0 and abs(amount - round(original_amount * rate)) <= 1)
  );

-- La moneda en que se pagó un gasto del grupo: la pone quien lo anotó o quien pagó, como al editarlo.
create function public.shared_entry_currency(p_entry uuid, p_currency text, p_original numeric, p_rate numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.shared_entries;
  v_me uuid;
begin
  select * into v_entry from public.shared_entries where id = p_entry for update;
  v_me := private.shared_me(v_entry.group_id);
  if not (v_entry.created_by is not distinct from auth.uid() or v_entry.paid_by = v_me) then
    raise exception 'Solo quien lo registró o quien pagó puede editarlo.';
  end if;
  update public.shared_entries set
    currency = coalesce(p_currency, 'COP'),
    original_amount = case when coalesce(p_currency, 'COP') = 'COP' then null else p_original end,
    rate = case when coalesce(p_currency, 'COP') = 'COP' then null else p_rate end
  where id = p_entry;
end;
$$;
revoke all on function public.shared_entry_currency(uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.shared_entry_currency(uuid, text, numeric, numeric) to authenticated;

alter table public.bills add column pays_account uuid references public.accounts (id) on delete set null;

create function private.bill_pays_own_debt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.pays_account is not null and not exists (
    select 1 from public.accounts a
    where a.id = new.pays_account and a.user_id = new.user_id and a.kind in ('credit_card', 'loan')
  ) then
    raise exception 'La cuota debe ser de una de tus tarjetas o créditos.';
  end if;
  return new;
end;
$$;
revoke all on function private.bill_pays_own_debt() from public, anon, authenticated;
create trigger bill_pays_own_debt
  before insert or update of pays_account on public.bills
  for each row execute function private.bill_pays_own_debt();

-- La app pregunta por esta función antes de ofrecer las divisas.
create function public.currencies_ready() returns boolean
language sql immutable set search_path = '' as $$ select true $$;
revoke all on function public.currencies_ready() from public, anon, authenticated;
grant execute on function public.currencies_ready() to authenticated;

-- Si alguien cambia el valor en pesos (editando el grupo, por ejemplo), el original ya no es cierto:
-- se queda solo en pesos. Quien lo edita desde la app vuelve a poner su moneda.
create function private.currency_follows_amount() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.currency <> 'COP' and abs(new.amount - round(new.original_amount * new.rate)) > 1 then
    new.currency := 'COP';
    new.original_amount := null;
    new.rate := null;
  end if;
  return new;
end;
$$;
revoke all on function private.currency_follows_amount() from public, anon, authenticated;
create trigger currency_follows_amount before update of amount on public.transactions
  for each row execute function private.currency_follows_amount();
create trigger currency_follows_amount before update of amount on public.shared_entries
  for each row execute function private.currency_follows_amount();
