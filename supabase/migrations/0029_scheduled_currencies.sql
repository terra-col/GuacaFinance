-- Pagos fijos e ingresos en otra moneda: una suscripción en dólares, un arriendo en euros, un
-- sueldo en dírhams. Como en los movimientos (0026), el peso sigue siendo la moneda de todo:
--
--   * `amount` sigue en pesos: lo que suman el plan del mes y la lista. La app lo recalcula con la
--     tasa de hoy cuando la tiene; si no, queda el de la tasa con que se guardó.
--   * `original_amount` es el valor en su moneda y `rate`, la tasa con que se guardó.
--   * Valor variable en otra moneda: la moneda queda, sin valor ni tasa.
--   * Al marcarlo pagado o recibido, el movimiento se registra en su moneda con la tasa de ese día.

alter table public.bills
  add column currency text not null default 'COP' check (currency in ('COP', 'USD', 'EUR', 'AED')),
  add column original_amount numeric(16, 2),
  add column rate numeric(14, 4),
  add constraint bills_currency_amount_check check (
    (currency = 'COP' and original_amount is null and rate is null)
    or (currency <> 'COP' and original_amount is null and rate is null and amount is null)
    or (currency <> 'COP' and original_amount is not null and rate is not null and amount is not null
        and original_amount > 0 and rate > 0 and abs(amount - round(original_amount * rate)) <= 1)
  );

alter table public.incomes
  add column currency text not null default 'COP' check (currency in ('COP', 'USD', 'EUR', 'AED')),
  add column original_amount numeric(16, 2),
  add column rate numeric(14, 4),
  add constraint incomes_currency_amount_check check (
    (currency = 'COP' and original_amount is null and rate is null)
    or (currency <> 'COP' and original_amount is null and rate is null and amount is null)
    or (currency <> 'COP' and original_amount is not null and rate is not null and amount is not null
        and original_amount > 0 and rate > 0 and abs(amount - round(original_amount * rate)) <= 1)
  );
