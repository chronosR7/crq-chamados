-- Correções operacionais para instalações antigas do banco CRQ-12.
-- Execute uma vez no SQL Editor do Supabase.
begin;

-- Notificações acompanham a exclusão definitiva do chamado.
alter table public.notifications drop constraint if exists notifications_ticket_id_fkey;
alter table public.notifications
  add constraint notifications_ticket_id_fkey
  foreign key (ticket_id) references public.tickets(id) on delete cascade;

-- Garante geração automática do ID de departamentos em esquemas UUID,
-- numéricos ou textuais.
do $$
declare
  v_type text;
  v_max bigint;
begin
  select format_type(a.atttypid, a.atttypmod) into v_type
  from pg_attribute a
  where a.attrelid = 'public.departments'::regclass
    and a.attname = 'id' and not a.attisdropped;

  if v_type = 'uuid' then
    execute 'alter table public.departments alter column id set default gen_random_uuid()';
  elsif v_type in ('integer', 'bigint', 'smallint') then
    create sequence if not exists public.departments_id_seq;
    execute 'select coalesce(max(id::bigint), 0) from public.departments' into v_max;
    perform setval('public.departments_id_seq', v_max + 1, false);
    alter sequence public.departments_id_seq owned by public.departments.id;
    execute 'alter table public.departments alter column id set default nextval(''public.departments_id_seq''::regclass)';
  elsif v_type in ('text', 'character varying', 'character') then
    execute 'alter table public.departments alter column id set default gen_random_uuid()::text';
  else
    raise exception 'Tipo de departments.id não suportado: %', v_type;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
