-- Cuenta favorita para pagos: la que aparece de primera (y ya elegida) al marcar un pago o
-- registrar un gasto. Una sola por persona, y solo una cuenta de ahorros o de efectivo.

alter table public.accounts
  add column favorite boolean not null default false,
  add constraint accounts_favorite_holds_money check (not favorite or kind in ('savings', 'cash'));

create unique index accounts_one_favorite on public.accounts (user_id) where favorite;
