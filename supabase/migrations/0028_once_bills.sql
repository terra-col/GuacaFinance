-- Pagos de una sola vez: la matrícula, el SOAT, un impuesto. Como los ingresos de una sola vez
-- (0008): un mes y un día; solo aparecen ese mes y después no vuelven.

alter table public.bills
  add column once_month text check (once_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  add constraint bills_once_is_monthly check (once_month is null or every = 'monthly');

-- El calendario suscrito: un pago de una sola vez solo en su mes, y nada cuando ya pasó.
-- Cambia lo que devuelve, así que se crea de nuevo.
drop function public.calendar_feed(text);
create function public.calendar_feed(p_token text)
returns table (id uuid, name text, kind text, due_day smallint, monthly_payment bigint, every text, starts_on date, once_month text)
language sql stable security definer set search_path = '' as $$
  with owner as (select public.token_owner(p_token, 'calendar') as uid)
  select a.id, a.name, a.kind, a.due_day, a.monthly_payment, 'monthly'::text, null::date, null::text
  from public.accounts a, owner
  where a.user_id = owner.uid and a.kind in ('credit_card', 'loan') and a.due_day is not null
  union all
  select b.id, b.name, 'bill', b.due_day, b.amount, b.every, b.starts_on, b.once_month
  from public.bills b, owner
  where b.user_id = owner.uid and b.ended_month is null
    and (b.once_month is null or b.once_month >= to_char(now() at time zone 'America/Bogota', 'YYYY-MM'))
  union all
  select h.id, h.name, 'bill', h.due_day, h.amount, h.every, h.starts_on, null::text
  from public.house_bills h
  join public.shared_groups g on g.id = h.group_id and g.house and g.deleted_at is null
  join public.shared_members m on m.id = h.responsible and m.removed_at is null
  join owner on owner.uid = m.user_id
  where h.ended_month is null
  order by 4, 2;
$$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
