-- El mes al que corresponde un pago, cuando no es el de su fecha: el arriendo de diciembre que se
-- paga el 30 de noviembre con el salario, o el salario de diciembre que llega el 30 de noviembre.
-- Vacío (lo normal) significa el mes de la fecha. Solo lo usa la lista de Pagos para marcar.

alter table public.transactions
  add column for_month text check (for_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

alter table public.goal_deposits
  add column for_month text check (for_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
