-- v1.4: exige modelo ou patrimônio para novos chamados de Equipamentos.
begin;

alter table public.tickets
  add column if not exists asset_identifier text;

create or replace function public.require_equipment_identifier()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category = 'Equipamentos'
     and nullif(trim(coalesce(new.asset_identifier, '')), '') is null then
    raise exception 'Informe o modelo ou patrimônio do equipamento.';
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_require_equipment_identifier on public.tickets;
create trigger tickets_require_equipment_identifier
before insert or update of category, asset_identifier on public.tickets
for each row execute function public.require_equipment_identifier();

select pg_notify('pgrst', 'reload schema');
commit;
