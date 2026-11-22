-- Periodicidad a la medida: cada cuántos días, semanas, meses o años.
--
-- Los valores de la 0017 siguen siendo los mismos: lo que ya existe no cambia. Lo nuevo se escribe
-- como unidad y cantidad: d3 (cada 3 días), w2 (cada 14 días exactos), m4 (cada 4 meses), y1 (cada
-- año). La quincena de días fijos (15 y 30) sigue siendo 'biweekly'.

alter table public.bills drop constraint bills_every_check;
alter table public.bills add constraint bills_every_check check (
  every in ('daily', 'every2', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual')
  or every ~ '^(d([3-9]|[1-9][0-9])|w([1-9]|[1-4][0-9]|5[0-2])|m([45789]|[1-9][0-9])|y([1-9]|10))$'
);

alter table public.goals drop constraint goals_plan_every_check;
alter table public.goals add constraint goals_plan_every_check check (
  plan_every in ('daily', 'every2', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual')
  or plan_every ~ '^(d([3-9]|[1-9][0-9])|w([1-9]|[1-4][0-9]|5[0-2])|m([45789]|[1-9][0-9])|y([1-9]|10))$'
);

alter table public.incomes drop constraint incomes_every_check;
alter table public.incomes add constraint incomes_every_check check (
  every in ('daily', 'every2', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual')
  or every ~ '^(d([3-9]|[1-9][0-9])|w([1-9]|[1-4][0-9]|5[0-2])|m([45789]|[1-9][0-9])|y([1-9]|10))$'
);

-- La app pregunta por esta función antes de ofrecer las periodicidades nuevas.
create function public.custom_periods_ready() returns boolean
language sql immutable set search_path = '' as $$ select true $$;
revoke all on function public.custom_periods_ready() from public, anon, authenticated;
grant execute on function public.custom_periods_ready() to authenticated;
