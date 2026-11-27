-- El valor de un mes. Cuando llega el extracto de la tarjeta, el recibo de un servicio o se sabe
-- cuánto va a entrar de un ingreso variable, se anota cuánto va a ser ese mes. El valor de siempre
-- no cambia: el mes siguiente vuelve a ser el de siempre (o «variable»).
--
--   * Solo para lo que es mensual: un pago fijo, la cuota de una tarjeta o un crédito, un ingreso.
--   * Uno por mes y por cosa. Al marcarlo pagado, ese es el valor que se propone.
--   * Solo de quien lo tiene, y solo sobre sus propios pagos, deudas e ingresos.

create table public.planned_amounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_type text not null check (item_type in ('bill', 'debt', 'income')),
  item_id uuid not null,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_type, item_id, month)
);

alter table public.planned_amounts enable row level security;
create policy "planned_amounts: solo el dueño" on public.planned_amounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and case item_type
      when 'bill' then exists (select 1 from public.bills b where b.id = item_id and b.user_id = (select auth.uid()))
      when 'debt' then exists (select 1 from public.accounts a where a.id = item_id and a.user_id = (select auth.uid()) and a.kind in ('credit_card', 'loan'))
      when 'income' then exists (select 1 from public.incomes i where i.id = item_id and i.user_id = (select auth.uid()))
      else false
    end
  );
revoke all on public.planned_amounts from public, anon, authenticated;
grant select, insert, update, delete on public.planned_amounts to authenticated;

-- Si se borra el pago fijo, la cuenta o el ingreso, sus valores por mes se van con él.
create function private.drop_planned_amounts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.planned_amounts
  where item_id = old.id
    and item_type = case tg_table_name when 'bills' then 'bill' when 'accounts' then 'debt' else 'income' end;
  return old;
end;
$$;
revoke all on function private.drop_planned_amounts() from public, anon, authenticated;
create trigger drop_planned_amounts after delete on public.bills for each row execute function private.drop_planned_amounts();
create trigger drop_planned_amounts after delete on public.accounts for each row execute function private.drop_planned_amounts();
create trigger drop_planned_amounts after delete on public.incomes for each row execute function private.drop_planned_amounts();
