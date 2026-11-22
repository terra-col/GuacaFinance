-- Cómo se dividió un gasto (iguales, montos, porcentajes, partes o ajustes), para volver a abrirlo
-- igual al editarlo. Lo que manda siguen siendo los pesos de shared_shares: esto no se suma nunca.
-- Sin esta migración las cinco formas funcionan igual; al editar se abren como montos.

alter table public.shared_entries
  add column split jsonb check (
    split is null or (
      jsonb_typeof(split) = 'object'
      and coalesce(split ->> 'mode', '') in ('equal', 'exact', 'percent', 'shares', 'adjust')
      and coalesce(jsonb_typeof(split -> 'parts'), '') = 'array'
      and length(split::text) <= 6000
    )
  );

-- Crea o edita un gasto junto con la forma en que se dividió. Los permisos y las validaciones son
-- los de shared_add_entry y shared_update_entry.
create function public.shared_save_expense(
  p_entry uuid,
  p_group uuid,
  p_description text,
  p_category text,
  p_amount bigint,
  p_paid_by uuid,
  p_occurred_on date,
  p_shares jsonb,
  p_split jsonb,
  p_account uuid default null,
  p_tx uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_entry uuid;
begin
  if p_entry is null then
    v_entry := public.shared_add_entry(p_group, 'expense', p_description, p_category, p_amount, p_paid_by, p_occurred_on, p_shares, p_account, p_tx);
  else
    v_entry := public.shared_update_entry(p_entry, p_description, p_category, p_amount, p_paid_by, p_occurred_on, p_shares, p_account);
  end if;
  update public.shared_entries set split = p_split where id = v_entry and kind = 'expense';
  return v_entry;
end;
$$;

revoke all on function public.shared_save_expense(uuid, uuid, text, text, bigint, uuid, date, jsonb, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.shared_save_expense(uuid, uuid, text, text, bigint, uuid, date, jsonb, jsonb, uuid, uuid) to authenticated;
