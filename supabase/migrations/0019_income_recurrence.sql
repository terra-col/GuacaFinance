-- Ingresos con la misma periodicidad de los pagos fijos (salario quincenal en un solo ingreso).
-- «Algunos meses» y «una sola vez» siguen siendo mensuales.

alter table public.incomes
  add column every text not null default 'monthly'
    check (every in ('daily', 'every2', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual')),
  add column starts_on date,
  add constraint incomes_every_needs_start check (every = 'monthly' or starts_on is not null),
  add constraint incomes_every_alone check (every = 'monthly' or (months is null and once_month is null));

-- «Esta vez no llega».
alter table public.date_skips drop constraint date_skips_item_type_check;
alter table public.date_skips
  add constraint date_skips_item_type_check check (item_type in ('bill', 'goal', 'income'));
