-- Dos arreglos de saldos. No cambia ningún saldo que ya exista.
--
-- 1. «Actualizar saldo» guarda el saldo del banco como punto de control: desde ahí se cuenta. Un
--    movimiento anterior que se registre, edite o borre después ya no descuadra la cuenta. Los
--    ajustes anteriores a esta migración siguen siendo una diferencia (checkpoint vacío).
-- 2. Borrar una tarjeta o préstamo ya no le devuelve a la cuenta de origen lo que se le pagó.

alter table public.transactions
  add column checkpoint bigint,
  add constraint transactions_checkpoint_check
    check (checkpoint is null or (checkpoint >= 0 and category is not distinct from 'Ajuste de saldo'));

-- Un punto de control puede coincidir con lo registrado: su diferencia es cero.
alter table public.transactions drop constraint transactions_amount_check;
alter table public.transactions
  add constraint transactions_amount_check check (amount > 0 or (amount = 0 and checkpoint is not null));

create schema if not exists private;

create function private.keep_payments_of_deleted_debt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Al borrar a la persona completa no queda saldo que cuidar.
  if old.kind in ('credit_card', 'loan') and exists (select 1 from auth.users u where u.id = old.user_id) then
    update public.transactions t
    set kind = 'expense',
        account_id = t.source_account_id,
        source_account_id = null,
        category = 'Ajuste de saldo',
        description = 'Pago a ' || old.name || ' (cuenta eliminada)'
    where t.account_id = old.id
      and t.user_id = old.user_id
      and t.kind = 'payment'
      and exists (select 1 from public.accounts a where a.id = t.source_account_id and a.user_id = old.user_id);
  end if;
  return old;
end;
$$;
revoke all on function private.keep_payments_of_deleted_debt() from public, anon, authenticated;

create trigger keep_payments_of_deleted_debt
  before delete on public.accounts
  for each row execute function private.keep_payments_of_deleted_debt();
