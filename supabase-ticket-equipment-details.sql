-- v1.4.1: separa modelo e número de patrimônio nos chamados de Equipamentos.
begin;

alter table public.tickets
  add column if not exists equipment_model text,
  add column if not exists asset_number text;

create or replace function public.require_equipment_identifier()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category = 'Equipamentos'
     and (nullif(trim(coalesce(new.equipment_model, '')), '') is null
       or nullif(trim(coalesce(new.asset_number, '')), '') is null) then
    raise exception 'Informe o modelo e o número de patrimônio do equipamento.';
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_require_equipment_identifier on public.tickets;
create trigger tickets_require_equipment_identifier
before insert or update of category, equipment_model, asset_number on public.tickets
for each row execute function public.require_equipment_identifier();

select pg_notify('pgrst', 'reload schema');
commit;
