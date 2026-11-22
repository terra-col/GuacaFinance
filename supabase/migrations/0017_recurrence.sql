-- Cada cuánto se repite un pago fijo o el abono de una meta: diario, cada 2 días, quincenal,
-- mensual (lo de siempre, por defecto), bimestral, trimestral o semestral.
--
-- starts_on / plan_start: desde cuándo aplica esa periodicidad. En las de días y en las de varios
-- meses también es la fecha desde la que se cuenta. En quincenal los días salen de due_day /
-- plan_day: 5 es «5 y 20», 15 es «15 y 30», 31 es «15 y último día».
--
-- Lo mensual se sigue marcando por mes (for_month). Lo demás se marca por fecha (for_date).

alter table public.bills
  add column every text not null default 'monthly'
    check (every in ('daily', 'every2', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual')),
  add column starts_on date,
  add constraint bills_every_needs_start check (every = 'monthly' or starts_on is not null);

alter table public.goals
  add column plan_every text not null default 'monthly'
    check (plan_every in ('daily', 'every2', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual')),
  add column plan_start date,
  add constraint goals_every_needs_start check (plan_every = 'monthly' or plan_start is not null);

alter table public.transactions add column for_date date;
alter table public.goal_deposits add column for_date date;

-- «Esta vez no aplica». Aparte de checklist_skips, que admite una sola omisión por mes.
create table public.date_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_type text not null check (item_type in ('bill', 'goal')),
  item_id uuid not null,
  for_date date not null,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id, for_date)
);

alter table public.date_skips enable row level security;
create policy "date_skips: solo el dueño" on public.date_skips
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.date_skips from public, anon, authenticated;
grant select, insert, update, delete on public.date_skips to authenticated;

-- El calendario suscrito necesita la periodicidad. Cambia lo que devuelve, así que se crea de nuevo.
drop function public.calendar_feed(text);
create function public.calendar_feed(p_token text)
returns table (id uuid, name text, kind text, due_day smallint, monthly_payment bigint, every text, starts_on date)
language sql stable security definer set search_path = '' as $$
  with owner as (select public.token_owner(p_token, 'calendar') as uid)
  select a.id, a.name, a.kind, a.due_day, a.monthly_payment, 'monthly'::text, null::date
  from public.accounts a, owner
  where a.user_id = owner.uid and a.kind in ('credit_card', 'loan') and a.due_day is not null
  union all
  select b.id, b.name, 'bill', b.due_day, b.amount, b.every, b.starts_on
  from public.bills b, owner
  where b.user_id = owner.uid
  order by 4, 2;
$$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
