-- Metas que se pagan o se juntan en un solo pago (ej.: devolverle a alguien todo el 31 de diciembre).
-- No llevan abonos mensuales: aparecen una vez en Pagos, en su fecha, y no se miden por ritmo.

alter table public.goals
  add column plan_once boolean not null default false,
  -- Un solo pago o abonos mensuales, no ambos.
  add constraint goals_plan_once_alone check (not plan_once or plan_amount is null);
